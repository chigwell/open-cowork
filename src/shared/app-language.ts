export const supportedLanguageCodes = ['en', 'zh', 'ru'] as const;

export type SupportedLanguageCode = (typeof supportedLanguageCodes)[number];

export function getSupportedLanguageCode(language?: string): SupportedLanguageCode {
  const normalized = (language || '').toLowerCase();

  if (normalized.startsWith('zh')) {
    return 'zh';
  }

  if (normalized.startsWith('ru')) {
    return 'ru';
  }

  return 'en';
}
