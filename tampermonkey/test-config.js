// Test Definitions v2.0.0
// Fetches from DB via API

window.TEST_DEFINITIONS = [];

// Called by content.js after SyncManager is initialized
async function loadTestDefinitions() {
  try {
    const result = await window.SyncManager.fetchTestDefinitions();
    if (result?.success && result.tests && result.tests.length > 0) {
      window.TEST_DEFINITIONS = result.tests;
      console.log(`[Tests] Loaded ${result.tests.length} test definitions from DB`);
    } else {
      console.warn('[Tests] No test definitions found in DB');
    }
  } catch (e) {
    console.warn('[Tests] Failed to fetch from API:', e);
  }
}

window.loadTestDefinitions = loadTestDefinitions;
