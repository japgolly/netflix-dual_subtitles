# Netflix Dual Subtitles Chrome Extension

A Manifest V3 Chrome Extension that allows you to render two subtitle tracks simultaneously on Netflix with automatic timestamp synchronization.

## Features

- 💬 **Dual Subtitle Display**: View native primary subtitles alongside a secondary language subtitle track.
- ⏱️ **Automatic Time Sync**: Syncs secondary subtitles frame-by-frame with Netflix's `<video>` timestamp.
- 🎨 **Custom Typography & Aesthetics**: Adjust font size (Small, Medium, Large, Extra Large), text style (Translucent dark box vs Gold outline), and screen placement (Top vs Bottom).
- 🍿 **Seamless Player Integration**: Adds a sleek Netflix-styled `💬 Dual Subs` button and glassmorphism control panel directly inside the video player controls.

## How to Install in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the upper right corner.
3. Click **Load unpacked**.
4. Select this project directory
5. Open [Netflix](https://www.netflix.com) and start playing any video!

## Files Overview

- [`manifest.json`](./manifest.json): Extension configuration (Manifest V3).
- [`injected.js`](./injected.js): Main-world page script that intercepts Netflix subtitle network requests and hooks the Netflix Player API.
- [`content.js`](./content.js): Content script managing DOM overlay insertion, time loop sync, and control drawer UI.
- [`styles.css`](./styles.css): Sleek Netflix dark mode CSS design system.
- [`popup.html`](./popup.html) & [`popup.js`](./popup.js): Toolbar action popup window.
