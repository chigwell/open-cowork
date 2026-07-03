import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Llm7SignInResult } from '../types';
import { LLM7_GOOGLE_CLIENT_ID } from '../../shared/llm7-auth';

const GOOGLE_SCRIPT_ID = 'gsi-client';
const GOOGLE_BUTTON_ID = 'llm7-google-signin-button';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      theme: 'outline';
      size: 'large';
      type: 'standard';
      shape: 'rectangular';
      text: 'continue_with';
      width: number;
    }
  ) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

interface LLM7AuthModalProps {
  isOpen: boolean;
  onAuthenticated: (result: Llm7SignInResult) => void;
}

export function LLM7AuthModal({ isOpen, onAuthenticated }: LLM7AuthModalProps) {
  const { t } = useTranslation();
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');
  const initializedRef = useRef(false);

  const handleCredentialResponse = useCallback(
    async ({ credential }: GoogleCredentialResponse) => {
      if (!credential) {
        setError(t('llm7Auth.missingCredential', 'Google did not return a credential.'));
        return;
      }

      setIsSigningIn(true);
      setError('');
      try {
        const result = await window.electronAPI.llm7Auth.signInWithGoogleCredential({
          credential,
        });
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
    },
    [onAuthenticated, t]
  );

  const renderGoogleButton = useCallback(() => {
    const googleId = window.google?.accounts?.id;
    const buttonEl = document.getElementById(GOOGLE_BUTTON_ID);
    if (!googleId || !buttonEl) {
      return;
    }

    buttonEl.innerHTML = '';
    if (!initializedRef.current) {
      googleId.initialize({
        client_id: LLM7_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });
      initializedRef.current = true;
    }

    googleId.renderButton(buttonEl, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      shape: 'rectangular',
      text: 'continue_with',
      width: 250,
    });
    setIsScriptReady(true);
  }, [handleCredentialResponse]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return;
    }

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', renderGoogleButton, { once: true });
      return () => existingScript.removeEventListener('load', renderGoogleButton);
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    script.onerror = () => {
      setError(t('llm7Auth.googleScriptFailed', 'Could not load Google sign-in.'));
    };
    document.body.appendChild(script);
  }, [isOpen, renderGoogleButton, t]);

  useEffect(() => {
    if (isOpen && isScriptReady) {
      renderGoogleButton();
    }
  }, [isOpen, isScriptReady, renderGoogleButton]);

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
          <div className="flex min-h-[44px] justify-center">
            <div
              id={GOOGLE_BUTTON_ID}
              className={isSigningIn ? 'pointer-events-none opacity-50' : ''}
            />
            {!isScriptReady && !error && (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('llm7Auth.loadingGoogle', 'Loading Google sign-in...')}
              </div>
            )}
          </div>

          {isSigningIn && (
            <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('llm7Auth.signingIn', 'Signing in...')}
            </div>
          )}

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
