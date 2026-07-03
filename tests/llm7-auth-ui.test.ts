import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const mainPath = path.resolve(process.cwd(), 'src/main/index.ts');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');
const apiConfigStatePath = path.resolve(process.cwd(), 'src/renderer/hooks/useApiConfigState.ts');
const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/Sidebar.tsx');
const useIpcPath = path.resolve(process.cwd(), 'src/renderer/hooks/useIPC.ts');
const modalPath = path.resolve(process.cwd(), 'src/renderer/components/LLM7AuthModal.tsx');
const settingsApiPath = path.resolve(
  process.cwd(),
  'src/renderer/components/settings/SettingsAPI.tsx'
);
const indexPath = path.resolve(process.cwd(), 'index.html');

describe('LLM7 auth onboarding UI wiring', () => {
  it('shows the LLM7 auth modal after initial config status when credentials are missing', () => {
    const source = fs.readFileSync(appPath, 'utf8');

    expect(source).toContain("import { LLM7AuthModal } from './components/LLM7AuthModal';");
    expect(source).toContain('const hasSeenInitialConfigStatus = useAppStore');
    expect(source).toContain('setShowLlm7AuthModal(!isConfigured);');
    expect(source).toContain('window.electronAPI.llm7Auth.getStatus()');
    expect(source).toContain('<LLM7AuthModal');
    expect(source).toContain('onAuthenticated={handleLlm7Authenticated}');
    expect(source).toContain('onUseApiKey={handleUseApiKeyForLlm7}');
  });

  it('starts Google sign-in through the main-process browser flow', () => {
    const source = fs.readFileSync(modalPath, 'utf8');

    expect(source).toContain('window.electronAPI.llm7Auth.signInWithGoogle()');
    expect(source).toContain('onUseApiKey');
    expect(source).not.toContain('https://accounts.google.com/gsi/client');
    expect(source).not.toContain('LLM7_GOOGLE_CLIENT_ID');
    expect(source).not.toContain('window.google');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('document.cookie');
  });

  it('does not allow embedded Google Identity Services in CSP', () => {
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(source).not.toContain('https://accounts.google.com');
  });

  it('opens Google OAuth through the system browser instead of an Electron popup', () => {
    const source = fs.readFileSync(mainPath, 'utf8');

    expect(source).toContain("ipcMain.handle('llm7Auth.signInWithGoogle'");
    expect(source).toContain(
      'llm7AuthService.signInWithGoogleBrowser((url) => shell.openExternal(url))'
    );
    expect(source).not.toContain('isGoogleIdentityPopupUrl');
    expect(source).not.toContain("title: 'Sign in with Google'");
    expect(source).toContain('void shell.openExternal(url);');
  });

  it('wires LLM7 sign out through settings', () => {
    const source = fs.readFileSync(settingsApiPath, 'utf8');

    expect(source).toContain("import { LLM7_API_BASE_URL } from '../../../shared/llm7-auth';");
    expect(source).toContain('const isLlm7Profile =');
    expect(source).toContain('window.electronAPI.llm7Auth.logout()');
    expect(source).toContain("t('llm7Auth.signOut', 'Sign out')");
  });

  it('loads LLM7 model options from the live models endpoint', () => {
    const mainSource = fs.readFileSync(mainPath, 'utf8');
    const hookSource = fs.readFileSync(apiConfigStatePath, 'utf8');
    const settingsSource = fs.readFileSync(settingsApiPath, 'utf8');

    expect(mainSource).toContain(
      "payload.provider === 'custom' && normalizedBaseUrl === LLM7_API_BASE_URL"
    );
    expect(mainSource).toContain('fetch(`${LLM7_API_BASE_URL}/models`');
    expect(hookSource).toContain('const isLlm7ModelEndpoint =');
    expect(hookSource).toContain('const supportsLiveModelRefresh = provider ===');
    expect(hookSource).toContain('const modelOptions = supportsLiveModelRefresh');
    expect(settingsSource).toContain('{supportsLiveModelRefresh && (');
  });

  it('loads and displays LLM7 balance after settings', () => {
    const mainSource = fs.readFileSync(mainPath, 'utf8');
    const preloadSource = fs.readFileSync(preloadPath, 'utf8');
    const sidebarSource = fs.readFileSync(sidebarPath, 'utf8');

    expect(mainSource).toContain("ipcMain.handle('llm7Auth.getBalance'");
    expect(mainSource).toContain('llm7AuthService.getBalance()');
    expect(preloadSource).toContain("ipcRenderer.invoke('llm7Auth.getBalance')");
    expect(sidebarSource).toContain('const showLlm7Balance =');
    expect(sidebarSource).toContain("t('llm7Auth.balance', 'Balance')");
    expect(sidebarSource).toContain('<Wallet className="w-3.5 h-3.5 flex-shrink-0" />');
  });

  it('refreshes LLM7 balance on config load and after each completed session', () => {
    const source = fs.readFileSync(useIpcPath, 'utf8');

    expect(source).toContain('function refreshLlm7Balance()');
    expect(source).toContain('window.electronAPI.llm7Auth');
    expect(source).toContain('.getBalance()');
    expect(source).toContain('void refreshLlm7Balance();');
    expect(source).toContain("event.payload.status !== 'running'");
  });
});
