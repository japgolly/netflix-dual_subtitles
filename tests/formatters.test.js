import { describe, it, expect, beforeAll } from 'vitest';

describe('Internationalized Language Label Formatter', () => {
  let formatLanguageLabel;

  beforeAll(() => {
    let languageNames = null;
    try {
      languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch (e) {}

    formatLanguageLabel = function (rawLabel, bcp47Code) {
      if (rawLabel && rawLabel !== 'undefined' && !rawLabel.startsWith('undefined') && rawLabel !== 'unk') {
        return rawLabel;
      }

      if (bcp47Code && bcp47Code !== 'undefined' && bcp47Code !== 'unk') {
        try {
          if (languageNames) {
            const cleanCode = bcp47Code.split('-')[0];
            const formatted = languageNames.of(cleanCode);
            if (formatted) return formatted;
          }
        } catch (e) {}
        return bcp47Code.toUpperCase();
      }

      return 'Subtitle Track';
    };
  });

  it('should preserve valid raw labels', () => {
    expect(formatLanguageLabel('Japanese [CC]', 'ja')).toBe('Japanese [CC]');
    expect(formatLanguageLabel('English [Original]', 'en')).toBe('English [Original]');
  });

  it('should format BCP-47 codes when raw label is undefined or unk', () => {
    expect(formatLanguageLabel('undefined', 'ja')).toBe('Japanese');
    expect(formatLanguageLabel('unk', 'es')).toBe('Spanish');
    expect(formatLanguageLabel(null, 'fr-FR')).toBe('French');
    expect(formatLanguageLabel('undefined', 'zh-Hans')).toBe('Chinese');
  });

  it('should return fallback title when both raw label and BCP-47 are missing', () => {
    expect(formatLanguageLabel(null, null)).toBe('Subtitle Track');
    expect(formatLanguageLabel('undefined', 'unk')).toBe('Subtitle Track');
  });
});
