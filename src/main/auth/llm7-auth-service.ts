import type { AppConfig, ApiConfigSet, ConfigStore, ProviderProfile } from '../config/config-store';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  LLM7_AUTH_API_ORIGIN,
  LLM7_API_BASE_URL,
  LLM7_BALANCE_API_BASE_URL,
  LLM7_DEFAULT_MODEL,
  LLM7_GOOGLE_CLIENT_ID,
} from '../../shared/llm7-auth';

export interface Llm7AuthStatus {
  isAuthenticated: boolean;
  email?: string;
  sub?: string;
  configuredModel?: string;
}

export interface Llm7SignInResult {
  success: true;
  config: AppConfig;
  status: Llm7AuthStatus;
}

export interface Llm7AuthStatusResult {
  status: Llm7AuthStatus;
  configChanged: boolean;
}

export interface Llm7Balance {
  email?: string;
  balanceUsd: string;
  subscriptionAllowanceRemainingPercent?: number;
  updatedAt: number;
}

interface Llm7VerifyResponse {
  email?: string;
  sub?: string | number;
}

interface Llm7GoogleAuthResponse extends Llm7VerifyResponse {
  auth_token?: string;
}

interface Llm7CreateTokenResponse {
  token?: string;
  api_key?: string;
  key?: string;
}

interface Llm7ModelInfo {
  id?: string;
  schema_endpoints?: string[];
  stream?: boolean;
  tools_calling?: boolean;
}

interface Llm7ModelsResponse {
  data?: Llm7ModelInfo[];
}

interface Llm7BalanceResponse {
  email?: string;
  balance_usd?: string | number;
  subscription_allowance_remaining_percent?: string | number;
}

interface GoogleOAuthTokenResponse {
  auth_token?: string;
  email?: string;
  sub?: string | number;
}

interface GoogleOAuthCallbackListener {
  redirectUri: string;
  waitForCode: () => Promise<string>;
  close: () => Promise<void>;
}

type FetchLike = typeof fetch;
type OpenExternal = (url: string) => Promise<unknown> | unknown;

const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = 'openid email profile';
const GOOGLE_OAUTH_CALLBACK_PATH = '/llm7/oauth/callback';
const GOOGLE_OAUTH_TIMEOUT_MS = 2 * 60 * 1000;

class Llm7AuthHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'Llm7AuthHttpError';
  }
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function isLlm7BaseUrl(value: string | undefined): boolean {
  return normalizeBaseUrl(value) === LLM7_API_BASE_URL;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Keep the default message below.
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : fallbackMessage;
    throw new Llm7AuthHttpError(message, response.status);
  }

  return data as T;
}

function pickDefaultModel(models: Llm7ModelInfo[] | undefined): string {
  if (!Array.isArray(models) || models.length === 0) {
    return LLM7_DEFAULT_MODEL;
  }

  if (models.some((model) => model.id === LLM7_DEFAULT_MODEL)) {
    return LLM7_DEFAULT_MODEL;
  }

  const compatible = models.find(
    (model) =>
      typeof model.id === 'string' &&
      model.id.trim() &&
      model.schema_endpoints?.includes('openai') &&
      model.stream === true &&
      model.tools_calling === true
  );
  if (compatible?.id) {
    return compatible.id;
  }

  return (
    models.find((model) => typeof model.id === 'string' && model.id.trim())?.id ||
    LLM7_DEFAULT_MODEL
  );
}

function isInvalidTokenError(error: unknown): boolean {
  return error instanceof Llm7AuthHttpError && (error.status === 401 || error.status === 403);
}

function findStoredLlm7Profile(config: AppConfig): ProviderProfile | null {
  for (const set of config.configSets) {
    const profile = set.profiles?.['custom:openai'];
    if (profile?.apiKey?.trim() && isLlm7BaseUrl(profile.baseUrl)) {
      return profile;
    }
  }
  return null;
}

