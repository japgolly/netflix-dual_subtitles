(function () {
  'use strict';

  // Kanji & Japanese Regex Ranges
  const KANJI_REGEX = /[\u4e00-\u9faf\u3400-\u4dbf]/;
  const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u4e00-\u9faf]/;

  let kuromojiTokenizer = null;
  let isInitializing = false;

  function initKuromoji() {
    if (kuromojiTokenizer || isInitializing) return;
    isInitializing = true;

    if (typeof kuromoji === 'undefined') {
      console.error('[Netflix Dual Subtitles] Kuromoji library not loaded');
      isInitializing = false;
      return;
    }

    try {
      const dictPath = chrome.runtime.getURL('dict/');
      console.log('[Netflix Dual Subtitles] Initializing Kuromoji.js with dictPath:', dictPath);

      kuromoji.builder({ dicPath: dictPath }).build((err, tokenizer) => {
        if (err) {
          console.error('[Netflix Dual Subtitles] Error building Kuromoji tokenizer:', err);
          isInitializing = false;
          return;
        }
        kuromojiTokenizer = tokenizer;
        console.log('[Netflix Dual Subtitles] Kuromoji.js Tokenizer built successfully!');
      });
    } catch (e) {
      console.error('[Netflix Dual Subtitles] Exception initializing Kuromoji:', e);
      isInitializing = false;
    }
  }

  // Convert Katakana to Hiragana
  function kataToHira(str) {
    if (!str) return '';
    return str.replace(/[\u30a1-\u30f6]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Smart Okurigana & Kana Alignment
  function alignFurigana(surface, reading) {
    if (!KANJI_REGEX.test(surface)) {
      return escapeHtml(surface);
    }

    if (!reading || reading === surface) {
      return escapeHtml(surface);
    }

    // 1. Trim common prefix (e.g. お, ご)
    let prefixLen = 0;
    while (
      prefixLen < surface.length &&
      prefixLen < reading.length &&
      surface[prefixLen] === reading[prefixLen] &&
      !KANJI_REGEX.test(surface[prefixLen])
    ) {
      prefixLen++;
    }

    const prefix = surface.slice(0, prefixLen);
    let restSurface = surface.slice(prefixLen);
    let restReading = reading.slice(prefixLen);

    // 2. Trim common suffix (Okurigana e.g. こえ in 聞こえ, べます in 食べます)
    let suffixLen = 0;
    while (
      suffixLen < restSurface.length &&
      suffixLen < restReading.length &&
      restSurface[restSurface.length - 1 - suffixLen] === restReading[restReading.length - 1 - suffixLen] &&
      !KANJI_REGEX.test(restSurface[restSurface.length - 1 - suffixLen])
    ) {
      suffixLen++;
    }

    const suffix = restSurface.slice(restSurface.length - suffixLen);
    const kanjiStem = restSurface.slice(0, restSurface.length - suffixLen);
    const readingStem = restReading.slice(0, restReading.length - suffixLen);

    if (kanjiStem && readingStem && KANJI_REGEX.test(kanjiStem)) {
      return `${escapeHtml(prefix)}<ruby>${escapeHtml(kanjiStem)}<rt>${escapeHtml(readingStem)}</rt></ruby>${escapeHtml(suffix)}`;
    }

    return `${escapeHtml(prefix)}${escapeHtml(kanjiStem)}${escapeHtml(suffix)}`;
  }

  function toFurigana(text) {
    if (!text || typeof text !== 'string' || !JAPANESE_CHAR_REGEX.test(text)) {
      return escapeHtml(text || '');
    }

    if (!kuromojiTokenizer) {
      initKuromoji();
      return escapeHtml(text);
    }

    try {
      const tokens = kuromojiTokenizer.tokenize(text);
      let resultHtml = '';

      for (const token of tokens) {
        const surface = token.surface_form;
        const reading = token.reading ? kataToHira(token.reading) : null;

        resultHtml += alignFurigana(surface, reading);
      }

      return resultHtml;
    } catch (e) {
      console.error('[Netflix Dual Subtitles] Kuromoji Furigana conversion error:', e);
      return escapeHtml(text);
    }
  }

  // Initialize Kuromoji on load
  initKuromoji();

  // Export module
  window.NetflixDualSubsFurigana = {
    toFurigana: toFurigana,
    isJapanese: (str) => typeof str === 'string' && JAPANESE_CHAR_REGEX.test(str),
    isReady: () => kuromojiTokenizer !== null
  };

})();
