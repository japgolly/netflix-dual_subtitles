document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('popup-enable');

  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['nds_enabled'], (res) => {
      if (res.nds_enabled !== undefined) {
        toggle.checked = res.nds_enabled;
      }
    });
  }

  toggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ nds_enabled: enabled });
    }
  });
});
