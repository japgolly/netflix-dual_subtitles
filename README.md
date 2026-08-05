# Netflix Dual Subtitles Chrome Extension

A Manifest V3 Chrome Extension that allows you to render two subtitle tracks simultaneously on Netflix with automatic timestamp synchronization and full Japanese Furigana support.

## Features

- 💬 **Dual Subtitle Display**: View native primary subtitles alongside a secondary language subtitle track.
- 🇯🇵 **Kuromoji.js Japanese Furigana (ふりがな)**: Automatically parses Japanese Kanji subtitles and renders reading annotations above Kanji characters using HTML `<ruby>` tags and MeCab IPADIC morphological analysis.
- ✂️ **Smart Okurigana Alignment**: Trims kana suffixes and prefixes so furigana annotations apply exclusively to Kanji stems.
- ⏱️ **Automatic Time Sync**: Syncs secondary subtitles frame-by-frame with Netflix's `<video>` timestamp.
- 🎨 **Custom Typography & Aesthetics**: Adjust font size (Small, Medium, Large, Extra Large), text style (Translucent dark box vs Gold outline), and screen placement (Top vs Bottom).
- 🍿 **Seamless Player Integration**: Adds a sleek **💬 Dual Subs** button and floating control panel directly inside the Netflix video player (accessible via mouse or `Option + S` / `Alt + S` shortcut).

## How to Install in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the upper right corner.
3. Click **Load unpacked**.
4. Select this project directory
5. Open [Netflix](https://www.netflix.com) and start playing any video!

## Automated Unit Testing

Run the automated Vitest test suite locally:

```bash
npm test
```

## Files Overview

- [`manifest.json`](./manifest.json): Extension configuration (Manifest V3).
- [`kuromoji.js`](./kuromoji.js) & [`dict/`](./dict): Kuromoji.js library and official MeCab IPADIC dictionary files.
- [`furigana.js`](./furigana.js): Japanese morphological parsing and Okurigana alignment engine.
- [`injected.js`](./injected.js): Main-world page script that intercepts Netflix subtitle network requests and hooks the Netflix Player API.
- [`content.js`](./content.js): Content script managing DOM overlay insertion, time loop sync, and control drawer UI.
- [`styles.css`](./styles.css): Sleek Netflix dark mode CSS design system.
- [`popup.html`](./popup.html) & [`popup.js`](./popup.js): Toolbar action popup window.
- [`tests/`](./tests): Automated Vitest unit test suites for subtitle parsers, furigana engine, and language formatters.
