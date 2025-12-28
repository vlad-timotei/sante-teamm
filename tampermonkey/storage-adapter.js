// Storage Adapter v1.0.0
// Wraps Tampermonkey GM.* APIs to provide a unified storage interface

const StorageAdapter = {
  async get(keys) {
    const result = {};
    const keyArray = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArray) {
      result[key] = await GM.getValue(key, null);
    }
    return result;
  },

  async set(data) {
    for (const [key, value] of Object.entries(data)) {
      await GM.setValue(key, value);
    }
  },

  async remove(key) {
    await GM.deleteValue(key);
  },

  getWorkerURL() {
    return 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
};

// Make available globally
window.StorageAdapter = StorageAdapter;
