// Sync Manager v2.3.0
// DB-only: all state lives on the server, in-memory cache per session

(function () {
  'use strict';

  let _apiBase         = null;
  let _cachedDeviceId  = null;
  let _cachedBasicAuth = null;
  let _state           = null; // { prefix, queue }
  let _authInFlight    = null; // in-progress login, shared by concurrent callers
  let _authDeclined    = false; // user cancelled the dialog — don't nag

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
    _apiBase = 'https://centruldumbrava.ro/analize/api/index.php';
    return _apiBase;
  }

  function encodeBasic(username, password) {
    const raw = `${username.trim()}:${password}`;
    try {
      return btoa(raw);
    } catch {
      // btoa() throws on non-Latin1 characters — a password with diacritics
      // used to take down the whole sync with an uncaught InvalidCharacterError.
      return btoa(unescape(encodeURIComponent(raw)));
    }
  }

  // Login dialog, same shape as the one in /analize and /map. Replaces the pair
  // of native prompt() calls, which showed the password in clear text, couldn't
  // report an error next to the field, and froze the whole tab.
  function showLoginDialog({ errorMsg = '', defaultUser = '' } = {}) {
    return new Promise((resolve) => {
      document.getElementById('sante-auth-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'sante-auth-overlay';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(0,0,0,.5)',
        'z-index:99999', 'display:flex', 'align-items:center',
        'justify-content:center',
      ].join(';');
      overlay.innerHTML = `
        <form id="sante-auth-form" style="background:#fff;padding:28px;border-radius:10px;width:320px;max-width:90vw;box-shadow:0 8px 30px rgba(0,0,0,.25);">
          <h3 style="margin:0 0 6px;font-size:18px;">Autentificare</h3>
          <p style="margin:0 0 16px;color:#666;font-size:13px;">Folosește contul de la aplicația Analize.</p>
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">Utilizator</label>
          <input id="sante-auth-user" type="text" autocomplete="username" style="width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:4px;font-size:14px;margin-bottom:12px;box-sizing:border-box;" />
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">Parolă</label>
          <input id="sante-auth-pass" type="password" autocomplete="current-password" style="width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:4px;font-size:14px;margin-bottom:12px;box-sizing:border-box;" />
          <div id="sante-auth-error" style="display:none;color:#d32f2f;font-size:13px;margin-bottom:12px;"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" id="sante-auth-cancel" style="padding:7px 14px;border:0;border-radius:4px;background:#6c757d;color:#fff;font-size:13px;cursor:pointer;">Anulează</button>
            <button type="submit" style="padding:7px 14px;border:0;border-radius:4px;background:#337ab7;color:#fff;font-size:13px;cursor:pointer;">Autentificare</button>
          </div>
        </form>
      `;
      document.body.appendChild(overlay);

      const form   = overlay.querySelector('#sante-auth-form');
      const userEl = overlay.querySelector('#sante-auth-user');
      const passEl = overlay.querySelector('#sante-auth-pass');
      const errEl  = overlay.querySelector('#sante-auth-error');

      if (errorMsg) {
        errEl.textContent   = errorMsg;
        errEl.style.display = 'block';
      }
      userEl.value = defaultUser;
      setTimeout(() => (defaultUser ? passEl : userEl).focus(), 30);

      const finish = (value) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(value);
      };

      const submitCreds = () => {
        const username = userEl.value.trim();
        const password = passEl.value;
        if (!username || !password) {
          errEl.textContent   = 'Completează utilizatorul și parola.';
          errEl.style.display = 'block';
          return;
        }
        finish({ username, password });
      };

      // Enter and Escape are handled here rather than left to the form's own
      // implicit submission: this overlay lives inside Sante's <form
      // id="aspnetForm">, where a stray submit would trigger an ASP.NET
      // postback and reload the page out from under us.
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        } else if (e.key === 'Enter' && overlay.contains(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          submitCreds();
        }
      };

      form.addEventListener('submit', (e) => { e.preventDefault(); submitCreds(); });
      overlay.querySelector('#sante-auth-cancel')
        .addEventListener('click', () => finish(null));
      document.addEventListener('keydown', onKey, true);
    });
  }

  // One dialog at a time: init() and several apiCall()s fire together on load,
  // and each of them used to open its own pair of prompts.
  function getBasicAuth() {
    if (_cachedBasicAuth) return Promise.resolve(_cachedBasicAuth);
    if (_authInFlight) return _authInFlight;
    _authInFlight = resolveBasicAuth().finally(() => { _authInFlight = null; });
    return _authInFlight;
  }

  async function resolveBasicAuth() {
    const storedUser = await GM.getValue('sante-username', '');
    const storedPass = await GM.getValue('sante-password', '');

    if (storedUser && storedPass) {
      _cachedBasicAuth = encodeBasic(storedUser, storedPass);
      return _cachedBasicAuth;
    }

    // Cancelled once: stay quiet until the user asks to log in from the footer,
    // otherwise every later apiCall would re-open the dialog.
    if (_authDeclined) return null;

    let errorMsg    = '';
    let defaultUser = storedUser;

    for (;;) {
      const creds = await showLoginDialog({ errorMsg, defaultUser });
      if (!creds) {
        _authDeclined = true;
        setSyncStatus('error', 'Fără credențiale - sincronizare dezactivată');
        window.renderAuthFooter?.();
        return null;
      }

      defaultUser = creds.username;
      const testAuth = encodeBasic(creds.username, creds.password);
      setSyncStatus('syncing', 'Se verifică credențialele...');
      const verdict = await testCredentials(testAuth);

      if (verdict === 'bad') {
        setSyncStatus('error', 'Utilizator sau parolă invalide');
        errorMsg = 'Utilizator sau parolă invalide.';
        continue;
      }
      if (verdict === 'unknown') {
        // Server unreachable or throttling us — the password may well be right,
        // but we can't confirm it, so don't save it. Keep the dialog open with
        // the reason rather than persisting something we'd be stuck with.
        setSyncStatus('error', 'Nu am putut verifica credențialele - încearcă mai târziu');
        errorMsg = 'Serverul nu a putut verifica credențialele acum. Încearcă din nou peste câteva minute.';
        continue;
      }

      await GM.setValue('sante-username', creds.username);
      await GM.setValue('sante-password', creds.password);
      _cachedBasicAuth = testAuth;
      window.renderAuthFooter?.();
      return _cachedBasicAuth;
    }
  }

  async function getUsername() {
    return await GM.getValue('sante-username', '');
  }

  // Footer "Autentificare" — clears the declined flag so the dialog reopens.
  async function login() {
    _authDeclined    = false;
    _cachedBasicAuth = null;
    return !!(await getBasicAuth());
  }

  async function logout() {
    await resetCredentials();
    _authDeclined = true;
    setSyncStatus('idle', 'Deconectat');
  }

  // Returns 'ok' | 'bad' | 'unknown'. The distinction matters: only 'ok' may be
  // persisted. This used to be `r.status !== 401`, which meant any non-401 —
  // a 429 throttle, a 500, a proxy error — counted as a valid password. A wrong
  // password typed during a throttle window was then saved permanently, and
  // every later sync failed with "Credențiale respinse" and re-read the same
  // bad password from storage, so it could never recover.
  async function testCredentials(basicAuth) {
    const base = await getApiBase();
    if (!base) return 'unknown';
    return new Promise((resolve) => {
      GM.xmlHttpRequest({
        method: 'GET',
        url: `${base}?action=state&prefix=_test`,
        headers: { 'Authorization': `Basic ${basicAuth}` },
        timeout: 8000,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) return resolve('ok');
          if (r.status === 401) return resolve('bad');
          return resolve('unknown'); // 429, 5xx, … — can't tell, don't persist
        },
        onerror:   ()  => resolve('unknown'),
        ontimeout: ()  => resolve('unknown'),
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
    window.renderAuthFooter?.();
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
            // Clear the STORED password too, not just the in-memory cache.
            // Previously only the cache was dropped, so getBasicAuth() read the
            // same rejected password back out of GM storage on the next call and
            // never re-prompted — the extension stayed stuck on "Credențiale
            // respinse" until the user cleared storage by hand.
            _cachedBasicAuth = null;
            Promise.all([
              GM.deleteValue('sante-username'),
              GM.deleteValue('sante-password'),
            ]).then(() => window.renderAuthFooter?.());
            setSyncStatus('error', 'Credențiale respinse - vei fi întrebat din nou');
            console.warn('[Sync] Credentials rejected (401); cleared stored credentials.');
            resolve(null);
            return;
          }
          if (response.status === 429) {
            // Throttled, not wrong. Keep the stored credentials — clearing them
            // here would turn a temporary lockout into a re-login prompt, and
            // the body below is valid JSON, so without this branch it would be
            // parsed and returned as if it were sync data.
            let wait = 900;
            try { wait = Number(JSON.parse(response.responseText).retryAfter) || 900; } catch {}
            const mins = Math.max(1, Math.ceil(wait / 60));
            setSyncStatus('error', `Prea multe încercări - reîncearcă peste ~${mins} min`);
            console.warn(`[Sync] Throttled (429); retry after ~${mins} min.`);
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

  async function syncSessions() {
    // Check if we already have sessions for the current year in cache
    const yy = String(new Date().getFullYear()).slice(-2);
    const cached = await GM.getValue('sante-sessions-cache', '');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const hasCurrentYear = parsed.some((s) => s.prefix.startsWith(yy));
        if (hasCurrentYear) {
          console.log('[Sync] Sessions cached, skipping API sync');
          return { success: true, created: 0, skipped: parsed.length, cached: true };
        }
      } catch (e) { /* invalid cache, re-fetch */ }
    }

    setSyncStatus('syncing', 'Se sincronizează sejururile...');
    const result = await apiCall('POST', 'sync_sessions');
    if (result?.success) {
      // Update cache
      const fresh = await fetchAllSeries();
      await GM.setValue('sante-sessions-cache', JSON.stringify(fresh));
      const msg = result.created > 0
        ? `${result.created} sejururi noi, ${result.skipped} existente`
        : 'Sejururi încărcate!';
      setSyncStatus('ok', msg);
    } else {
      setSyncStatus('error', 'Sincronizare sejururi eșuată');
    }
    return result;
  }

  async function fetchTestDefinitions() {
    setSyncStatus('syncing', 'Se încarcă testele...');
    const result = await apiCall('GET', 'test_definitions');
    if (result?.success) {
      setSyncStatus('ok', `${result.tests.length} teste încărcate`);
    } else {
      setSyncStatus('error', 'Încărcare teste eșuată');
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
    fetchTestDefinitions,
    apiCall,
    resetCredentials,
    getUsername,
    login,
    logout,
    getDeviceId,
    getDeviceName,
    setSyncStatus,
  };

  window.SyncManager = SyncManager;

  if (typeof unsafeWindow !== 'undefined') {
    unsafeWindow.SyncManager = SyncManager;
  }
})();