function extractApiKey(data: Llm7CreateTokenResponse): string {
  return (data.token || data.api_key || data.key || '').trim();
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function getGoogleOAuthClientId(): string {
  return (process.env.OPEN_COWORK_LLM7_GOOGLE_CLIENT_ID || LLM7_GOOGLE_CLIENT_ID).trim();
}

function writeOAuthCallbackResponse(
  response: ServerResponse,
  statusCode: number,
  title: string,
  message: string
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 3rem; line-height: 1.5; }
    main { max-width: 36rem; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

async function createGoogleOAuthCallbackListener(
  expectedState: string,
  timeoutMs = GOOGLE_OAUTH_TIMEOUT_MS
): Promise<GoogleOAuthCallbackListener> {
  let settled = false;
  let timeout: NodeJS.Timeout | null = null;
  let resolveCode: (code: string) => void = () => {};
  let rejectCode: (error: Error) => void = () => {};

  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const settleSuccess = (server: Server, code: string) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    resolveCode(code);
    void closeServer(server);
  };

  const settleError = (server: Server, error: Error) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    rejectCode(error);
    void closeServer(server);
  };

  const server = createServer((request, response) => {
    const parsedUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (parsedUrl.pathname !== GOOGLE_OAUTH_CALLBACK_PATH) {
      writeOAuthCallbackResponse(response, 404, 'Not found', 'Return to Open Cowork and retry.');
      return;
    }

    const state = parsedUrl.searchParams.get('state') || '';
    if (state !== expectedState) {
      writeOAuthCallbackResponse(
        response,
        400,
        'Sign-in blocked',
        'The OAuth state did not match. Return to Open Cowork and retry.'
      );
      settleError(server, new Error('Google sign-in failed: invalid OAuth state'));
      return;
    }

    const oauthError = parsedUrl.searchParams.get('error');
    if (oauthError) {
      const description = parsedUrl.searchParams.get('error_description') || oauthError;
      writeOAuthCallbackResponse(
        response,
        400,
        'Sign-in cancelled',
        'Google did not complete sign-in. You can close this tab and return to Open Cowork.'
      );
      settleError(server, new Error(`Google sign-in failed: ${description}`));
      return;
    }

    const code = parsedUrl.searchParams.get('code');
    if (!code) {
      writeOAuthCallbackResponse(
        response,
        400,
        'Sign-in failed',
        'Google did not return an authorization code. Return to Open Cowork and retry.'
      );
      settleError(server, new Error('Google sign-in failed: missing authorization code'));
      return;
    }

    writeOAuthCallbackResponse(
      response,
      200,
      'Sign-in complete',
      'You can close this tab and return to Open Cowork.'
    );
    settleSuccess(server, code);
  });

  const redirectUri = await new Promise<string>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      if (!address?.port) {
        reject(new Error('Could not start Google sign-in callback listener'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}${GOOGLE_OAUTH_CALLBACK_PATH}`);
    });
  });

  timeout = setTimeout(() => {
    settleError(server, new Error('Timed out waiting for Google sign-in'));
  }, timeoutMs);

  return {
    redirectUri,
    waitForCode: () => codePromise,
    close: () => closeServer(server),
  };
}

function clearLlm7Profiles(config: AppConfig): ApiConfigSet[] {
  return config.configSets.map((set) => {
    const profile = set.profiles?.['custom:openai'];
    if (!profile?.apiKey?.trim() || !isLlm7BaseUrl(profile.baseUrl)) {
      return set;
    }

    return {
      ...set,
      profiles: {
        ...set.profiles,
        'custom:openai': {
          ...profile,
          apiKey: '',
        },
      },
      updatedAt: new Date().toISOString(),
    };
  });
}

export class Llm7AuthService {
  constructor(
    private readonly store: ConfigStore,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async exchangeGoogleCredential(credential: string): Promise<Llm7GoogleAuthResponse> {
    const trimmed = credential.trim();
    if (!trimmed) {
      throw new Error('Missing Google credential');
    }

    const response = await this.fetchImpl(`${LLM7_AUTH_API_ORIGIN}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: trimmed }),
    });
    const data = await readJsonResponse<Llm7GoogleAuthResponse>(
      response,
      'Failed to authenticate with LLM7'
    );
    if (!data.auth_token?.trim()) {
      throw new Error('Missing auth token');
    }
    return data;
  }

  async exchangeGoogleAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<Llm7GoogleAuthResponse> {
    const response = await this.fetchImpl(`${LLM7_AUTH_API_ORIGIN}/auth/google/desktop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri,
      }),
    });
    const data = await readJsonResponse<GoogleOAuthTokenResponse>(
      response,
      'Failed to authenticate desktop Google sign-in with LLM7'
    );
    if (!data.auth_token?.trim()) {
      throw new Error('Missing auth token');
    }
    return data;
  }

  async verifyToken(token: string): Promise<Llm7VerifyResponse> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error('Missing auth token');
    }

    const response = await this.fetchImpl(`${LLM7_AUTH_API_ORIGIN}/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    return readJsonResponse<Llm7VerifyResponse>(response, 'Failed to verify LLM7 token');
  }

  async fetchDefaultModel(token: string): Promise<string> {
    try {
      const response = await this.fetchImpl(`${LLM7_API_BASE_URL}/models`, {
        method: 'GET',
        headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined,
      });
      const data = await readJsonResponse<Llm7ModelsResponse>(
        response,
        'Failed to load LLM7 models'
      );
      return pickDefaultModel(data.data);
    } catch {
      return LLM7_DEFAULT_MODEL;
    }
  }

  async createApiToken(authToken: string): Promise<string> {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const response = await this.fetchImpl(`${LLM7_AUTH_API_ORIGIN}/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken.trim()}`,
      },
      body: JSON.stringify({
        name: 'Open Cowork Desktop',
        expires_at: expiresAt,
      }),
    });
    const data = await readJsonResponse<Llm7CreateTokenResponse>(
      response,
      'Failed to create LLM7 API key'
    );
    const apiKey = extractApiKey(data);
    if (!apiKey) {
      throw new Error('Missing LLM7 API key');
    }
    return apiKey;
  }

  async getBalance(): Promise<Llm7Balance | null> {
    const current = this.store.getAll();
    const profile = findStoredLlm7Profile(current);
    const apiKey = profile?.apiKey?.trim();
    if (!apiKey) {
      return null;
    }

    const response = await this.fetchImpl(`${LLM7_BALANCE_API_BASE_URL}/balance`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await readJsonResponse<Llm7BalanceResponse>(
      response,
      'Failed to load LLM7 balance'
    );
    const balanceUsd =
      data.balance_usd !== undefined && data.balance_usd !== null ? String(data.balance_usd) : '';
    if (!balanceUsd) {
      throw new Error('Missing LLM7 balance');
    }

    const allowance =
      data.subscription_allowance_remaining_percent !== undefined
        ? Number(data.subscription_allowance_remaining_percent)
        : undefined;

    const subscriptionAllowanceRemainingPercent =
      typeof allowance === 'number' && Number.isFinite(allowance) ? allowance : undefined;

    return {
      email: data.email,
      balanceUsd,
      subscriptionAllowanceRemainingPercent,
      updatedAt: Date.now(),
    };
  }

  applyLlm7TokenToConfig(payload: {
    apiKey: string;
    authToken?: string;
    email?: string;
    sub?: string | number;
    model: string;
  }): AppConfig {
    this.store.update({
      provider: 'custom',
      customProtocol: 'openai',
      activeProfileKey: 'custom:openai',
      apiKey: payload.apiKey,
      baseUrl: LLM7_API_BASE_URL,
      model: payload.model.trim() || LLM7_DEFAULT_MODEL,
      isConfigured: true,
      llm7AuthToken: payload.authToken || '',
      llm7UserEmail: payload.email || '',
      llm7UserSub: payload.sub !== undefined ? String(payload.sub) : '',
    });
    return this.store.getAll();
  }

  clearLlm7Credentials(): AppConfig {
    const current = this.store.getAll();
    this.store.update({
      configSets: clearLlm7Profiles(current),
      llm7AuthToken: '',
      llm7UserEmail: '',
      llm7UserSub: '',
    });
    return this.store.getAll();
  }

  clearLlm7AccountSession(): AppConfig {
    this.store.update({
      llm7AuthToken: '',
      llm7UserEmail: '',
      llm7UserSub: '',
    });
    return this.store.getAll();
  }

  async getStatus(): Promise<Llm7AuthStatusResult> {
    const current = this.store.getAll();
    const profile = findStoredLlm7Profile(current);
    const authToken = current.llm7AuthToken?.trim();
    if (!authToken) {
      return { status: { isAuthenticated: false }, configChanged: false };
    }

    try {
      const verified = await this.verifyToken(authToken);
      return {
        status: {
          isAuthenticated: true,
          email: verified.email,
          sub: verified.sub !== undefined ? String(verified.sub) : undefined,
          configuredModel: profile?.model,
        },
        configChanged: false,
      };
    } catch (error) {
      if (isInvalidTokenError(error)) {
        this.clearLlm7AccountSession();
        return { status: { isAuthenticated: false }, configChanged: true };
      }
      throw error;
    }
  }

  async signInWithGoogleCredential(credential: string): Promise<Llm7SignInResult> {
    const auth = await this.exchangeGoogleCredential(credential);
    const authToken = auth.auth_token || '';
    const verified = await this.verifyToken(authToken);
    const apiKey = await this.createApiToken(authToken);
    const model = await this.fetchDefaultModel(apiKey);
    const config = this.applyLlm7TokenToConfig({
      apiKey,
      authToken,
      email: verified.email,
      sub: verified.sub,
      model,
    });

    return {
      success: true,
      config,
      status: {
        isAuthenticated: true,
        email: verified.email,
        sub: verified.sub !== undefined ? String(verified.sub) : undefined,
        configuredModel: model,
      },
    };
  }

  async signInWithGoogleBrowser(openExternal: OpenExternal): Promise<Llm7SignInResult> {
    const clientId = getGoogleOAuthClientId();
    if (!clientId) {
      throw new Error('Missing Google OAuth client ID');
    }

    const state = base64Url(randomBytes(32));
    const { codeVerifier, codeChallenge } = createPkcePair();
    const listener = await createGoogleOAuthCallbackListener(state);

    try {
      const authUrl = new URL(GOOGLE_OAUTH_AUTH_URL);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', listener.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPE);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('prompt', 'select_account');

      const openResult = await openExternal(authUrl.toString());
      if (openResult === false) {
        throw new Error('Could not open the system browser for Google sign-in');
      }

      const code = await listener.waitForCode();
      const credential = await this.exchangeGoogleAuthorizationCode({
        code,
        codeVerifier,
        redirectUri: listener.redirectUri,
      });
      return this.signInWithLlm7Auth(credential);
    } finally {
      await listener.close();
    }
  }

  private async signInWithLlm7Auth(auth: Llm7GoogleAuthResponse): Promise<Llm7SignInResult> {
    const authToken = auth.auth_token || '';
    const verified = await this.verifyToken(authToken);
    const apiKey = await this.createApiToken(authToken);
    const model = await this.fetchDefaultModel(apiKey);
    const config = this.applyLlm7TokenToConfig({
      apiKey,
      authToken,
      email: verified.email,
      sub: verified.sub,
      model,
    });

    return {
      success: true,
      config,
      status: {
        isAuthenticated: true,
        email: verified.email,
        sub: verified.sub !== undefined ? String(verified.sub) : undefined,
        configuredModel: model,
      },
    };
  }
}

export const __llm7AuthInternals = {
  pickDefaultModel,
  isLlm7BaseUrl,
  extractApiKey,
  createPkcePair,
};
