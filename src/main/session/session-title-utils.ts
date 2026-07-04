export { DEFAULT_SESSION_TITLE, getDefaultTitleFromPrompt } from '../../shared/session-title';
import { getSupportedLanguageCode, type SupportedLanguageCode } from '../../shared/app-language';
import { DEFAULT_SESSION_TITLE, getDefaultTitleFromPrompt } from '../../shared/session-title';

export type TitleDecisionInput = {
  userMessageCount: number;
  currentTitle: string;
  prompt: string;
  hasAttempted: boolean;
};

export function shouldGenerateTitle(input: TitleDecisionInput): boolean {
  if (input.hasAttempted) return false;
  if (input.userMessageCount !== 1) return false;
  const defaultTitle = getDefaultTitleFromPrompt(input.prompt);
  return input.currentTitle === defaultTitle || input.currentTitle === DEFAULT_SESSION_TITLE;
}

export function normalizeGeneratedTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  const normalized = firstLine.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!normalized) return null;
  if (
    normalized.toLowerCase() === '(no content)' ||
    normalized.toLowerCase() === '(empty content)'
  ) {
    return null;
  }
  return normalized.slice(0, 120);
}

export function buildTitlePrompt(
  prompt: string,
  language?: SupportedLanguageCode | string
): string {
  const normalizedLanguage = getSupportedLanguageCode(language);
  const trimmedPrompt = prompt.trim();

  if (normalizedLanguage === 'ru') {
    return [
      'Сгенерируй короткое название для следующего запроса пользователя. Правила:',
      '- Максимум 6 слов',
      '- Верни название на русском языке',
      '- Без кавычек, нумерации и пунктуации в конце',
      '',
      `Запрос пользователя: ${trimmedPrompt}`,
    ].join('\n');
  }

  if (normalizedLanguage === 'zh') {
    return [
      '请根据以下用户请求生成一个简短的对话标题。规则：',
      '- 不超过15个字',
      '- 使用中文返回标题',
      '- 不要加引号、编号或结尾标点',
      '',
      `用户请求：${trimmedPrompt}`,
    ].join('\n');
  }

  return [
    'Generate a short title for the following user request. Rules:',
    '- Max 6 words',
    '- Return the title in English',
    '- No quotes, numbering, or punctuation at the end',
    '',
    `User request: ${trimmedPrompt}`,
  ].join('\n');
}
