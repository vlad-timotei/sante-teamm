// Test Definitions v2.1.0
// Fetches from DB via API, cached locally per day

window.TEST_DEFINITIONS = [];

// Called by content.js after SyncManager is initialized
async function loadTestDefinitions() {
  const today = new Date().toISOString().slice(0, 10);
  const cached = await GM.getValue('sante-tests-cache', '');

  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.date === today && parsed.tests?.length > 0) {
        window.TEST_DEFINITIONS = parsed.tests;
        console.log(`[Tests] Using ${parsed.tests.length} cached test definitions`);
        return;
      }
    } catch (e) { /* invalid cache, re-fetch */ }
  }

  try {
    const result = await window.SyncManager.fetchTestDefinitions();
    if (result?.success && result.tests && result.tests.length > 0) {
      window.TEST_DEFINITIONS = result.tests;
      await GM.setValue('sante-tests-cache', JSON.stringify({ date: today, tests: result.tests }));
      console.log(`[Tests] Loaded ${result.tests.length} test definitions from DB`);
    } else {
      console.warn('[Tests] No test definitions found in DB');
    }
  } catch (e) {
    console.warn('[Tests] Failed to fetch from API:', e);
  }
}

// Called after saving/deleting a test in the admin modal — forces re-fetch and re-caches
async function refreshTestDefinitions() {
  await GM.deleteValue('sante-tests-cache');
  await loadTestDefinitions();
}

window.loadTestDefinitions = loadTestDefinitions;
window.refreshTestDefinitions = refreshTestDefinitions;
