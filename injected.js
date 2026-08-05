(function () {
  'use strict';
  if (window.__netflixDualSubsInjected) return;
  window.__netflixDualSubsInjected = true;

  const DEBUG = false;
  const log = (...args) => DEBUG && console.log('[Netflix Dual Subtitles]', ...args);
  const logError = (...args) => console.error('[Netflix Dual Subtitles]', ...args);

  log('Main world script initialized');

  let pendingTrackId = null;
  let pendingTrackBcp47 = null;
  let lastSessionId = null;

  const SUBTITLE_URL_PATTERNS = [/timedtext/i, /ttml/i, /dfxp/i, /vtt/i, /\/\?o=/i];

  function isSubtitleUrl(url) {
    return typeof url === 'string' && SUBTITLE_URL_PATTERNS.some(pattern => pattern.test(url));
  }

  // Safe property evaluation wrapper to guard against internal Netflix XHR getters
  function safeGet(fn, fallback = null) {
    try {
      const val = fn();
      return (val !== undefined && val !== null) ? val : fallback;
    } catch (e) {
      return fallback;
    }
  }

  // Safely extract text content from XMLHttpRequest regardless of responseType
  function extractResponseText(xhr) {
    try {
      if (!xhr.responseType || xhr.responseType === '' || xhr.responseType === 'text') {
        return xhr.responseText || '';
      }
      if (xhr.responseType === 'arraybuffer' && xhr.response) {
        return new TextDecoder('utf-8').decode(xhr.response);
      }
      if (xhr.responseType === 'json' && xhr.response) {
        return typeof xhr.response === 'string' ? xhr.response : JSON.stringify(xhr.response);
      }
      if (xhr.response) {
        if (typeof xhr.response === 'string') return xhr.response;
      }
    } catch (e) {
      logError('Error extracting response text from XHR:', e);
    }
    return '';
  }

  // Parse time helper (HH:MM:SS.mmm or MM:SS.mmm or seconds or ticks)
  function parseTime(timeStr) {
    if (typeof timeStr === 'number') return timeStr / 1000;
    if (!timeStr) return 0;
    
    if (timeStr.endsWith('ms')) return parseFloat(timeStr) / 1000;
    if (timeStr.endsWith('s')) return parseFloat(timeStr);
    if (timeStr.endsWith('t')) return parseFloat(timeStr) / 10000000;

    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const hrs = parseFloat(parts[0]);
      const mins = parseFloat(parts[1]);
      const secs = parseFloat(parts[2].replace(',', '.'));
      return hrs * 3600 + mins * 60 + secs;
    } else if (parts.length === 2) {
      const mins = parseFloat(parts[0]);
      const secs = parseFloat(parts[1].replace(',', '.'));
      return mins * 60 + secs;
    }
    return parseFloat(timeStr) || 0;
  }

  // TTML / DFXP XML Parser
  function parseTTML(xmlText) {
    const cues = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const paragraphs = doc.querySelectorAll('p');
      
      paragraphs.forEach((p) => {
        const beginAttr = p.getAttribute('begin');
        const endAttr = p.getAttribute('end');
        const durAttr = p.getAttribute('dur');
        
        let start = parseTime(beginAttr);
        let end = 0;
        if (endAttr) {
          end = parseTime(endAttr);
        } else if (durAttr) {
          end = start + parseTime(durAttr);
        }

        let textHtml = p.innerHTML
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();

        if (start < end && textHtml) {
          cues.push({ start, end, text: textHtml });
        }
      });
    } catch (e) {
      logError('Error parsing TTML:', e);
    }
    return cues;
  }

  // Netflix JSON TimedText Parser
  function parseJSONTimedText(jsonObj) {
    const cues = [];
    try {
      const events = jsonObj.events || (jsonObj.result && jsonObj.result.timedtext) || [];
      events.forEach((evt) => {
        const start = (evt.start || evt.startTime || 0) / 1000;
        const duration = (evt.duration || evt.dur || 0) / 1000;
        const end = evt.end ? evt.end / 1000 : (start + duration);

        let linesText = '';
        if (evt.lines) {
          linesText = evt.lines.map(l => typeof l === 'string' ? l : (l.text || '')).join('\n');
        } else if (evt.text) {
          linesText = typeof evt.text === 'string' ? evt.text : (evt.text.map(t => t.value || t).join(' '));
        }

        linesText = linesText.replace(/<[^>]+>/g, '').trim();
        if (start < end && linesText) {
          cues.push({ start, end, text: linesText });
        }
      });
    } catch (e) {
      logError('Error parsing JSON Subtitles:', e);
    }
    return cues;
  }

  // WebVTT Parser
  function parseVTT(vttText) {
    const cues = [];
    const lines = vttText.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const parts = line.split('-->');
        const start = parseTime(parts[0].trim());
        const end = parseTime(parts[1].trim().split(' ')[0]);

        i++;
        let cueText = [];
        while (i < lines.length && lines[i].trim() !== '') {
          cueText.push(lines[i].trim());
          i++;
        }
        const text = cueText.join('\n').replace(/<[^>]+>/g, '');
        if (start < end && text) {
          cues.push({ start, end, text });
        }
      }
      i++;
    }
    return cues;
  }

  function parseSubtitlePayload(responseText, url) {
    let cues = [];
    if (typeof responseText !== 'string') return cues;

    const trimmed = responseText.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const json = JSON.parse(responseText);
        cues = parseJSONTimedText(json);
      } catch (e) {}
    } else if (responseText.includes('</tt>') || responseText.includes('<tt') || responseText.includes('<p ')) {
      cues = parseTTML(responseText);
    } else if (responseText.includes('WEBVTT') || responseText.includes('-->')) {
      cues = parseVTT(responseText);
    }
    return cues;
  }

  function getNetflixPlayer() {
    try {
      if (!window.netflix || !window.netflix.appContext || !window.netflix.appContext.state) return null;
      const playerApp = window.netflix.appContext.state.playerApp;
      if (!playerApp || typeof playerApp.getAPI !== 'function') return null;

      let playerAPI = null;
      try {
        const api = playerApp.getAPI();
        playerAPI = api ? api.videoPlayer : null;
      } catch (e) {
        return null;
      }
      if (!playerAPI) return null;

      let sessionIds = [];
      try {
        sessionIds = playerAPI.getAllPlayerSessionIds ? playerAPI.getAllPlayerSessionIds() : [];
      } catch (e) {
        return null;
      }

      if (sessionIds && sessionIds.length > 0) {
        const currentSession = sessionIds[0];
        if (lastSessionId && lastSessionId !== currentSession) {
          log('Detected new player session ID:', currentSession);
          try {
            window.postMessage({ type: 'NETFLIX_DUAL_SUB_EPISODE_RESET' }, '*');
          } catch (e) {}
        }
        lastSessionId = currentSession;

        try {
          return playerAPI.getVideoPlayerBySessionId(currentSession);
        } catch (e) {
          return null;
        }
      }
    } catch (e) {
      logError('Error accessing Netflix Player API:', e);
    }
    return null;
  }

  function extractTrackLabel(t, index) {
    if (!t) return `Track ${index + 1}`;
    if (typeof t === 'string') return t;
    
    try { if (t.languageDescription) return String(t.languageDescription); } catch (e) {}
    try { if (t.displayName) return String(t.displayName); } catch (e) {}
    try { if (t.label) return String(t.label); } catch (e) {}
    try { if (t.language) return String(t.language); } catch (e) {}
    try { if (t.name) return String(t.name); } catch (e) {}
    try { if (t.bcp47) return String(t.bcp47); } catch (e) {}
    try { if (t.id) return String(t.id); } catch (e) {}
    try { if (t.trackId) return String(t.trackId); } catch (e) {}

    return `Track ${index + 1}`;
  }

  function extractTrackId(t, index) {
    if (!t) return `track_${index}`;
    if (typeof t === 'string') return t;

    try { if (typeof t.id === 'string' && t.id) return t.id; } catch (e) {}
    try { if (typeof t.trackId === 'string' && t.trackId) return t.trackId; } catch (e) {}
    try { if (typeof t.bcp47 === 'string' && t.bcp47) return t.bcp47; } catch (e) {}

    try {
      return extractTrackLabel(t, index);
    } catch (e) {
      return `track_${index}`;
    }
  }

  function getCurrentActiveTrackInfo() {
    if (pendingTrackId) {
      return { 
        trackId: String(pendingTrackId), 
        bcp47: pendingTrackBcp47 ? String(pendingTrackBcp47) : null 
      };
    }
    try {
      let player = null;
      try { player = getNetflixPlayer(); } catch (e) {}

      if (player) {
        let currentTrack = null;
        try {
          currentTrack = player.getTimedTextTrack ? player.getTimedTextTrack() : null;
        } catch (e) {}

        if (currentTrack) {
          let trackId = null;
          let bcp47 = null;

          try { trackId = extractTrackId(currentTrack, 0); } catch (e) {}
          try { bcp47 = currentTrack.bcp47 || currentTrack.language; } catch (e) {}

          return { 
            trackId: trackId ? String(trackId) : 'current_track', 
            bcp47: bcp47 ? String(bcp47) : null 
          };
        }
      }
    } catch (e) {
      logError('Error in getCurrentActiveTrackInfo:', e);
    }
    return { trackId: 'current_track', bcp47: null };
  }

  // Intercept Network Requests (XHR & Fetch)
  function handleInterceptedSubtitles(responseText, url) {
    try {
      const cues = parseSubtitlePayload(responseText, url);
      if (cues && cues.length > 0) {
        let trackInfo = { trackId: 'captured_track', bcp47: null };
        try {
          trackInfo = getCurrentActiveTrackInfo();
        } catch (e) {}

        const activeTrackId = trackInfo.trackId || pendingTrackId || 'captured_track';
        const activeBcp47 = trackInfo.bcp47 || pendingTrackBcp47 || null;

        log(`Intercepted ${cues.length} cues for trackId: ${activeTrackId}, bcp47: ${activeBcp47}`);

        window.postMessage({
          type: 'NETFLIX_DUAL_SUB_CAPTURED',
          url: String(url || ''),
          trackId: String(activeTrackId),
          bcp47: activeBcp47 ? String(activeBcp47) : null,
          cues: cues
        }, '*');
      }
    } catch (err) {
      logError('Subtitle processing error:', err);
    }
  }

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      if (isSubtitleUrl(this._url)) {
        const responseText = extractResponseText(this);
        if (responseText) {
          handleInterceptedSubtitles(responseText, this._url);
        }
      }
    });
    return origSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = async function () {
    const response = await origFetch.apply(this, arguments);
    const url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url ? arguments[0].url : '');
    
    if (isSubtitleUrl(url)) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        handleInterceptedSubtitles(text, url);
      } catch (err) {}
    }
    return response;
  };

  // Periodic poll to check player status and inform content script
  setInterval(() => {
    try {
      let player = null;
      try { player = getNetflixPlayer(); } catch (e) {}
      if (!player) return;

      const timedTextTracks = safeGet(() => player.getTimedTextTrackList ? player.getTimedTextTrackList() : [], []);
      const currentTrack = safeGet(() => player.getTimedTextTrack ? player.getTimedTextTrack() : null, null);

      const tracks = timedTextTracks.map((t, idx) => ({
        id: String(extractTrackId(t, idx)),
        language: safeGet(() => t.language || t.bcp47, 'unk'),
        label: String(extractTrackLabel(t, idx)),
        bcp47: safeGet(() => t.bcp47 || t.language, 'unk'),
        isNone: safeGet(() => t.rawTrack ? (t.rawTrack.isNone || t.rawTrack.trackType === 'OFF') : (t.isOff || false), false),
        raw: null
      }));

      const primaryId = currentTrack ? extractTrackId(currentTrack, 0) : null;

      window.postMessage({
        type: 'NETFLIX_DUAL_SUB_PLAYER_STATE',
        tracks: tracks,
        currentPrimaryTrackId: primaryId ? String(primaryId) : null
      }, '*');
    } catch (err) {}
  }, 1200);

  // Listen for requests from content.js to select secondary track via Netflix player API
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === 'NETFLIX_DUAL_SUB_FETCH_TRACK') {
      const targetTrackId = event.data.trackId;
      let player = null;
      try { player = getNetflixPlayer(); } catch (e) {}
      if (!player) return;

      try {
        const timedTextTracks = safeGet(() => player.getTimedTextTrackList ? player.getTimedTextTrackList() : [], []);
        const match = timedTextTracks.find((t, idx) => 
          extractTrackId(t, idx) === targetTrackId || 
          safeGet(() => t.bcp47) === targetTrackId || 
          safeGet(() => t.language) === targetTrackId
        );
        if (match) {
          if (player.setTimedTextTrack) {
            const previousTrack = safeGet(() => player.getTimedTextTrack(), null);
            pendingTrackId = targetTrackId;
            pendingTrackBcp47 = safeGet(() => match.bcp47 || match.language || targetTrackId, targetTrackId);
            log('Requesting secondary track load for:', targetTrackId, 'bcp47:', pendingTrackBcp47);
            
            player.setTimedTextTrack(match);
            
            // Switch back to primary after Netflix fetches secondary timedtext
            setTimeout(() => {
              if (previousTrack && previousTrack !== match) {
                player.setTimedTextTrack(previousTrack);
              }
              pendingTrackId = null;
              pendingTrackBcp47 = null;
            }, 1000);
          }
        }
      } catch (err) {
        logError('Error setting secondary track:', err);
      }
    }
  });

  // Export utilities for testing
  window.__netflixDualSubsInjectedUtils = {
    parseTime: parseTime,
    parseTTML: parseTTML,
    parseJSONTimedText: parseJSONTimedText,
    parseVTT: parseVTT,
    isSubtitleUrl: isSubtitleUrl,
    extractResponseText: extractResponseText,
    safeGet: safeGet
  };

})();
