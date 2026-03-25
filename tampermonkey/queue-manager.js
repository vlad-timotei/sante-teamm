// Queue Manager v2.2.0
// Patient queue — reads from in-memory cache, writes to server via SyncManager

function getPatientKey(idPrefix, patientName) {
  const normalizedPrefix = (idPrefix || "").trim().toLowerCase();
  const cleanName = (patientName || "").replace(/\s*\(CSV:.*$/, "").trim();
  const normalizedName = cleanName.toLowerCase();
  return `${normalizedPrefix}_${normalizedName}`;
}

async function loadQueueFromDB() {
  const state = window.SyncManager?.getCachedState();
  const queue = state?.queue || [];
  console.log(`📦 Loaded queue from storage: ${queue.length} patients`);
  return queue;
}

async function saveQueueToDB(queue) {
  const state = window.SyncManager?.getCachedState();
  if (!state?.prefix) {
    console.warn('💾 Cannot save queue: no active series loaded');
    return;
  }
  await window.SyncManager.saveState(
    state.prefix,
    queue,
    state.csv_data,
    state.csv_updated_at
  );
  await window.SyncManager.setCurrentSeries(state.prefix);
  console.log(`💾 Saved queue to server: ${queue.length} patients`);
}

async function getQueueData() {
  return await loadQueueFromDB();
}

async function clearQueue() {
  const state = window.SyncManager?.getCachedState();
  if (!state?.prefix) {
    console.warn('🗑️ Cannot clear queue: no active series loaded');
    return;
  }
  await window.SyncManager.saveState(state.prefix, [], state.csv_data, state.csv_updated_at);
  console.log("🗑️ Queue cleared");
}

async function resetExportedStatus() {
  const confirmed = confirm(
    "🔄 Reset Exported Status?\n\n" +
      "This will mark ALL patients as NOT exported, allowing you to export them again.\n\n" +
      "This is a DEV/DEBUG feature. Are you sure?"
  );

  if (!confirmed) return;

  try {
    const queue = await loadQueueFromDB();
    let resetCount = 0;

    queue.forEach((patient) => {
      if (patient.exported === true) {
        patient.exported = false;
        patient.exportedAt = null;
        resetCount++;
      }
    });

    await saveQueueToDB(queue);
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
  const queue = await loadQueueFromDB();
  let migrated = 0;

  queue.forEach((patient) => {
    let needsMigration = false;

    if (patient.exportedTests === undefined || Array.isArray(patient.exportedTests)) {
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

    if (patient.extractedText !== undefined) {
      delete patient.extractedText;
      needsMigration = true;
    }

    if (needsMigration) {
      migrated++;
    }
  });

  if (migrated > 0) {
    await saveQueueToDB(queue);
    console.log(`📦 Migrated ${migrated} patients to new data structure`);
  } else {
    console.log("📦 No patient data migration needed");
  }
}

// Export to window
window.getPatientKey = getPatientKey;
window.loadQueueFromDB = loadQueueFromDB;
window.saveQueueToDB = saveQueueToDB;
window.getQueueData = getQueueData;
window.clearQueue = clearQueue;
window.resetExportedStatus = resetExportedStatus;
window.migratePatientData = migratePatientData;
