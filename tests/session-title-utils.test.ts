import { describe, it, expect } from 'vitest';
import {
  buildTitlePrompt,
  normalizeGeneratedTitle,
  shouldGenerateTitle,
} from '../src/main/session/session-title-utils';

describe('session title utils', () => {
  it('generates title only for first user message and default title', () => {
    expect(
      shouldGenerateTitle({
        userMessageCount: 1,
        currentTitle: 'Hello world',
        prompt: 'Hello world',
        hasAttempted: false,
      })
    ).toBe(true);

    expect(
      shouldGenerateTitle({
        userMessageCount: 2,
        currentTitle: 'Hello world',
        prompt: 'Hello world',
        hasAttempted: false,
      })
    ).toBe(false);
  });

  it('skips when title was manually changed', () => {
    expect(
      shouldGenerateTitle({
        userMessageCount: 1,
        currentTitle: 'Custom title',
        prompt: 'Hello world',
        hasAttempted: false,
      })
    ).toBe(false);
  });

  it('skips when already attempted', () => {
    expect(
      shouldGenerateTitle({
        userMessageCount: 1,
        currentTitle: 'Hello world',
        prompt: 'Hello world',
        hasAttempted: true,
      })
    ).toBe(false);
  });

  it('builds an English prompt without Chinese instructions by default', () => {
    const prompt = buildTitlePrompt('Make me a deck');
    expect(prompt).toContain('Return the title in English');
    expect(prompt).not.toContain('请根据');
    expect(prompt).not.toContain('Верни');
  });

  it('builds a Russian prompt when Russian is selected', () => {
    const prompt = buildTitlePrompt('Покажи ошибки в проекте', 'ru');
    expect(prompt).toContain('Верни название на русском языке');
    expect(prompt).not.toContain('Return the title in English');
    expect(prompt).not.toContain('请根据');
  });

  it('builds a Chinese prompt when Chinese is selected', () => {
    const prompt = buildTitlePrompt('帮我做一个PPT', 'zh');
    expect(prompt).toContain('使用中文返回标题');
    expect(prompt).toContain('15');
    expect(prompt).not.toContain('Return the title in English');
    expect(prompt).not.toContain('Верни');
  });

  it('normalizes generated title by taking first line and stripping quotes', () => {
    const title = normalizeGeneratedTitle('"  我的标题  "\n第二行');
    expect(title).toBe('我的标题');
  });

  it('drops synthetic empty placeholder titles', () => {
    expect(normalizeGeneratedTitle('(no content)')).toBeNull();
    expect(normalizeGeneratedTitle('(empty content)')).toBeNull();
  });
});
