import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type LocaleTree = { [key: string]: JsonValue };

const localeDir = path.resolve(process.cwd(), 'src/renderer/i18n/locales');
const configPath = path.resolve(process.cwd(), 'src/renderer/i18n/config.ts');
const settingsGeneralPath = path.resolve(
  process.cwd(),
  'src/renderer/components/settings/SettingsGeneral.tsx'
);

function readLocale(name: string): LocaleTree {
  return JSON.parse(readFileSync(path.join(localeDir, `${name}.json`), 'utf8')) as LocaleTree;
}

function flattenLeaves(value: JsonValue, prefix = ''): Map<string, string> {
  const leaves = new Map<string, string>();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) {
      leaves.set(prefix, String(value));
    }
    return leaves;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    for (const [childKey, childValue] of flattenLeaves(child, childPrefix)) {
      leaves.set(childKey, childValue);
    }
  }

  return leaves;
}

function interpolationNames(value: string): string[] {
  return [...value.matchAll(/{{\s*([^{}\s]+)\s*}}/g)].map((match) => match[1]).sort();
}

function findDuplicateJsonKeys(source: string): string[] {
  const duplicates: string[] = [];
  const pathStack: string[] = [];
  let index = 0;

  const skipWhitespace = () => {
    while (/\s/.test(source[index] || '')) index++;
  };

  const parseString = () => {
    let raw = '';
    index++;
    while (index < source.length) {
      const char = source[index++];
      if (char === '\\') {
        raw += char + (source[index++] || '');
        continue;
      }
      if (char === '"') break;
      raw += char;
    }
    return JSON.parse(`"${raw}"`) as string;
  };

  const parseValue = () => {
    skipWhitespace();
    const char = source[index];
    if (char === '{') {
      parseObject();
      return;
    }
    if (char === '[') {
      parseArray();
      return;
    }
    if (char === '"') {
      parseString();
      return;
    }
    while (index < source.length && !/[,}\]]/.test(source[index])) index++;
  };

  const parseArray = () => {
    index++;
    skipWhitespace();
    while (source[index] !== ']') {
      parseValue();
      skipWhitespace();
      if (source[index] === ',') {
        index++;
        skipWhitespace();
      } else {
        break;
      }
    }
    index++;
  };

  function parseObject() {
    index++;
    const seen = new Set<string>();
    skipWhitespace();
    while (source[index] !== '}') {
      const key = parseString();
      if (seen.has(key)) {
        duplicates.push([...pathStack, key].join('.'));
      }
      seen.add(key);
      skipWhitespace();
      expect(source[index]).toBe(':');
      index++;
      pathStack.push(key);
      parseValue();
      pathStack.pop();
      skipWhitespace();
      if (source[index] === ',') {
        index++;
        skipWhitespace();
      } else {
        break;
      }
    }
    index++;
  }

  parseValue();
  return duplicates;
}

describe('Russian i18n locale', () => {
  const en = readLocale('en');
  const ru = readLocale('ru');
  const enLeaves = flattenLeaves(en);
  const ruLeaves = flattenLeaves(ru);

  it('covers every base English locale key', () => {
    const missing = [...enLeaves.keys()].filter((key) => !ruLeaves.has(key));

    expect(missing).toEqual([]);
  });

  it('preserves interpolation placeholders from English values', () => {
    const mismatches = [...enLeaves.entries()]
      .map(([key, value]) => ({
        key,
        expected: interpolationNames(value),
        actual: interpolationNames(ruLeaves.get(key) ?? ''),
      }))
      .filter(({ expected, actual }) => expected.join('|') !== actual.join('|'));

    expect(mismatches).toEqual([]);
  });

  it('keeps quick-prompt payloads in English because they are sent to the agent', () => {
    const changedQuickPrompts = [...enLeaves.entries()]
      .filter(([key]) => key.startsWith('welcome.quickPrompt'))
      .filter(([key, value]) => ruLeaves.get(key) !== value)
      .map(([key]) => key);

    expect(changedQuickPrompts).toEqual([]);
  });

  it('provides Russian plural forms for count-driven keys without duplicate JSON keys', () => {
    const ruSource = readFileSync(path.join(localeDir, 'ru.json'), 'utf8');
    const requiredPluralKeys = [
      'sandbox.syncFiles_few',
      'sandbox.syncFiles_many',
      'mcp.toolsAvailable_few',
      'mcp.toolsAvailable_many',
      'mcp.toolCount_few',
      'mcp.toolCount_many',
      'mcp.callCount_few',
      'mcp.callCount_many',
      'chat.connectorCount_few',
      'chat.connectorCount_many',
      'schedule.repeatEveryMinute_few',
      'schedule.repeatEveryMinute_many',
      'schedule.repeatEveryHour_few',
      'schedule.repeatEveryHour_many',
      'schedule.repeatEveryDay_few',
      'schedule.repeatEveryDay_many',
      'schedule.pickerSelectedCount_few',
      'schedule.pickerSelectedCount_many',
    ];

    expect(findDuplicateJsonKeys(ruSource)).toEqual([]);
    expect(requiredPluralKeys.filter((key) => !ruLeaves.has(key))).toEqual([]);
  });

  it('wires Russian into i18next and the settings language switcher', () => {
    const configSource = readFileSync(configPath, 'utf8');
    const settingsGeneralSource = readFileSync(settingsGeneralPath, 'utf8');

    expect(configSource).toContain("import ruTranslations from './locales/ru.json';");
    expect(configSource).toContain('supportedLngs: supportedLanguageCodes');
    expect(configSource).toContain('translation: ruTranslations');
    expect(settingsGeneralSource).toContain('supportedLanguages.map');
    expect(settingsGeneralSource).toContain('getSupportedLanguageCode(i18n.language)');
  });
});
