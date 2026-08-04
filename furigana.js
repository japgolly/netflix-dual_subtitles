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

        if (!KANJI_REGEX.test(surface)) {
          resultHtml += escapeHtml(surface);
          continue;
        }

        if (reading && reading !== surface) {
          resultHtml += `<ruby>${escapeHtml(surface)}<rt>${escapeHtml(reading)}</rt></ruby>`;
        } else {
          resultHtml += escapeHtml(surface);
        }
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
