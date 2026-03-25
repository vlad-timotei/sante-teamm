// Sync Manager v1.1.0
// Centralized sync with the PHP server for multi-device teams

(function () {
  'use strict';

  let _apiBase         = null; // set at runtime from GM storage
  let _currentPrefix   = null;
  let _pushTimer       = null;
  let _heartbeatTimer  = null;
  let _cachedDeviceId  = null;
  let _cachedBasicAuth = null; // base64(username:password), cached after first login

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
    if (ua.includes('Firefox/'))   browser = 'Firefox';
    else if (ua.includes('Edg/'))  browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/')) browser = 'Safari';

    let os = 'OS';
    if (ua.includes('Windows'))    os = 'Win';
    else if (ua.includes('Macintosh')) os = 'Mac';
    else if (ua.includes('Linux')) os = 'Linux';

    // Last 4 chars of deviceId as unique suffix
    const suffix = deviceId.slice(-4).toUpperCase();
    const userPart = username ? `${username}-` : '';
    return `${userPart}${browser}-${os}-${suffix}`;
  }

  // ----------------------------------------------------------------
  // Credentials: prompt once, store in GM (never in localStorage)
  // ----------------------------------------------------------------

  async function getApiBase() {
    if (_apiBase) return _apiBase;
    let url = await GM.getValue('sante-api-url', '');
    if (!url) {
      url = prompt(
        'Sante Sync - API URL:\n' +
        '(Ask your administrator for this URL - it is not public)'
      );
      if (!url || !url.trim()) return null;
      url = url.trim().replace(/\/$/, ''); // strip trailing slash
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
      if (!username) return null;

      password = prompt(`Sante Sync - Password for "${username}":`);
      if (!password) return null;

      // Test credentials before saving
      const testAuth = btoa(`${username.trim()}:${password}`);
      const ok = await testCredentials(testAuth);
      if (!ok) {
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

  // Force re-login and re-setup (clears all stored config)
  async function resetCredentials() {
    await GM.deleteValue('sante-username');
    await GM.deleteValue('sante-password');
    await GM.deleteValue('sante-api-url');
    _cachedBasicAuth = null;
    _apiBase         = null;
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
          // If credentials were rejected, clear cache and let user retry next time
          if (response.status === 401) {
            _cachedBasicAuth = null;
            console.warn('[Sync] Credentials rejected (401).');
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(response.responseText));
          } catch {
            console.warn('[Sync] Invalid server response:', response.responseText);
            resolve(null);
          }
        },
        onerror:   (err) => { console.error('[Sync] Network error:', err); resolve(null); },
        ontimeout: ()    => { console.warn('[Sync] Request timed out'); resolve(null); },
      });
    });
  }

  // ----------------------------------------------------------------
  // Queue merge logic
  // ----------------------------------------------------------------

  function mergeQueues(local, remote) {
    const merged = [...local];

    remote.forEach((remotePatient) => {
      const key = window.getPatientKey(
        remotePatient.patientInfo?.idPrefix,
        remotePatient.patientInfo?.nume
      );

      const localIdx = merged.findIndex(
        (p) => window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume) === key
      );

      if (localIdx === -1) {
        // Patient exists only on server (added by another device)
        merged.push(remotePatient);
      } else {
        // Merge export status: keep local (has full structuredData),
        // but take the most recent exportedTests timestamp from either side
        const localP = merged[localIdx];
        const mergedExportedTests = { ...(remotePatient.exportedTests || {}) };

        Object.entries(localP.exportedTests || {}).forEach(([k, v]) => {
          if (!mergedExportedTests[k] || v > mergedExportedTests[k]) {
            mergedExportedTests[k] = v;
          }
        });

        merged[localIdx] = {
          ...localP,
          exportedTests: mergedExportedTests,
          exported:    localP.exported    || remotePatient.exported,
          exportedAt:  Math.max(localP.exportedAt || 0, remotePatient.exportedAt || 0) || null,
          needsReexport: localP.needsReexport || remotePatient.needsReexport,
          excluded:    localP.excluded,
        };
      }
    });

    return merged;
  }

  // ----------------------------------------------------------------
  // Pull: fetch server state and merge with local
  // ----------------------------------------------------------------

  async function pullState(prefix) {
    if (!prefix) return false;
    console.log(`[Sync] Pulling state for series: ${prefix}`);

    const result = await apiCall('GET', `state&prefix=${encodeURIComponent(prefix)}`);
    if (!result || !result.success) {
      console.warn('[Sync] Pull failed or no server data for this series');
      return false;
    }

    let changed = false;

    // Merge patient queue
    if (result.export_queue && result.export_queue.length > 0) {
      const localQueue = await window.loadQueueFromStorage();
      const merged = mergeQueues(localQueue, result.export_queue);

      // _syncPulling flag prevents an immediate push after saving the pull result
      window._syncPulling = true;
      await window.saveQueueToStorage(merged);
      window._syncPulling = false;

      console.log(`[Sync] Merged ${result.export_queue.length} patients from server`);
      changed = true;
    }

    // Merge CSV data (server wins if it has a newer timestamp)
    if (result.csv_updated_at) {
      const localKey       = `sante-csv-${prefix}`;
      const localRaw       = localStorage.getItem(localKey);
      const localTimestamp = localRaw ? (JSON.parse(localRaw).timestamp || 0) : 0;

      if (result.csv_updated_at > localTimestamp) {
        if (result.csv_data) {
          // Server has newer CSV - update local
          localStorage.setItem(localKey, JSON.stringify({
            data:      result.csv_data,
            timestamp: result.csv_updated_at,
            count:     result.csv_data.length,
          }));
          console.log(`[Sync] CSV data updated from server for ${prefix}`);
        } else {
          // Server has a newer "cleared" state - clear local too
          localStorage.removeItem(localKey);
          localStorage.setItem(`sante-csv-cleared-${prefix}`, result.csv_updated_at.toString());
          window.csvPatientData = [];
          console.log(`[Sync] CSV data cleared from server signal for ${prefix}`);
        }
        changed = true;
      }
    }

    return changed;
  }

  // ----------------------------------------------------------------
  // Push: send local state to server
  // ----------------------------------------------------------------

  async function pushState(prefix) {
    if (!prefix) return;
    console.log(`[Sync] Pushing state for series: ${prefix}`);

    const queue       = await window.loadQueueFromStorage();
    const prefixQueue = queue.filter(
      (p) => (p.patientInfo?.idPrefix || '').toLowerCase() === prefix.toLowerCase()
    );

    const localKey   = `sante-csv-${prefix}`;
    const localRaw   = localStorage.getItem(localKey);
    const csvParsed  = localRaw ? JSON.parse(localRaw) : null;
    const clearedAt  = localStorage.getItem(`sante-csv-cleared-${prefix}`);

    // If CSV was cleared locally, send the cleared-at timestamp so other devices know to clear too
    const csvUpdatedAt = csvParsed?.timestamp || (clearedAt ? parseInt(clearedAt) : null);

    const result = await apiCall('POST', 'state', {
      prefix,
      export_queue:   prefixQueue,
      csv_data:       csvParsed?.data || null,
      csv_updated_at: csvUpdatedAt,
    });

    if (result?.success) {
      console.log(`[Sync] Push successful for series: ${prefix}`);
    } else {
      console.warn('[Sync] Push failed');
    }
  }

  // Debounced push (fires 3s after the last local change)
  function schedulePush() {
    if (!_currentPrefix || window._syncPulling) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      pushState(_currentPrefix).catch(console.error);
    }, 3000);
  }

  // ----------------------------------------------------------------
  // Lock management (prevent duplicate imports)
  // ----------------------------------------------------------------

  async function acquireLock(prefix) {
    const result = await apiCall('POST', 'lock', { prefix });

    if (result && !result.success && result.locked) {
      showLockBanner(prefix, result.locked_by, result.locked_at);
    } else if (result?.success) {
      hideLockBanner();
      startHeartbeat(prefix);
    }

    return result;
  }

  async function releaseLock(prefix) {
    stopHeartbeat();
    await apiCall('DELETE', 'lock', { prefix });
  }

  function startHeartbeat(prefix) {
    stopHeartbeat();
    // Refresh lock every 10 min (lock expires after 30 min of inactivity)
    _heartbeatTimer = setInterval(() => {
      apiCall('POST', 'lock', { prefix }).catch(console.error);
    }, 10 * 60 * 1000);
  }

  function stopHeartbeat() {
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  }

  // ----------------------------------------------------------------
  // UI - Lock warning banner
  // ----------------------------------------------------------------

  function showLockBanner(prefix, lockedBy, lockedAt) {
    let banner = document.getElementById('sante-sync-lock-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'sante-sync-lock-banner';
      banner.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
        'background:#c0392b', 'color:#fff', 'padding:10px 20px',
        'display:flex', 'align-items:center', 'justify-content:space-between',
        'font-size:14px', 'font-weight:bold', 'box-shadow:0 2px 8px rgba(0,0,0,.4)',
      ].join(';');
      document.body.appendChild(banner);
    }

    const time = lockedAt ? new Date(lockedAt).toLocaleTimeString('ro-RO') : '';
    banner.innerHTML = `
      <span>
        &#9888; Series <strong>${prefix}</strong> is open by
        <strong>${lockedBy}</strong>${time ? ` since ${time}` : ''}.
        Be careful to avoid conflicts!
      </span>
      <button id="sante-sync-force-lock" style="
        background:#fff; color:#c0392b; border:none; padding:5px 14px;
        border-radius:4px; cursor:pointer; font-weight:bold; margin-left:20px; white-space:nowrap;
      ">Take over</button>
    `;

    document.getElementById('sante-sync-force-lock')?.addEventListener('click', async () => {
      const result = await apiCall('POST', 'lock', { prefix, force: true });
      if (result?.success) { hideLockBanner(); startHeartbeat(prefix); }
    });
  }

  function hideLockBanner() {
    document.getElementById('sante-sync-lock-banner')?.remove();
  }

  // ----------------------------------------------------------------
  // Active prefix change
  // ----------------------------------------------------------------

  async function setCurrentPrefix(prefix) {
    if (_currentPrefix === prefix) return;

    if (_currentPrefix) await releaseLock(_currentPrefix);

    _currentPrefix = prefix;
    if (!prefix) return;

    // Mark this prefix as the current active series on the server
    await apiCall('POST', 'series', { prefix });

    const changed = await pullState(prefix);
    if (changed) await window.syncUIWithLocalStorage();

    await acquireLock(prefix);
  }

  // Fetch current active series from server (used on fresh devices with no local data)
  async function fetchCurrentSeries() {
    const result = await apiCall('GET', 'series');
    return result?.current?.prefix || null;
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------

  // Full sync on every page load: pull latest state from server regardless of local data
  async function forceSync(prefix) {
    if (!prefix) return;
    _currentPrefix = prefix;
    await apiCall('POST', 'series', { prefix });
    await pullState(prefix);
    await acquireLock(prefix);
  }

  async function init() {
    // Eagerly prompt for credentials on first run so the user isn't surprised later
    await getApiBase();
    await getBasicAuth();
    const name = await getDeviceName();
    console.log('[Sync] SyncManager initialized, device:', name);
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  const SyncManager = {
    init,
    forceSync,
    pullState,
    pushState,
    schedulePush,
    acquireLock,
    releaseLock,
    setCurrentPrefix,
    fetchCurrentSeries,
    resetCredentials,
    getDeviceId,
    getDeviceName,
  };

  window.SyncManager = SyncManager;

  // Also expose on the page window so it's callable from the browser console
  if (typeof unsafeWindow !== 'undefined') {
    unsafeWindow.SyncManager = SyncManager;
  }
})();
