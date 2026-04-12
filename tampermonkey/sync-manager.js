// Sync Manager v2.3.0
// DB-only: all state lives on the server, in-memory cache per session

(function () {
  'use strict';

  let _apiBase         = null;
  let _cachedDeviceId  = null;
  let _cachedBasicAuth = null;
  let _state           = null; // { prefix, queue }

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
        'Sante Sync - URL API:\n' +
        '(Cereți administratorului acest URL - nu este public)'
      );
      if (!url || !url.trim()) {
        setSyncStatus('error', 'Fără URL API - sincronizare dezactivată');
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
      username = prompt('Sante Sync - Utilizator:');
      if (!username) {
        setSyncStatus('error', 'Fără credențiale - sincronizare dezactivată');
        return null;
      }

      password = prompt(`Sante Sync - Parola pentru "${username}":`);
      if (!password) {
        setSyncStatus('error', 'Fără credențiale - sincronizare dezactivată');
        return null;
      }

      const testAuth = btoa(`${username.trim()}:${password}`);
      setSyncStatus('syncing', 'Se verifică credențialele...');
      const ok = await testCredentials(testAuth);
      if (!ok) {
        setSyncStatus('error', 'Utilizator sau parolă invalide');
        alert('Sante Sync: Utilizator sau parolă invalide. Încercați din nou.');
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
    setSyncStatus('idle', 'Credențiale șterse');
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
    el.textContent       = `${s.icon} Stare: ${message}`;

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
            setSyncStatus('error', 'Credențiale respinse');
            console.warn('[Sync] Credentials rejected (401).');
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(response.responseText));
          } catch {
            setSyncStatus('error', 'Răspuns invalid de la server');
            console.warn('[Sync] Invalid server response:', response.responseText);
            resolve(null);
          }
        },
        onerror: (err) => {
          setSyncStatus('error', 'Eroare de rețea');
          console.error('[Sync] Network error:', err);
          resolve(null);
        },
        ontimeout: () => {
          setSyncStatus('error', 'Timeout conexiune');
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
    setSyncStatus('syncing', `Se încarcă ${prefix}...`);
    console.log(`[Sync] Loading state for series: ${prefix}`);

    const result = await apiCall('GET', `state&prefix=${encodeURIComponent(prefix)}`);
    if (!result || !result.success) {
      setSyncStatus('error', 'Încărcare eșuată');
      console.warn('[Sync] Failed to load state from server');
      return;
    }

    _state = {
      prefix,
      queue: result.export_queue || [],
    };

    setSyncStatus('ok', `Încărcat ${prefix}`);
    console.log(`[Sync] Loaded ${_state.queue.length} patients`);
  }

  async function saveState(prefix, queue) {
    if (!prefix) return;

    // Update cache immediately so reads see the new value right away
    _state = { prefix, queue };

    setSyncStatus('syncing', `Se salvează ${prefix}...`);

    const result = await apiCall('POST', 'state', {
      prefix,
      export_queue: queue,
    });

    if (result?.success) {
      setSyncStatus('ok', `Salvat ${prefix}`);
    } else {
      setSyncStatus('error', 'Salvare eșuată');
      console.warn('[Sync] Save failed');
    }
  }

  async function setCurrentSeries(prefix) {
    if (!prefix) return;
    await apiCall('POST', 'series', { prefix });
    console.log(`[Sync] Marked ${prefix} as current series`);
  }

  async function clearCurrentSeries() {
    await apiCall('POST', 'series', { prefix: null });
    console.log('[Sync] Cleared current series');
  }

  async function fetchCurrentSeries() {
    const result = await apiCall('GET', 'series');
    return result?.current?.prefix || null;
  }

  async function fetchAllSeries() {
    const result = await apiCall('GET', 'series_list');
    return result?.series || [];
  }

  // ----------------------------------------------------------------
  // Teamm API proxy calls
  // ----------------------------------------------------------------

  async function syncSessions(year) {
    setSyncStatus('syncing', `Se sincronizează sesiunile ${year}...`);
    const result = await apiCall('POST', 'sync_sessions', { year });
    if (result?.success) {
      setSyncStatus('ok', `${result.created} sesiuni noi, ${result.skipped} existente`);
    } else {
      setSyncStatus('error', 'Sincronizare sesiuni eșuată');
    }
    return result;
  }

  async function fetchGuests(prefix) {
    setSyncStatus('syncing', `Se încarcă pacienții ${prefix}...`);
    const result = await apiCall('GET', `fetch_guests&prefix=${encodeURIComponent(prefix)}`);
    if (result?.success) {
      setSyncStatus('ok', `${result.total} pacienți încărcați`);
    } else {
      setSyncStatus('error', 'Încărcare pacienți eșuată');
    }
    return result;
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------

  async function init() {
    setSyncStatus('syncing', 'Se conectează...');
    await getApiBase();
    await getBasicAuth();
    const name = await getDeviceName();
    setSyncStatus('idle', 'Gata!');
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
    clearCurrentSeries,
    fetchCurrentSeries,
    fetchAllSeries,
    syncSessions,
    fetchGuests,
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
