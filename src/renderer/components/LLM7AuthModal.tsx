import { useCallback, useState } from 'react';
import { AlertCircle, ExternalLink, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Llm7SignInResult } from '../types';

interface LLM7AuthModalProps {
  isOpen: boolean;
  onAuthenticated: (result: Llm7SignInResult) => void;
  onUseApiKey: () => void;
}

export function LLM7AuthModal({ isOpen, onAuthenticated, onUseApiKey }: LLM7AuthModalProps) {
  const { t } = useTranslation();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    setError('');
    try {
      const result = await window.electronAPI.llm7Auth.signInWithGoogle();
      onAuthenticated(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('llm7Auth.signInFailed', 'Could not sign in to LLM7.')
      );
    } finally {
      setIsSigningIn(false);
    }
  }, [onAuthenticated, t]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="llm7-auth-title"
      data-testid="llm7-auth-modal"
    >
      <div className="mx-4 w-full max-w-[420px] rounded-2xl border border-border-subtle bg-background shadow-elevated">
        <div className="border-b border-border-muted px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-background-secondary text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">LLM7</p>
              <h2 id="llm7-auth-title" className="mt-1 text-lg font-semibold text-text-primary">
                {t('llm7Auth.title', 'Sign in to LLM7')}
              </h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            {t(
              'llm7Auth.subtitle',
              'Open Cowork needs an LLM7 token before it can call api.llm7.io.'
            )}
          </p>
        </div>

        <div className="space-y-4 px-6 py-6">
          <button
            type="button"
            onClick={() => {
              void handleGoogleSignIn();
            }}
            disabled={isSigningIn}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-background-secondary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningIn ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {isSigningIn
              ? t('llm7Auth.signingIn', 'Signing in...')
              : t('llm7Auth.signInWithBrowser', 'Sign in with Google')}
          </button>

          <button
            type="button"
            onClick={onUseApiKey}
            disabled={isSigningIn}
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" />
            {t('llm7Auth.useApiKeyInstead', 'Use API key instead')}
          </button>

          {error && (
            <div className="flex gap-2 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
