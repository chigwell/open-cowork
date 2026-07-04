import {
  getSupportedLanguageCode,
  supportedLanguageCodes,
  type SupportedLanguageCode,
} from '../../shared/app-language';

export const supportedLanguages = [
  { code: 'en', nativeName: 'English' },
  { code: 'zh', nativeName: '中文' },
  { code: 'ru', nativeName: 'Русский' },
] as const;

export { getSupportedLanguageCode, supportedLanguageCodes, type SupportedLanguageCode };

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
