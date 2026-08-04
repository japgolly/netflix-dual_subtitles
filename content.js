(function () {
  'use strict';

  console.log('[Netflix Dual Subtitles] Content script loaded');

  // Inject main world script (injected.js)
  function injectMainWorldScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  injectMainWorldScript();

  // Helper to find the active Netflix player container
  function getPlayerContainer() {
    return document.querySelector('.watch-video') || 
           document.querySelector('[data-uia="watch-video"]') || 
           document.querySelector('.videoplayer') || 
           document.body;
  }

  // State
  const state = {
    enabled: true,
    furigana: true,
    secondaryTrackId: null,
    tracks: [],
    cuesMap: new Map(),
    activeCues: [],
    fontSize: 'medium',
    position: 'bottom',
    textStyle: 'bg',
    currentPrimaryTrackId: null,
    panelVisible: false
  };

  let autoFetchedSecondary = false;

  // Load saved preferences
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['nds_enabled', 'nds_furigana', 'nds_fontSize', 'nds_position', 'nds_textStyle', 'nds_secondaryTrackId'], (res) => {
      if (res.nds_enabled !== undefined) state.enabled = res.nds_enabled;
      if (res.nds_furigana !== undefined) state.furigana = res.nds_furigana;
      if (res.nds_fontSize) state.fontSize = res.nds_fontSize;
      if (res.nds_position) state.position = res.nds_position;
      if (res.nds_textStyle) state.textStyle = res.nds_textStyle;
      if (res.nds_secondaryTrackId) state.secondaryTrackId = res.nds_secondaryTrackId;
      
      updateOverlayStyles();
      checkAndAutoFetchSecondaryTrack();
    });
  }

  function savePreferences() {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({
        nds_enabled: state.enabled,
        nds_furigana: state.furigana,
        nds_fontSize: state.fontSize,
        nds_position: state.position,
        nds_textStyle: state.textStyle,
        nds_secondaryTrackId: state.secondaryTrackId
      });
    }
  }

  // Auto-fetch saved secondary track when player is ready
  function checkAndAutoFetchSecondaryTrack() {
    if (!state.secondaryTrackId || autoFetchedSecondary) return;
    if (!state.tracks || state.tracks.length === 0) return;

    // Find saved track in state.tracks
    const match = state.tracks.find(t => 
      t.id === state.secondaryTrackId || 
      t.bcp47 === state.secondaryTrackId || 
      t.language === state.secondaryTrackId ||
      t.label.toLowerCase().includes(state.secondaryTrackId.toLowerCase())
    );

    if (match) {
      const targetId = match.id;
      if (state.cuesMap.has(targetId)) {
        state.activeCues = state.cuesMap.get(targetId);
        autoFetchedSecondary = true;
        console.log('[Netflix Dual Subtitles] Auto-restored saved secondary cues:', targetId);
      } else {
        autoFetchedSecondary = true;
        console.log('[Netflix Dual Subtitles] Auto-requesting saved secondary track on page load:', targetId);
        window.postMessage({
          type: 'NETFLIX_DUAL_SUB_FETCH_TRACK',
          trackId: targetId
        }, '*');
      }
    }
  }

  // DOM Elements
  let rootEl = null;
  let overlayEl = null;
  let cueBoxEl = null;
  let panelEl = null;
  let triggerBtnEl = null;
  let videoEl = null;
  let animFrameId = null;

  // Build / Ensure Root Host
  function ensureRootHost() {
    const playerContainer = getPlayerContainer();

    if (!rootEl || !rootEl.isConnected) {
      rootEl = document.getElementById('nds-root');
      if (!rootEl) {
        rootEl = document.createElement('div');
        rootEl.id = 'nds-root';
      }
    }

    if (rootEl.parentNode !== playerContainer) {
      playerContainer.appendChild(rootEl);
    }
  }

  // Create Subtitle Overlay
  function createOverlay() {
    ensureRootHost();

    if (document.getElementById('netflix-dual-sub-overlay')) {
      overlayEl = document.getElementById('netflix-dual-sub-overlay');
      cueBoxEl = overlayEl.querySelector('.nds-cue-box');
      return;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'netflix-dual-sub-overlay';
    
    cueBoxEl = document.createElement('div');
    cueBoxEl.className = 'nds-cue-box';
    cueBoxEl.style.display = 'none';

    overlayEl.appendChild(cueBoxEl);
    rootEl.appendChild(overlayEl);

    updateOverlayStyles();
  }

  function updateOverlayStyles() {
    if (!overlayEl) return;

    overlayEl.className = '';
    overlayEl.classList.add(`position-${state.position}`);
    overlayEl.classList.add(`nds-size-${state.fontSize}`);
    overlayEl.classList.add(`nds-style-${state.textStyle}`);
  }

  // Render Subtitles
  function renderSecondaryCues(currentTime) {
    try {
      if (!state.enabled) {
        if (cueBoxEl) cueBoxEl.style.display = 'none';
        return;
      }

      // Check if activeCues need fallback from cuesMap for secondaryTrackId
      if (!state.activeCues || state.activeCues.length === 0) {
        if (state.secondaryTrackId && state.cuesMap.has(state.secondaryTrackId)) {
          state.activeCues = state.cuesMap.get(state.secondaryTrackId);
        }
      }

      if (!state.activeCues || state.activeCues.length === 0) {
        if (cueBoxEl) cueBoxEl.style.display = 'none';
        return;
      }

      const matchingCues = state.activeCues.filter(c => currentTime >= c.start && currentTime <= c.end);

      if (matchingCues.length > 0) {
        const rawText = matchingCues.map(c => c.text).join('\n');
        if (cueBoxEl) {
          try {
            if (state.furigana && window.NetflixDualSubsFurigana && window.NetflixDualSubsFurigana.isJapanese(rawText)) {
              cueBoxEl.innerHTML = window.NetflixDualSubsFurigana.toFurigana(rawText);
            } else {
              cueBoxEl.innerText = rawText;
            }
          } catch (err) {
            cueBoxEl.innerText = rawText;
          }
          cueBoxEl.style.display = 'inline-block';
        }
      } else {
        if (cueBoxEl) {
          cueBoxEl.style.display = 'none';
        }
      }
    } catch (e) {
      console.error('[Netflix Dual Subtitles] Render error:', e);
    }
  }

  // Video Loop Sync
  function startSyncLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function tick() {
      if (!videoEl || !videoEl.isConnected) {
        videoEl = document.querySelector('video');
      }

      if (videoEl && !videoEl.paused) {
        renderSecondaryCues(videoEl.currentTime);
      }
      animFrameId = requestAnimationFrame(tick);
    }
    tick();
  }

  // Toggle Panel Helper
  function setPanelVisibility(show) {
    state.panelVisible = show === undefined ? !state.panelVisible : show;
    console.log('[Netflix Dual Subtitles] Setting panel visibility to:', state.panelVisible);

    if (!panelEl) createUI();
    if (!panelEl) return;

    if (state.panelVisible) {
      panelEl.classList.add('show');
    } else {
      panelEl.classList.remove('show');
    }
  }

  // Language Display Formatting
  let languageNames = null;
  try {
    languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
  } catch (e) {}

  function formatLanguageLabel(rawLabel, bcp47Code) {
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
  }

  // Create UI Controls & Panel
  function createUI() {
    ensureRootHost();

    if (document.getElementById('netflix-dual-sub-panel')) {
      panelEl = document.getElementById('netflix-dual-sub-panel');
      return;
    }

    // Control Panel
    panelEl = document.createElement('div');
    panelEl.id = 'netflix-dual-sub-panel';
    panelEl.innerHTML = `
      <div class="nds-panel-header">
        <div class="nds-panel-title"><span>✦</span> Dual Subtitles</div>
        <button class="nds-close-btn" id="nds-close-panel">✕</button>
      </div>

      <div class="nds-field-group nds-switch-row">
        <span class="nds-label" style="margin:0;">Enable Dual Subtitles</span>
        <label class="nds-toggle">
          <input type="checkbox" id="nds-toggle-enable" ${state.enabled ? 'checked' : ''}>
          <span class="nds-slider"></span>
        </label>
      </div>

      <div class="nds-field-group">
        <label class="nds-label">Secondary Language</label>
        <select class="nds-select" id="nds-select-language">
          <option value="">Select track...</option>
        </select>
      </div>

      <div class="nds-field-group nds-switch-row">
        <span class="nds-label" style="margin:0;">Japanese Furigana (ふりがな)</span>
        <label class="nds-toggle">
          <input type="checkbox" id="nds-toggle-furigana" ${state.furigana ? 'checked' : ''}>
          <span class="nds-slider"></span>
        </label>
      </div>

      <div class="nds-field-group">
        <label class="nds-label">Position</label>
        <div class="nds-btn-group">
          <button class="nds-option-btn ${state.position === 'top' ? 'active' : ''}" data-type="position" data-val="top">Top</button>
          <button class="nds-option-btn ${state.position === 'bottom' ? 'active' : ''}" data-type="position" data-val="bottom">Bottom</button>
        </div>
      </div>

      <div class="nds-field-group">
        <label class="nds-label">Font Size</label>
        <div class="nds-btn-group">
          <button class="nds-option-btn ${state.fontSize === 'small' ? 'active' : ''}" data-type="fontSize" data-val="small">S</button>
          <button class="nds-option-btn ${state.fontSize === 'medium' ? 'active' : ''}" data-type="fontSize" data-val="medium">M</button>
          <button class="nds-option-btn ${state.fontSize === 'large' ? 'active' : ''}" data-type="fontSize" data-val="large">L</button>
          <button class="nds-option-btn ${state.fontSize === 'xlarge' ? 'active' : ''}" data-type="fontSize" data-val="xlarge">XL</button>
        </div>
      </div>

      <div class="nds-field-group">
        <label class="nds-label">Text Style</label>
        <div class="nds-btn-group">
          <button class="nds-option-btn ${state.textStyle === 'bg' ? 'active' : ''}" data-type="textStyle" data-val="bg">Dark Box</button>
          <button class="nds-option-btn ${state.textStyle === 'outline' ? 'active' : ''}" data-type="textStyle" data-val="outline">Gold Outline</button>
        </div>
      </div>
    `;

    rootEl.appendChild(panelEl);

    // Prevent click events inside panel from bubbling to Netflix
    ['click', 'mousedown', 'pointerdown'].forEach(evtType => {
      panelEl.addEventListener(evtType, (e) => e.stopPropagation());
    });

    // Add Events to Panel
    const closeBtn = document.getElementById('nds-close-panel');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        setPanelVisibility(false);
      };
    }
    
    const enableCheckbox = document.getElementById('nds-toggle-enable');
    if (enableCheckbox) {
      enableCheckbox.onchange = (e) => {
        state.enabled = e.target.checked;
        savePreferences();
        if (triggerBtnEl) triggerBtnEl.classList.toggle('active', state.enabled);
      };
    }

    const furiganaCheckbox = document.getElementById('nds-toggle-furigana');
    if (furiganaCheckbox) {
      furiganaCheckbox.onchange = (e) => {
        state.furigana = e.target.checked;
        savePreferences();
      };
    }

    const langSelect = document.getElementById('nds-select-language');
    if (langSelect) {
      langSelect.onchange = (e) => {
        const selectedId = e.target.value;
        state.secondaryTrackId = selectedId;
        autoFetchedSecondary = true;
        savePreferences();

        if (state.cuesMap.has(selectedId)) {
          state.activeCues = state.cuesMap.get(selectedId);
          console.log('[Netflix Dual Subtitles] Switched active cues to selected trackId:', selectedId);
        } else {
          console.log('[Netflix Dual Subtitles] Requesting fetch for secondary trackId:', selectedId);
          window.postMessage({
            type: 'NETFLIX_DUAL_SUB_FETCH_TRACK',
            trackId: selectedId
          }, '*');
        }
      };
    }

    // Option Buttons Handler
    panelEl.querySelectorAll('.nds-option-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const type = btn.getAttribute('data-type');
        const val = btn.getAttribute('data-val');

        state[type] = val;
        savePreferences();

        btn.parentElement.querySelectorAll('.nds-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        updateOverlayStyles();
      };
    });

    populateLanguageSelect();
  }

  // Inject Player Trigger Button
  function createTriggerButton() {
    ensureRootHost();

    if (document.getElementById('nds-trigger-btn')) return;

    triggerBtnEl = document.createElement('button');
    triggerBtnEl.id = 'nds-trigger-btn';
    triggerBtnEl.type = 'button';
    triggerBtnEl.className = `nds-trigger-btn ${state.enabled ? 'active' : ''}`;
    triggerBtnEl.innerHTML = `<span class="nds-icon">💬</span> Dual Subs`;

    rootEl.appendChild(triggerBtnEl);
  }

  function populateLanguageSelect() {
    const langSelect = document.getElementById('nds-select-language');
    if (!langSelect) return;

    const currentVal = state.secondaryTrackId;
    langSelect.innerHTML = '<option value="">-- None (Off) --</option>';

    const addedIds = new Set();

    // 1. Tracks from Player API
    state.tracks.forEach((t, idx) => {
      if (t.isNone) return;
      const trackId = t.id || `track_${idx}`;
      if (addedIds.has(trackId)) return;
      addedIds.add(trackId);

      const displayLabel = formatLanguageLabel(t.label, t.bcp47 || t.language);
      const isPrimary = (trackId === state.currentPrimaryTrackId);

      const opt = document.createElement('option');
      opt.value = trackId;
      opt.innerText = displayLabel + (isPrimary ? ' (Primary)' : '');
      if (trackId === currentVal) opt.selected = true;
      langSelect.appendChild(opt);
    });

    // 2. Additional tracks captured via Network Interception
    state.cuesMap.forEach((cues, key) => {
      if (!addedIds.has(key)) {
        addedIds.add(key);
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = `Captured Track (${cues.length} cues)`;
        if (key === currentVal) opt.selected = true;
        langSelect.appendChild(opt);
      }
    });
  }

  // Global Capturing Event Listener for Trigger Clicks
  window.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('#nds-trigger-btn') || e.target.closest('.nds-trigger-btn');
    if (targetBtn) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('[Netflix Dual Subtitles] Trigger button clicked via global capture handler');
      setPanelVisibility();
    }
  }, true);

  window.addEventListener('pointerdown', (e) => {
    const targetBtn = e.target.closest('#nds-trigger-btn') || e.target.closest('.nds-trigger-btn');
    if (targetBtn) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);

  // Keyboard Shortcut: Alt + S or Option + S to toggle panel
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      e.preventDefault();
      console.log('[Netflix Dual Subtitles] Alt+S shortcut pressed');
      setPanelVisibility();
    }
  });

  // Listen to messages from injected.js
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    const data = event.data;

    if (data.type === 'NETFLIX_DUAL_SUB_CAPTURED') {
      console.log(`[Netflix Dual Subtitles] Captured ${data.cues.length} cues for trackId: ${data.trackId}`);

      if (data.trackId) state.cuesMap.set(data.trackId, data.cues);
      if (data.bcp47) state.cuesMap.set(data.bcp47, data.cues);
      if (data.url) state.cuesMap.set(data.url, data.cues);
      
      // If a secondaryTrackId is selected, match and activate cues immediately!
      if (state.secondaryTrackId) {
        if (state.secondaryTrackId === data.trackId || state.secondaryTrackId === data.bcp47 || state.secondaryTrackId === data.url) {
          state.activeCues = data.cues;
          console.log('[Netflix Dual Subtitles] Activated secondary cues for saved preference:', state.secondaryTrackId);
        }
      }
      populateLanguageSelect();
    }

    if (data.type === 'NETFLIX_DUAL_SUB_PLAYER_STATE') {
      if (data.tracks) {
        state.tracks = data.tracks;
        state.currentPrimaryTrackId = data.currentPrimaryTrackId;
        populateLanguageSelect();
        checkAndAutoFetchSecondaryTrack();
      }
    }
  });

  // Observer & Initialization Loop
  setInterval(() => {
    createOverlay();
    createUI();
    createTriggerButton();
  }, 800);

  startSyncLoop();

})();
