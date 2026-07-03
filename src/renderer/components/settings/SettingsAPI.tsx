import { useTranslation } from 'react-i18next';
import {
  Key,
  LogOut,
  Plug,
  Server,
  Cpu,
  Loader2,
  Edit3,
  AlertCircle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { useApiConfigState } from '../../hooks/useApiConfigState';
import { ApiConfigSetManager } from '../ApiConfigSetManager';
import { CommonProviderSetupsCard, GuidanceInlineHint } from '../ProviderGuidance';
import ApiDiagnosticsPanel from '../ApiDiagnosticsPanel';
import { useAppStore } from '../../store';
import { LLM7_API_BASE_URL } from '../../../shared/llm7-auth';

interface ModelOptionItem {
  id: string;
  name: string;
}

// ==================== API Settings Tab ====================

export function SettingsAPI() {
  const { t } = useTranslation();
  const setAppConfig = useAppStore((s) => s.setAppConfig);
  const setIsConfigured = useAppStore((s) => s.setIsConfigured);
  const setLlm7Balance = useAppStore((s) => s.setLlm7Balance);
  const setLlm7BalanceError = useAppStore((s) => s.setLlm7BalanceError);
  const [isSigningOutLlm7, setIsSigningOutLlm7] = useState(false);
  const [llm7LogoutMessage, setLlm7LogoutMessage] = useState('');
  const [llm7LogoutError, setLlm7LogoutError] = useState('');
  const {
    provider,
    customProtocol,
    apiKey,
    baseUrl,
    model,
    customModel,
    useCustomModel,
    contextWindow,
    maxTokens,
    modelInputPlaceholder,
    modelInputHint,
    presets,
    currentPreset,
    modelOptions,
    isSaving,
    isLoadingConfig,
    error,
    successMessage,
    isRefreshingModels,
    isDiscoveringLocalOllama,
    enableThinking,
    isOllamaMode,
    requiresApiKey,
    protocolGuidanceText,
    protocolGuidanceTone,
    baseUrlGuidanceText,
    commonProviderSetups,
    configSets,
    activeConfigSetId,
    currentConfigSet,
    pendingConfigSetAction,
    pendingConfigSet,
    hasUnsavedChanges,
    isMutatingConfigSet,
    canDeleteCurrentConfigSet,
    setApiKey,
    setBaseUrl,
    setModel,
    setCustomModel,
    setContextWindow,
    setMaxTokens,
    toggleCustomModel,
    setEnableThinking,
    applyCommonProviderSetup,
    changeProvider,
    changeProtocol,
    requestConfigSetSwitch,
    requestCreateBlankConfigSet,
    cancelPendingConfigSetAction,
    saveAndContinuePendingConfigSetAction,
    discardAndContinuePendingConfigSetAction,
    renameConfigSet,
    deleteConfigSet,
    handleSave,
    refreshModelOptions,
    discoverLocalOllama,
    diagnosticResult,
    isDiagnosing,
    handleDiagnose,
    handleDeepDiagnose,
    supportsLiveModelRefresh,
    shouldShowOllamaManualModelToggle,
  } = useApiConfigState();

  const isLlm7Profile =
    provider === 'custom' &&
    customProtocol === 'openai' &&
    baseUrl.trim().replace(/\/+$/, '') === LLM7_API_BASE_URL;
  const hasLlm7Credentials = isLlm7Profile && Boolean(apiKey.trim());

  const handleLlm7Logout = async () => {
    setIsSigningOutLlm7(true);
    setLlm7LogoutMessage('');
    setLlm7LogoutError('');
    try {
      const result = await window.electronAPI.llm7Auth.logout();
      setAppConfig(result.config);
      setIsConfigured(Boolean(result.config?.isConfigured));
      setLlm7Balance(null);
      setLlm7BalanceError(null);
      setApiKey('');
      setLlm7LogoutMessage(t('llm7Auth.signedOut', 'Signed out of LLM7.'));
    } catch (error) {
      setLlm7LogoutError(
        error instanceof Error
          ? error.message
          : t('llm7Auth.signOutFailed', 'Could not sign out of LLM7.')
      );
    } finally {
      setIsSigningOutLlm7(false);
    }
  };

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="ml-2 text-text-secondary">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Config Set Switcher */}
      <ApiConfigSetManager
        configSets={configSets}
        activeConfigSetId={activeConfigSetId}
        currentConfigSet={currentConfigSet}
        pendingConfigSetAction={pendingConfigSetAction}
        pendingConfigSet={pendingConfigSet}
        hasUnsavedChanges={hasUnsavedChanges}
        isMutatingConfigSet={isMutatingConfigSet}
        isSaving={isSaving}
        canDeleteCurrentConfigSet={canDeleteCurrentConfigSet}
        onSwitchSet={requestConfigSetSwitch}
        onRequestCreateBlankSet={requestCreateBlankConfigSet}
        onSaveCurrentSet={handleSave}
        onRenameSet={renameConfigSet}
        onDeleteSet={deleteConfigSet}
        onCancelPendingAction={cancelPendingConfigSetAction}
        onSaveAndContinuePendingAction={saveAndContinuePendingConfigSetAction}
        onDiscardAndContinuePendingAction={discardAndContinuePendingConfigSetAction}
      />

      {/* Provider Selection */}
      <div className="space-y-3 py-5 border-b border-border-muted">
        <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Server className="w-4 h-4" />
          {t('api.provider')}
        </label>
        <p className="text-xs leading-5 text-text-muted">{t('api.providerDescription')}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          {(['openrouter', 'anthropic', 'openai', 'gemini', 'ollama', 'custom'] as const).map(
            (p) => (
              <button
                key={p}
                onClick={() => changeProvider(p)}
                disabled={isLoadingConfig}
                className={`px-3 py-2 rounded-lg text-sm transition-colors border ${
                  provider === p
                    ? 'border-accent bg-accent/10 text-accent font-medium'
                    : 'border-border-muted text-text-secondary hover:border-border hover:text-text-primary disabled:opacity-50'
                }`}
              >
                {p === 'custom' ? t('api.moreModels') : presets?.[p]?.name || p}
              </button>
            )
          )}
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-3 py-5 border-b border-border-muted">
        <label
          htmlFor="api-key-input"
          className="flex items-center gap-2 text-sm font-medium text-text-primary"
        >
          <Key className="w-4 h-4" />
          {t('api.apiKey')}
        </label>
        <p className="text-xs leading-5 text-text-muted">{t('api.apiKeyDescription')}</p>
        <input
          id="api-key-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={currentPreset?.keyPlaceholder || t('api.enterApiKey')}
          className="w-full px-4 py-3 rounded-lg bg-background border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
        {currentPreset?.keyHint && (
          <p className="text-xs text-text-muted">{currentPreset.keyHint}</p>
        )}
      </div>

      {hasLlm7Credentials && (
        <div className="space-y-3 py-5 border-b border-border-muted">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-text-primary">
                {t('llm7Auth.accountTitle', 'LLM7 account')}
              </div>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {t(
                  'llm7Auth.accountDescription',
                  'This profile uses an LLM7 API key generated from your Google sign-in.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleLlm7Logout();
              }}
              disabled={isSigningOutLlm7}
              className="flex items-center gap-2 rounded-lg border border-border-muted px-3 py-2 text-sm text-text-secondary transition-colors hover:border-error/40 hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigningOutLlm7 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {t('llm7Auth.signOut', 'Sign out')}
            </button>
          </div>
          {llm7LogoutMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {llm7LogoutMessage}
            </div>
          )}
          {llm7LogoutError && (
            <div className="flex items-center gap-2 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {llm7LogoutError}
            </div>
          )}
        </div>
      )}

      {/* Custom Protocol */}
      {provider === 'custom' && (
        <div className="space-y-3 py-5 border-b border-border-muted">
          <label
            id="api-protocol-label"
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            <Server className="w-4 h-4" />
            {t('api.protocol')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { id: 'anthropic', label: 'Anthropic' },
                { id: 'openai', label: 'OpenAI' },
                { id: 'gemini', label: 'Gemini' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                onClick={() => changeProtocol(mode.id)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors border ${
                  customProtocol === mode.id
                    ? 'border-accent bg-accent/10 text-accent font-medium'
                    : 'border-border-muted text-text-secondary hover:border-border hover:text-text-primary'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted">{t('api.selectProtocol')}</p>
          <GuidanceInlineHint text={protocolGuidanceText} tone={protocolGuidanceTone} />
        </div>
      )}

      {(provider === 'custom' || provider === 'ollama') && (
        <div className="space-y-3 py-5 border-b border-border-muted">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="api-base-url-input"
              className="flex items-center gap-2 text-sm font-medium text-text-primary"
            >
              <Server className="w-4 h-4" />
              {t('api.baseUrl')}
            </label>
            {supportsLiveModelRefresh && (
              <button
                type="button"
                onClick={() => {
                  void discoverLocalOllama();
                }}
                disabled={isDiscoveringLocalOllama}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors active:scale-95 bg-accent-muted text-accent hover:bg-accent-muted/80 disabled:opacity-50"
              >
                <Plug className="w-3 h-3" />
                {isDiscoveringLocalOllama
                  ? t('api.discoveringLocalOllama')
                  : t('api.discoverLocalOllama')}
              </button>
            )}
          </div>
          <input
            id="api-base-url-input"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={
              provider === 'ollama'
                ? 'http://localhost:11434/v1'
                : customProtocol === 'openai'
                  ? 'https://api.openai.com/v1'
                  : customProtocol === 'gemini'
                    ? 'https://generativelanguage.googleapis.com'
                    : currentPreset?.baseUrl || 'https://api.anthropic.com'
            }
            className="w-full px-4 py-3 rounded-lg bg-background border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          />
          <p className="text-xs text-text-muted">
            {provider === 'ollama'
              ? t('api.enterOllamaUrl')
              : customProtocol === 'openai'
                ? t('api.enterOpenAIUrl')
                : customProtocol === 'gemini'
                  ? t('api.enterGeminiUrl')
                  : t('api.enterAnthropicUrl')}
          </p>
          {isOllamaMode && (
            <p className="text-xs text-text-muted">{t('api.discoverLocalOllamaHint')}</p>
          )}
          {provider === 'custom' && <GuidanceInlineHint text={baseUrlGuidanceText} />}
        </div>
      )}

      {/* Model Selection */}
      <div className="space-y-3 py-5 border-b border-border-muted">
        <div className="flex items-center justify-between">
          <label
            htmlFor="api-model-input"
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            <Cpu className="w-4 h-4" />
            {t('api.model')}
          </label>
          <div className="flex items-center gap-2">
            {isOllamaMode && (
              <button
                type="button"
                onClick={() => {
                  void refreshModelOptions();
                }}
                disabled={isRefreshingModels}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors active:scale-95 bg-surface-hover text-text-secondary hover:bg-surface-active disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
                {isRefreshingModels ? t('api.refreshingModels') : t('api.refreshModels')}
              </button>
            )}
            {shouldShowOllamaManualModelToggle && (
              <button
                type="button"
                onClick={toggleCustomModel}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors active:scale-95 ${
                  useCustomModel
                    ? 'bg-accent-muted text-accent'
                    : 'border border-border-muted bg-background text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <Edit3 className="w-3 h-3" />
                {isOllamaMode
                  ? useCustomModel
                    ? t('api.useDetectedModels')
                    : t('api.manualModel')
                  : useCustomModel
                    ? t('api.usePreset')
                    : t('api.custom')}
              </button>
            )}
          </div>
        </div>
        {useCustomModel ? (
          <input
            id="api-model-input"
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder={modelInputPlaceholder}
            className="w-full px-4 py-3 rounded-lg bg-background border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          />
        ) : (
          <select
            id="api-model-input"
            value={modelOptions.length ? model : ''}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all appearance-none cursor-pointer"
          >
            {modelOptions.length ? (
              (modelOptions as ModelOptionItem[]).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            ) : (
              <option value="" disabled>
                {t('api.noModelsAvailable')}
              </option>
            )}
          </select>
        )}
        {useCustomModel && <p className="text-xs text-text-muted">{modelInputHint}</p>}

        {/* Context Window & Max Tokens — only for non-registry providers */}
        {(provider === 'ollama' || provider === 'custom') && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label
                htmlFor="api-context-window-input"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                {t('api.contextWindow')}
              </label>
              <input
                id="api-context-window-input"
                type="number"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder={t('api.contextWindowPlaceholder')}
                min={1024}
                step={1024}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
            <div>
              <label
                htmlFor="api-max-tokens-input"
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                {t('api.maxOutputTokens')}
              </label>
              <input
                id="api-max-tokens-input"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder={t('api.maxOutputTokensPlaceholder')}
                min={256}
                step={256}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
            <p className="col-span-2 text-xs text-text-muted">{t('api.contextWindowHint')}</p>
          </div>
        )}
      </div>

      {provider === 'custom' && (
        <CommonProviderSetupsCard
          setups={commonProviderSetups}
          onApplySetup={applyCommonProviderSetup}
        />
      )}

      {/* Enable Thinking Mode */}
      <div className="space-y-3 py-5 border-b border-border-muted">
        <div className="flex items-start gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            id="enable-thinking"
            checked={enableThinking}
            onChange={(e) => setEnableThinking(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent"
          />
          <label htmlFor="enable-thinking" className="space-y-0.5 flex-1">
            <div className="text-text-primary font-medium">{t('api.enableThinking')}</div>
            <div>{t('api.enableThinkingHint')}</div>
            {isOllamaMode && (
              <div className="text-amber-500 dark:text-amber-400 text-xs mt-1">
                {t('api.enableThinkingOllamaHint')}
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-error/10 text-error text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 text-success text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}
      {/* Diagnostics Panel */}
      <ApiDiagnosticsPanel
        result={diagnosticResult}
        isRunning={isDiagnosing}
        onRunDiagnostics={handleDiagnose}
        onRunDeepDiagnostics={isOllamaMode ? handleDeepDiagnose : undefined}
        disabled={requiresApiKey && !apiKey.trim()}
      />

      {/* Save Button */}
      <div className="space-y-3 py-5 border-b border-border-muted">
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving || (requiresApiKey && !apiKey.trim())}
            className="w-full py-3 px-4 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {t('api.saveSettings')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
