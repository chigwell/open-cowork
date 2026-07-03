export const supportedLanguages = [
  { code: 'en', nativeName: 'English' },
  { code: 'zh', nativeName: '中文' },
  { code: 'ru', nativeName: 'Русский' },
] as const;

export type SupportedLanguageCode = (typeof supportedLanguages)[number]['code'];

export const supportedLanguageCodes: SupportedLanguageCode[] = supportedLanguages.map(
  (language) => language.code
);

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

export function getAppLocale(language?: string): string {
  switch (getSupportedLanguageCode(language)) {
    case 'zh':
      return 'zh-CN';
    case 'ru':
      return 'ru-RU';
    case 'en':
    default:
      return 'en-US';
  }
}

export function getAppListSeparator(language?: string): string {
  return getSupportedLanguageCode(language) === 'zh' ? '、' : ', ';
}
