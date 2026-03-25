// Sync Manager v2.0.0
// DB-only: all state lives on the server, in-memory cache per session

(function () {
  'use strict';

  let _apiBase         = null;
  let _cachedDeviceId  = null;
  let _cachedBasicAuth = null;
  let _state           = null; // { prefix, queue, csv_data, csv_updated_at }

  // ----------------------------------------------------------------
  // Device identity
  // ----------------------------------------------------------------

  async function getDeviceId() {
    if (_cachedDeviceId) return _cachedDeviceId;
    let id = await GM.getValue('sante-device-id', '');
    if (!id) {
      id = 'dev-' + Math.random().toString(36).substr(2, 10);
      await GM.setValue('sante-device-id', id);
    }
    _cachedDeviceId = id;
    return id;
  }

  async function getDeviceName() {
    const deviceId = await getDeviceId();
    const username = await GM.getValue('sante-username', '');
    const ua = navigator.userAgent;

    let browser = 'Browser';
    if (ua.includes('Firefox/'))     browser = 'Firefox';
    else if (ua.includes('Edg/'))    browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/')) browser = 'Safari';

    let os = 'OS';
    if (ua.includes('Windows'))        os = 'Win';
    else if (ua.includes('Macintosh')) os = 'Mac';
    else if (ua.includes('Linux'))     os = 'Linux';

    const suffix   = deviceId.slice(-4).toUpperCase();
    const userPart = username ? `${username}-` : '';
    return `${userPart}${browser}-${os}-${suffix}`;
  }

  // ----------------------------------------------------------------
  // Credentials
  // ----------------------------------------------------------------

  async function getApiBase() {
    if (_apiBase) return _apiBase;
    let url = await GM.getValue('sante-api-url', '');
    if (!url) {
      url = prompt(
        'Sante Sync - API URL:\n' +
        '(Ask your administrator for this URL - it is not public)'
      );
      if (!url || !url.trim()) {
        setSyncStatus('error', 'No API URL - sync disabled');
        return null;
      }
      url = url.trim().replace(/\/$/, '');
      await GM.setValue('sante-api-url', url);
    }
    _apiBase = url;
    return _apiBase;
  }

  async function getBasicAuth() {
    if (_cachedBasicAuth) return _cachedBasicAuth;

    let username = await GM.getValue('sante-username', '');
    let password = await GM.getValue('sante-password', '');

    if (!username || !password) {
      username = prompt('Sante Sync - Username:');
      if (!username) {
        setSyncStatus('error', 'No credentials - sync disabled');
        return null;
      }

      password = prompt(`Sante Sync - Password for "${username}":`);
      if (!password) {
        setSyncStatus('error', 'No credentials - sync disabled');
        return null;
      }

      const testAuth = btoa(`${username.trim()}:${password}`);
      setSyncStatus('syncing', 'Verifying credentials...');
      const ok = await testCredentials(testAuth);
      if (!ok) {
        setSyncStatus('error', 'Invalid username or password');
        alert('Sante Sync: Invalid username or password. Try again.');
        return null;
      }

      await GM.setValue('sante-username', username.trim());
      await GM.setValue('sante-password', password);
    }

    _cachedBasicAuth = btoa(`${username.trim()}:${password}`);
    return _cachedBasicAuth;
  }

  async function testCredentials(basicAuth) {
    const base = await getApiBase();
    if (!base) return false;
    return new Promise((resolve) => {
      GM.xmlHttpRequest({
        method: 'GET',
        url: `${base}?action=state&prefix=_test`,
        headers: { 'Authorization': `Basic ${basicAuth}` },
        timeout: 8000,
        onload:    (r) => resolve(r.status !== 401),
        onerror:   ()  => resolve(false),
        ontimeout: ()  => resolve(false),
      });
    });
  }

  async function resetCredentials() {
    await GM.deleteValue('sante-username');
    await GM.deleteValue('sante-password');
    await GM.deleteValue('sante-api-url');
    _cachedBasicAuth = null;
    _apiBase         = null;
    setSyncStatus('idle', 'Credentials cleared');
  }

  // ----------------------------------------------------------------
  // Sync status indicator
  // ----------------------------------------------------------------

  function getSyncIndicator() {
    let el = document.getElementById('sante-sync-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sante-sync-status';
      el.style.cssText = [
        'position:fixed', 'bottom:12px', 'right:12px', 'z-index:99998',
        'padding:5px 12px', 'border-radius:20px', 'font-size:12px',
        'font-weight:bold', 'box-shadow:0 2px 6px rgba(0,0,0,.25)',
        'transition:opacity .4s', 'cursor:default',
      ].join(';');
      document.body.appendChild(el);
    }
    return el;
  }

  function setSyncStatus(state, message) {
    const el = getSyncIndicator();
    const styles = {
      syncing: { bg: '#f0a500', color: '#fff', icon: '↻' },
      ok:      { bg: '#27ae60', color: '#fff', icon: '✓' },
      error:   { bg: '#c0392b', color: '#fff', icon: '✗' },
      idle:    { bg: '#95a5a6', color: '#fff', icon: '·' },
    };
    const s = styles[state] || styles.idle;
    el.style.background  = s.bg;
    el.style.color       = s.color;
    el.style.opacity     = '1';
    el.textContent       = `${s.icon} Sync: ${message}`;

    if (state === 'ok') {
      setTimeout(() => { el.style.opacity = '0.4'; }, 4000);
    }
  }

  // ----------------------------------------------------------------
  // API communication
  // ----------------------------------------------------------------

  async function apiCall(method, action, data = null) {
    const base = await getApiBase();
    if (!base) return null;

    const auth = await getBasicAuth();
    if (!auth) return null;

    const deviceId   = await getDeviceId();
    const deviceName = await getDeviceName();

    return new Promise((resolve) => {
      GM.xmlHttpRequest({
        method,
        url: `${base}?action=${action}`,
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/json',
          'X-Device-Id':   deviceId,
          'X-Device-Name': deviceName,
        },
        data: data ? JSON.stringify(data) : undefined,
        timeout: 15000,
        onload: (response) => {
          if (response.status === 401) {
            _cachedBasicAuth = null;
            setSyncStatus('error', 'Credentials rejected');
            console.warn('[Sync] Credentials rejected (401).');
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(response.responseText));
          } catch {
            setSyncStatus('error', 'Invalid server response');
            console.warn('[Sync] Invalid server response:', response.responseText);
            resolve(null);
          }
        },
        onerror: (err) => {
          setSyncStatus('error', 'Network error');
          console.error('[Sync] Network error:', err);
          resolve(null);
        },
        ontimeout: () => {
          setSyncStatus('error', 'Timeout');
          console.warn('[Sync] Request timed out');
          resolve(null);
        },
      });
    });
  }

  // ----------------------------------------------------------------
  // State management — DB is the source of truth, _state is the
  // in-memory cache for the current browser session
  // ----------------------------------------------------------------

  function getCachedState() {
    return _state;
  }

  async function loadState(prefix) {
    if (!prefix) return;
    setSyncStatus('syncing', `Loading ${prefix}...`);
    console.log(`[Sync] Loading state for series: ${prefix}`);

    const result = await apiCall('GET', `state&prefix=${encodeURIComponent(prefix)}`);
    if (!result || !result.success) {
      setSyncStatus('error', 'Load failed');
      console.warn('[Sync] Failed to load state from server');
      return;
    }

    _state = {
      prefix,
      queue:          result.export_queue   || [],
      csv_data:       result.csv_data        || null,
      csv_updated_at: result.csv_updated_at  || null,
    };

    const csvInfo = _state.csv_data ? `${_state.csv_data.length} CSV rows` : 'no CSV';
    setSyncStatus('ok', `Loaded ${prefix}`);
    console.log(`[Sync] Loaded ${_state.queue.length} patients, ${csvInfo}`);
  }

  async function saveState(prefix, queue, csvData, csvUpdatedAt) {
    if (!prefix) return;

    // Update cache immediately so reads see the new value right away
    _state = { prefix, queue, csv_data: csvData || null, csv_updated_at: csvUpdatedAt || null };

    setSyncStatus('syncing', `Saving ${prefix}...`);

    const result = await apiCall('POST', 'state', {
      prefix,
      export_queue:   queue,
      csv_data:       csvData        || null,
      csv_updated_at: csvUpdatedAt   || null,
    });

    if (result?.success) {
      setSyncStatus('ok', `Saved ${prefix}`);
    } else {
      setSyncStatus('error', 'Save failed');
      console.warn('[Sync] Save failed');
    }
  }

  async function setCurrentSeries(prefix) {
    if (!prefix) return;
    await apiCall('POST', 'series', { prefix });
    console.log(`[Sync] Marked ${prefix} as current series`);
  }

  async function fetchCurrentSeries() {
    const result = await apiCall('GET', 'series');
    return result?.current?.prefix || null;
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------

  async function init() {
    setSyncStatus('syncing', 'Connecting...');
    await getApiBase();
    await getBasicAuth();
    const name = await getDeviceName();
    setSyncStatus('idle', 'Ready');
    console.log('[Sync] SyncManager initialized, device:', name);
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  const SyncManager = {
    init,
    loadState,
    saveState,
    getCachedState,
    setCurrentSeries,
    fetchCurrentSeries,
    resetCredentials,
    getDeviceId,
    getDeviceName,
    setSyncStatus,
  };

  window.SyncManager = SyncManager;

  if (typeof unsafeWindow !== 'undefined') {
    unsafeWindow.SyncManager = SyncManager;
  }
})();
