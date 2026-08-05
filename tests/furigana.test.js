import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Japanese Furigana & Okurigana Engine', () => {
  beforeAll(() => {
    // Mock Chrome Extension API in jsdom environment
    global.chrome = {
      runtime: {
        getURL: (relPath) => path.resolve(__dirname, '../' + relPath) + '/'
      }
    };

    const kuromojiCode = fs.readFileSync(path.resolve(__dirname, '../kuromoji.js'), 'utf8');
    eval(kuromojiCode);

    const furiganaCode = fs.readFileSync(path.resolve(__dirname, '../furigana.js'), 'utf8');
    eval(furiganaCode);
  });

  it('should detect Japanese text accurately', () => {
    expect(window.NetflixDualSubsFurigana.isJapanese('日本語')).toBe(true);
    expect(window.NetflixDualSubsFurigana.isJapanese('Hello World')).toBe(false);
    expect(window.NetflixDualSubsFurigana.isJapanese('123')).toBe(false);
  });

  it('should format okurigana alignment correctly for verbs', () => {
    const result = window.NetflixDualSubsFurigana.toFurigana('聞こえ');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should escape HTML characters safely to prevent XSS', () => {
    const result = window.NetflixDualSubsFurigana.toFurigana('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should preserve plain English and Kana text', () => {
    const result = window.NetflixDualSubsFurigana.toFurigana('Hello かな');
    expect(result).toBe('Hello かな');
  });

  it('should handle Japanese sentence tokenization safely', () => {
    const result = window.NetflixDualSubsFurigana.toFurigana('日本語を勉強します');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle Japanese punctuation and quotes cleanly', () => {
    const result = window.NetflixDualSubsFurigana.toFurigana('『東京』');
    expect(result).toContain('『');
    expect(result).toContain('』');
  });
});
