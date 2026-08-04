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

  // State
  const state = {
    enabled: true,
    secondaryTrackId: null,
    tracks: [],
    cuesMap: new Map(), // url or trackId -> cues
    activeCues: [],
    fontSize: 'medium', // small, medium, large, xlarge
    position: 'bottom', // top, bottom
    textStyle: 'bg', // bg, outline
    currentPrimaryTrackId: null
  };

  // Load saved preferences
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['nds_enabled', 'nds_fontSize', 'nds_position', 'nds_textStyle', 'nds_secondaryTrackId'], (res) => {
      if (res.nds_enabled !== undefined) state.enabled = res.nds_enabled;
      if (res.nds_fontSize) state.fontSize = res.nds_fontSize;
      if (res.nds_position) state.position = res.nds_position;
      if (res.nds_textStyle) state.textStyle = res.nds_textStyle;
      if (res.nds_secondaryTrackId) state.secondaryTrackId = res.nds_secondaryTrackId;
      updateOverlayStyles();
    });
  }

  function savePreferences() {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({
        nds_enabled: state.enabled,
        nds_fontSize: state.fontSize,
        nds_position: state.position,
        nds_textStyle: state.textStyle,
        nds_secondaryTrackId: state.secondaryTrackId
      });
    }
  }

  // DOM Elements
  let overlayEl = null;
  let cueBoxEl = null;
  let panelEl = null;
  let triggerBtnEl = null;
  let videoEl = null;
  let animFrameId = null;

  // Create Subtitle Overlay
  function createOverlay() {
    if (document.getElementById('netflix-dual-sub-overlay')) {
      overlayEl = document.getElementById('netflix-dual-sub-overlay');
      cueBoxEl = overlayEl.querySelector('.nds-cue-box');
      return;
    }

    const playerContainer = document.querySelector('.watch-video') || document.body;

    overlayEl = document.createElement('div');
    overlayEl.id = 'netflix-dual-sub-overlay';
    
    cueBoxEl = document.createElement('div');
    cueBoxEl.className = 'nds-cue-box';
    cueBoxEl.style.display = 'none';

    overlayEl.appendChild(cueBoxEl);
    playerContainer.appendChild(overlayEl);

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
    if (!state.enabled || !state.activeCues || state.activeCues.length === 0) {
      if (cueBoxEl) cueBoxEl.style.display = 'none';
      return;
    }

    // Find current active cue(s)
    const matchingCues = state.activeCues.filter(c => currentTime >= c.start && currentTime <= c.end);

    if (matchingCues.length > 0) {
      const combinedText = matchingCues.map(c => c.text).join('\n');
      if (cueBoxEl) {
        cueBoxEl.innerText = combinedText;
        cueBoxEl.style.display = 'inline-block';
      }
    } else {
      if (cueBoxEl) {
        cueBoxEl.style.display = 'none';
      }
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

  // Create UI Controls & Panel
  function createUI() {
    if (document.getElementById('netflix-dual-sub-panel')) return;

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

    document.body.appendChild(panelEl);

    // Add Events to Panel
    document.getElementById('nds-close-panel').onclick = () => togglePanel(false);
    
    const enableCheckbox = document.getElementById('nds-toggle-enable');
    enableCheckbox.onchange = (e) => {
      state.enabled = e.target.checked;
      savePreferences();
      if (triggerBtnEl) triggerBtnEl.classList.toggle('active', state.enabled);
    };

    const langSelect = document.getElementById('nds-select-language');
    langSelect.onchange = (e) => {
      const selectedId = e.target.value;
      state.secondaryTrackId = selectedId;
      savePreferences();

      // Check if we already captured cues for this track
      if (state.cuesMap.has(selectedId)) {
        state.activeCues = state.cuesMap.get(selectedId);
      } else {
        // Ask injected.js to fetch/switch to this track
        window.postMessage({
          type: 'NETFLIX_DUAL_SUB_FETCH_TRACK',
          trackId: selectedId
        }, '*');
      }
    };

    // Option Buttons Handler
    panelEl.querySelectorAll('.nds-option-btn').forEach(btn => {
      btn.onclick = (e) => {
        const type = btn.getAttribute('data-type');
        const val = btn.getAttribute('data-val');

        state[type] = val;
        savePreferences();

        // Update active class within group
        btn.parentElement.querySelectorAll('.nds-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        updateOverlayStyles();
      };
    });

    populateLanguageSelect();
  }

  function togglePanel(show) {
    if (!panelEl) createUI();
    if (show === undefined) {
      panelEl.classList.toggle('show');
    } else {
      panelEl.classList.toggle('show', show);
    }
  }

  // Inject Player Trigger Button
  function injectTriggerButton() {
    if (document.getElementById('nds-trigger-btn')) return;

    const controlBar = document.querySelector('[data-uia="control-audio-subtitle"]') || 
                       document.querySelector('.watch-video--bottom-controls-container') ||
                       document.querySelector('.controls-full-view');

    if (!controlBar) return;

    triggerBtnEl = document.createElement('button');
    triggerBtnEl.id = 'nds-trigger-btn';
    triggerBtnEl.className = `nds-trigger-btn ${state.enabled ? 'active' : ''}`;
    triggerBtnEl.innerHTML = `<span class="nds-icon">💬</span> Dual Subs`;

    triggerBtnEl.onclick = (e) => {
      e.stopPropagation();
      togglePanel();
    };

    if (controlBar.nextSibling) {
      controlBar.parentNode.insertBefore(triggerBtnEl, controlBar.nextSibling);
    } else {
      controlBar.parentNode.appendChild(triggerBtnEl);
    }
  }

  function populateLanguageSelect() {
    const langSelect = document.getElementById('nds-select-language');
    if (!langSelect) return;

    const currentVal = state.secondaryTrackId;
    langSelect.innerHTML = '<option value="">-- None (Off) --</option>';

    state.tracks.forEach(t => {
      if (t.isNone) return;
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.innerText = t.label + (t.id === state.currentPrimaryTrackId ? ' (Primary)' : '');
      if (t.id === currentVal) opt.selected = true;
      langSelect.appendChild(opt);
    });
  }

  // Listen to messages from injected.js
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    const data = event.data;

    if (data.type === 'NETFLIX_DUAL_SUB_CAPTURED') {
      console.log(`[Netflix Dual Subtitles] Captured ${data.cues.length} cues`);
      // Store cues map
      state.cuesMap.set(data.url, data.cues);
      
      // If we don't have secondary cues set yet or this is selected, set active
      if (!state.activeCues || state.activeCues.length === 0 || state.secondaryTrackId === data.url) {
        state.activeCues = data.cues;
      }
    }

    if (data.type === 'NETFLIX_DUAL_SUB_PLAYER_STATE') {
      if (data.tracks) {
        state.tracks = data.tracks;
        state.currentPrimaryTrackId = data.currentPrimaryTrackId;
        populateLanguageSelect();
      }
    }
  });

  // Observer & Initialization Loop
  setInterval(() => {
    createOverlay();
    createUI();
    injectTriggerButton();
  }, 1000);

  startSyncLoop();

})();
