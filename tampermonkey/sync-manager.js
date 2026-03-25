// Sync Manager v1.2.0
// Centralized sync with the PHP server for multi-device teams

(function () {
  'use strict';

  let _apiBase         = null;
  let _currentPrefix   = null;
  let _pushTimer       = null;
  let _heartbeatTimer  = null;
  let _cachedDeviceId  = null;
  let _cachedBasicAuth = null;

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
    if (ua.includes('Windows'))      os = 'Win';
    else if (ua.includes('Macintosh')) os = 'Mac';
    else if (ua.includes('Linux'))   os = 'Linux';

    const suffix   = deviceId.slice(-4).toUpperCase();
    const userPart = username ? `${username}-` : '';
    return `${userPart}${browser}-${os}-${suffix}`;
  }

  // ----------------------------------------------------------------
  // Credentials: always required, prompt if missing
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
  // Sync status indicator (fix #1)
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

    // Auto-fade "ok" after 4s
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
  // Queue merge logic (fix #3: track whether anything actually changed)
  // ----------------------------------------------------------------

  function mergeQueues(local, remote) {
    const merged  = [...local];
    let   changed = false;

    remote.forEach((remotePatient) => {
      const key = window.getPatientKey(
        remotePatient.patientInfo?.idPrefix,
        remotePatient.patientInfo?.nume
      );

      const localIdx = merged.findIndex(
        (p) => window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume) === key
      );

      if (localIdx === -1) {
        merged.push(remotePatient);
        changed = true;
      } else {
        const localP              = merged[localIdx];
        const mergedExportedTests = { ...(remotePatient.exportedTests || {}) };

        Object.entries(localP.exportedTests || {}).forEach(([k, v]) => {
          if (!mergedExportedTests[k] || v > mergedExportedTests[k]) {
            mergedExportedTests[k] = v;
          }
        });

        const newExported   = localP.exported    || remotePatient.exported;
        const newExportedAt = Math.max(localP.exportedAt || 0, remotePatient.exportedAt || 0) || null;
        const newNeeds      = localP.needsReexport || remotePatient.needsReexport;

        // Only mark changed if something actually differs (fix #3)
        if (
          JSON.stringify(localP.exportedTests) !== JSON.stringify(mergedExportedTests) ||
          localP.exported    !== newExported   ||
          localP.exportedAt  !== newExportedAt ||
          localP.needsReexport !== newNeeds
        ) {
          changed = true;
        }

        merged[localIdx] = {
          ...localP,
          exportedTests: mergedExportedTests,
          exported:      newExported,
          exportedAt:    newExportedAt,
          needsReexport: newNeeds,
          excluded:      localP.excluded,
        };
      }
    });

    return { queue: merged, changed };
  }

  // ----------------------------------------------------------------
  // Pull: fetch server state and merge with local
  // ----------------------------------------------------------------

  async function pullState(prefix) {
    if (!prefix) return false;
    setSyncStatus('syncing', `Pulling ${prefix}...`);
    console.log(`[Sync] Pulling state for series: ${prefix}`);

    const result = await apiCall('GET', `state&prefix=${encodeURIComponent(prefix)}`);
    if (!result || !result.success) {
      setSyncStatus('error', 'Pull failed');
      console.warn('[Sync] Pull failed or no server data for this series');
      return false;
    }

    let changed = false;

    // Merge patient queue only if server has data and merge produces changes (fix #3)
    if (result.export_queue && result.export_queue.length > 0) {
      const localQueue          = await window.loadQueueFromStorage();
      const { queue: merged, changed: queueChanged } = mergeQueues(localQueue, result.export_queue);

      if (queueChanged) {
        window._syncPulling = true;
        await window.saveQueueToStorage(merged);
        window._syncPulling = false;
        changed = true;
        console.log(`[Sync] Merged ${result.export_queue.length} patients from server (queue updated)`);
      } else {
        console.log(`[Sync] Pulled ${result.export_queue.length} patients - no changes`);
      }
    }

    // Merge CSV data (server wins if it has a newer timestamp)
    if (result.csv_updated_at) {
      const localKey       = `sante-csv-${prefix}`;
      const localRaw       = localStorage.getItem(localKey);
      const localTimestamp = localRaw ? (JSON.parse(localRaw).timestamp || 0) : 0;

      if (result.csv_updated_at > localTimestamp) {
        if (result.csv_data) {
          localStorage.setItem(localKey, JSON.stringify({
            data:      result.csv_data,
            timestamp: result.csv_updated_at,
            count:     result.csv_data.length,
          }));
          console.log(`[Sync] CSV data updated from server for ${prefix}`);
        } else {
          localStorage.removeItem(localKey);
          localStorage.setItem(`sante-cleared-${prefix}`, result.csv_updated_at.toString());
          window.csvPatientData = [];
          console.log(`[Sync] CSV data cleared from server signal for ${prefix}`);
        }
        changed = true;
      }
    }

    setSyncStatus('ok', `Synced ${prefix}`);
    return changed;
  }

  // ----------------------------------------------------------------
  // Push: send local state to server
  // ----------------------------------------------------------------

  async function pushState(prefix) {
    if (!prefix) return;
    setSyncStatus('syncing', `Pushing ${prefix}...`);
    console.log(`[Sync] Pushing state for series: ${prefix}`);

    const queue       = await window.loadQueueFromStorage();
    const prefixQueue = queue.filter(
      (p) => (p.patientInfo?.idPrefix || '').toLowerCase() === prefix.toLowerCase()
    );

    const localKey   = `sante-csv-${prefix}`;
    const localRaw   = localStorage.getItem(localKey);
    const csvParsed  = localRaw ? JSON.parse(localRaw) : null;
    const clearedAt  = localStorage.getItem(`sante-cleared-${prefix}`);
    const csvUpdatedAt = csvParsed?.timestamp || (clearedAt ? parseInt(clearedAt) : null);

    const result = await apiCall('POST', 'state', {
      prefix,
      export_queue:   prefixQueue,
      csv_data:       csvParsed?.data || null,
      csv_updated_at: csvUpdatedAt,
    });

    if (result?.success) {
      setSyncStatus('ok', `Synced ${prefix}`);
      console.log(`[Sync] Push successful for series: ${prefix}`);
    } else {
      setSyncStatus('error', 'Push failed');
      console.warn('[Sync] Push failed');
    }
  }

  function schedulePush() {
    if (!_currentPrefix || window._syncPulling) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      pushState(_currentPrefix).catch(console.error);
    }, 3000);
  }

  // ----------------------------------------------------------------
  // Lock management
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
  // Prefix management
  // ----------------------------------------------------------------

  async function setCurrentPrefix(prefix) {
    if (_currentPrefix === prefix) return;
    if (_currentPrefix) await releaseLock(_currentPrefix);

    _currentPrefix = prefix;
    if (!prefix) return;

    await apiCall('POST', 'series', { prefix });
    const changed = await pullState(prefix);
    if (changed) await window.syncUIWithLocalStorage();
    await acquireLock(prefix);
  }

  async function fetchCurrentSeries() {
    const result = await apiCall('GET', 'series');
    return result?.current?.prefix || null;
  }

  // ----------------------------------------------------------------
  // Full sync on every page load (fix #4: runs after UI is ready)
  // ----------------------------------------------------------------

  async function forceSync(prefix) {
    if (!prefix) return;
    _currentPrefix = prefix;
    await apiCall('POST', 'series', { prefix });
    await pullState(prefix);
    await acquireLock(prefix);
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------

  async function init() {
    setSyncStatus('syncing', 'Connecting...');
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

  if (typeof unsafeWindow !== 'undefined') {
    unsafeWindow.SyncManager = SyncManager;
  }
})();
