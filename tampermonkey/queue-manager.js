// Queue Manager v1.0.0
// Patient queue storage and management functions

function getPatientKey(idPrefix, patientName) {
  const normalizedPrefix = (idPrefix || "").trim().toLowerCase();
  const normalizedName = (patientName || "").trim().toLowerCase();
  return `${normalizedPrefix}_${normalizedName}`;
}

async function loadQueueFromStorage() {
  try {
    const result = await StorageAdapter.get(["sante-export-queue"]);
    const queue = result["sante-export-queue"] || [];
    console.log(`📦 Loaded queue from storage: ${queue.length} patients`);
    return queue;
  } catch (error) {
    console.error("Failed to load queue from storage:", error);
    return [];
  }
}

async function saveQueueToStorage(queue) {
  try {
    await StorageAdapter.set({ "sante-export-queue": queue });
    console.log(`💾 Saved queue to storage: ${queue.length} patients`);
  } catch (error) {
    console.error("Failed to save queue to storage:", error);
  }
}

async function getQueueData() {
  return await loadQueueFromStorage();
}

async function clearQueue() {
  try {
    await StorageAdapter.remove("sante-export-queue");
    console.log("🗑️ Queue cleared from storage");
  } catch (error) {
    console.error("Failed to clear queue:", error);
  }
}

async function resetExportedStatus() {
  const confirmed = confirm(
    "🔄 Reset Exported Status?\n\n" +
      "This will mark ALL patients as NOT exported, allowing you to export them again.\n\n" +
      "This is a DEV/DEBUG feature. Are you sure?"
  );

  if (!confirmed) return;

  try {
    const queue = await loadQueueFromStorage();
    let resetCount = 0;

    queue.forEach((patient) => {
      if (patient.exported === true) {
        patient.exported = false;
        patient.exportedAt = null;
        resetCount++;
      }
    });

    await saveQueueToStorage(queue);
    await window.updateExportCount();
    await window.syncUIWithLocalStorage();

    window.showSuccessToast(
      "✅ Reset Complete",
      `Reset exported status for ${resetCount} patients. They can now be exported again.`
    );

    console.log(`🔄 Reset exported status for ${resetCount} patients`);
  } catch (error) {
    console.error("Failed to reset exported status:", error);
    alert("Error resetting exported status. Check console for details.");
  }
}

async function migratePatientData() {
  const queue = await loadQueueFromStorage();
  let migrated = 0;

  queue.forEach((patient) => {
    let needsMigration = false;

    if (patient.exportedTests === undefined) {
      patient.exportedTests = {};

      if (patient.exported && patient.exportedAt) {
        const testResults = patient.structuredData?.testResults || {};
        Object.keys(testResults).forEach((key) => {
          patient.exportedTests[key] = patient.exportedAt;
        });
      }
      needsMigration = true;
    }

    if (patient.importedStatus === undefined) {
      patient.importedStatus = "Unknown";
      needsMigration = true;
    }

    if (patient.statusChangedSinceImport === undefined) {
      patient.statusChangedSinceImport = false;
      needsMigration = true;
    }

    if (patient.lastRefetchAt === undefined) {
      patient.lastRefetchAt = null;
      needsMigration = true;
    }

    if (patient.needsReexport === undefined) {
      patient.needsReexport = false;
      needsMigration = true;
    }

    if (needsMigration) {
      migrated++;
    }
  });

  if (migrated > 0) {
    await saveQueueToStorage(queue);
    console.log(`📦 Migrated ${migrated} patients to new data structure`);
  } else {
    console.log("📦 No patient data migration needed");
  }
}

// Export to window
window.getPatientKey = getPatientKey;
window.loadQueueFromStorage = loadQueueFromStorage;
window.saveQueueToStorage = saveQueueToStorage;
window.getQueueData = getQueueData;
window.clearQueue = clearQueue;
window.resetExportedStatus = resetExportedStatus;
window.migratePatientData = migratePatientData;
