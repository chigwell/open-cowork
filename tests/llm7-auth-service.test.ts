import { describe, expect, it, vi } from 'vitest';

import type { AppConfig, ConfigStore } from '../src/main/config/config-store';
import { Llm7AuthService, __llm7AuthInternals } from '../src/main/auth/llm7-auth-service';
import {
  LLM7_API_BASE_URL,
  LLM7_BALANCE_API_BASE_URL,
  LLM7_DEFAULT_MODEL,
} from '../src/shared/llm7-auth';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const customOpenAiProfile = {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: LLM7_DEFAULT_MODEL,
  };

  return {
    provider: 'openrouter',
    customProtocol: 'anthropic',
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4-6',
    activeProfileKey: 'openrouter',
    profiles: {
      openrouter: {
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-sonnet-4-6',
      },
      anthropic: { apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
      openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: LLM7_DEFAULT_MODEL },
      gemini: {
        apiKey: '',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-2.5-flash',
      },
      ollama: { apiKey: '', baseUrl: 'http://localhost:11434/v1', model: '' },
      'custom:anthropic': {
        apiKey: '',
        baseUrl: 'https://open.bigmodel.cn/api/anthropic',
        model: 'glm-5',
      },
      'custom:openai': customOpenAiProfile,
      'custom:gemini': {
        apiKey: '',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-2.5-flash',
      },
    },
    activeConfigSetId: 'default',
    configSets: [
      {
        id: 'default',
        name: 'Default',
        isSystem: true,
        provider: 'openrouter',
        customProtocol: 'anthropic',
        activeProfileKey: 'openrouter',
        profiles: {
          openrouter: {
            apiKey: '',
            baseUrl: 'https://openrouter.ai/api/v1',
            model: 'anthropic/claude-sonnet-4-6',
          },
          'custom:openai': customOpenAiProfile,
        },
        enableThinking: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    enableDevLogs: false,
    theme: 'light',
    sandboxEnabled: false,
    memoryEnabled: true,
    memoryRuntime: {
      llm: { inheritFromActive: true, apiKey: '', baseUrl: '', model: '', timeoutMs: 180000 },
      embedding: {
        inheritFromActive: true,
        apiKey: '',
        baseUrl: '',
        model: 'text-embedding-3-small',
        timeoutMs: 180000,
      },
      useEmbedding: false,
      maxNavSteps: 2,
      ingestionConcurrency: 4,
    },
    enableThinking: false,
    isConfigured: false,
    ...overrides,
  };
}

function makeStore(initialConfig: AppConfig): ConfigStore {
  let config = initialConfig;
  return {
    getAll: vi.fn(() => config),
    update: vi.fn((updates: Partial<AppConfig>) => {
      config = { ...config, ...updates };
    }),
  } as unknown as ConfigStore;
}

describe('Llm7AuthService', () => {
  it('exchanges a Google credential, chooses a default model, and applies config', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/auth/google')) {
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(JSON.stringify({ credential: 'google-credential' }));
        return jsonResponse({
          auth_token: 'llm7-account-token',
          email: 'user@example.com',
          sub: 42,
        });
      }
      if (href.endsWith('/verify')) {
        expect(init?.headers).toEqual({ Authorization: 'Bearer llm7-account-token' });
        return jsonResponse({ email: 'user@example.com', sub: '42' });
      }
      if (href.endsWith('/tokens')) {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          Authorization: 'Bearer llm7-account-token',
        });
        expect(JSON.parse(String(init?.body))).toEqual(
          expect.objectContaining({ name: 'Open Cowork Desktop' })
        );
        return jsonResponse({ token: 'llm7-generated-api-key' });
      }
      if (href.endsWith('/models')) {
        expect(init?.headers).toEqual({ Authorization: 'Bearer llm7-generated-api-key' });
        return jsonResponse({
          data: [
            {
              id: 'deepseek-v4-flash',
              schema_endpoints: ['openai'],
              stream: true,
              tools_calling: true,
            },
            {
              id: LLM7_DEFAULT_MODEL,
              schema_endpoints: ['openai'],
              stream: true,
              tools_calling: true,
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as unknown as typeof fetch;

    const store = makeStore(makeConfig());
    const service = new Llm7AuthService(store, fetchMock);

    const result = await service.signInWithGoogleCredential('google-credential');

    expect(result.status).toEqual({
      isAuthenticated: true,
      email: 'user@example.com',
      sub: '42',
      configuredModel: LLM7_DEFAULT_MODEL,
    });
    expect(store.update).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'custom',
        customProtocol: 'openai',
        activeProfileKey: 'custom:openai',
        apiKey: 'llm7-generated-api-key',
        baseUrl: LLM7_API_BASE_URL,
        model: LLM7_DEFAULT_MODEL,
        isConfigured: true,
        llm7AuthToken: 'llm7-account-token',
        llm7UserEmail: 'user@example.com',
        llm7UserSub: '42',
      })
    );
  });

  it('rejects auth responses without auth_token', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ email: 'user@example.com' })
    ) as unknown as typeof fetch;
    const service = new Llm7AuthService(makeStore(makeConfig()), fetchMock);

    await expect(service.exchangeGoogleCredential('google-credential')).rejects.toThrow(
      'Missing auth token'
    );
  });

  it('clears stored LLM7 account session when account verification fails', async () => {
    const config = makeConfig({
      llm7AuthToken: 'expired-account-token',
      llm7UserEmail: 'user@example.com',
      llm7UserSub: '42',
      configSets: [
        {
          id: 'default',
          name: 'Default',
          isSystem: true,
          provider: 'custom',
          customProtocol: 'openai',
          activeProfileKey: 'custom:openai',
          profiles: {
            'custom:openai': {
              apiKey: 'llm7-generated-api-key',
              baseUrl: LLM7_API_BASE_URL,
              model: LLM7_DEFAULT_MODEL,
            },
          },
          enableThinking: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const store = makeStore(config);
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: 'Invalid token' }, 401)
    ) as unknown as typeof fetch;
    const service = new Llm7AuthService(store, fetchMock);

    const result = await service.getStatus();

    expect(result).toEqual({ status: { isAuthenticated: false }, configChanged: true });
    expect(store.update).toHaveBeenCalledWith({
      llm7AuthToken: '',
      llm7UserEmail: '',
      llm7UserSub: '',
    });
  });

  it('extracts generated API keys from supported token response shapes', () => {
    expect(__llm7AuthInternals.extractApiKey({ token: 'token-value' })).toBe('token-value');
    expect(__llm7AuthInternals.extractApiKey({ api_key: 'api-key-value' })).toBe('api-key-value');
    expect(__llm7AuthInternals.extractApiKey({ key: 'key-value' })).toBe('key-value');
  });

  it('loads balance with the generated LLM7 API key', async () => {
    const config = makeConfig({
      configSets: [
        {
          id: 'default',
          name: 'Default',
          isSystem: true,
          provider: 'custom',
          customProtocol: 'openai',
          activeProfileKey: 'custom:openai',
          profiles: {
            'custom:openai': {
              apiKey: 'llm7-generated-api-key',
              baseUrl: LLM7_API_BASE_URL,
              model: LLM7_DEFAULT_MODEL,
            },
          },
          enableThinking: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${LLM7_BALANCE_API_BASE_URL}/balance`);
      expect(init?.headers).toEqual({ Authorization: 'Bearer llm7-generated-api-key' });
      return jsonResponse({
        email: 'user@example.com',
        balance_usd: '10.50000000',
        subscription_allowance_remaining_percent: '73.4',
      });
    }) as unknown as typeof fetch;
    const service = new Llm7AuthService(makeStore(config), fetchMock);

    await expect(service.getBalance()).resolves.toEqual({
      email: 'user@example.com',
      balanceUsd: '10.50000000',
      subscriptionAllowanceRemainingPercent: 73.4,
      updatedAt: expect.any(Number),
    });
  });

  it('does not call the balance endpoint without a stored LLM7 API key', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const service = new Llm7AuthService(makeStore(makeConfig()), fetchMock);

    await expect(service.getBalance()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers gpt-5.4 and falls back to the first OpenAI-compatible streaming tool model', () => {
    expect(
      __llm7AuthInternals.pickDefaultModel([
        { id: 'other', schema_endpoints: ['openai'], stream: true, tools_calling: true },
        { id: LLM7_DEFAULT_MODEL, schema_endpoints: ['openai'], stream: true, tools_calling: true },
      ])
    ).toBe(LLM7_DEFAULT_MODEL);

    expect(
      __llm7AuthInternals.pickDefaultModel([
        { id: 'no-tools', schema_endpoints: ['openai'], stream: true, tools_calling: false },
        { id: 'tool-model', schema_endpoints: ['openai'], stream: true, tools_calling: true },
      ])
    ).toBe('tool-model');

    expect(__llm7AuthInternals.pickDefaultModel([])).toBe(LLM7_DEFAULT_MODEL);
  });
});
