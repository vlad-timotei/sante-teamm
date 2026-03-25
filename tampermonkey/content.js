// Content v1.0.0
// Main initialization and UI sync

async function initializeBatchExtension() {
  // Initialize PDF processor with full PDF.js
  window.pdfProcessor = new window.PDFProcessor();
  await window.pdfProcessor.loadPDFJS();

  // Initialize sync manager
  await window.SyncManager.init();

  // Migrate existing patient data to new structure (backward compatible)
  await window.migratePatientData();

  // Hide the Charisma footer
  window.hideCharismaFooter();

  // Make filter form collapsible
  window.makeFiltersCollapsible();

  // Add test results column to table
  window.addTestResultsColumn();

  // Find all download buttons/links on the page
  const downloadElements = window.findDownloadElements();

  if (downloadElements.length > 0) {
    window.injectBatchButtons(downloadElements);
    window.createSingleProcessButton();

    // Add event delegation for refetch buttons (once)
    document.addEventListener("click", async (e) => {
      if (e.target.classList.contains("refetch-btn")) {
        e.preventDefault();
        const patientKey = e.target.dataset.patientKey;
        const row = e.target.closest("tr");
        await window.refetchPatientData(patientKey, row);
      }
    });

    // Sync UI with localStorage (delayed to let table load)
    setTimeout(async () => {
      await window.syncUIWithLocalStorage();
    }, 1500);

    // Check for stored CSV data after everything is set up (fix #4: runs before server sync)
    setTimeout(() => {
      window.tryLoadAnyStoredData();
    }, 500);

    const idPrefixInput = document.getElementById('id-prefix');
    if (idPrefixInput) {
      // Manual prefix change: setCurrentPrefix handles pull + lock
      idPrefixInput.addEventListener('change', async () => {
        const prefix = idPrefixInput.value.trim();
        if (prefix) {
          window._serverSyncDone = true; // prevent timeout from re-running
          await window.SyncManager.setCurrentPrefix(prefix);
          await window.syncUIWithLocalStorage();
          window.checkForStoredCSVData?.();
        }
      });

      // On every page load: full server sync after local data is ready (fix #4: 2500ms > 500ms local load)
      // _serverSyncDone prevents double-run if change event fires before the timeout
      window._serverSyncDone = false;
      setTimeout(async () => {
        if (window._serverSyncDone) return;
        window._serverSyncDone = true;

        let prefix = idPrefixInput.value.trim();
        if (!prefix) {
          prefix = await window.SyncManager.fetchCurrentSeries();
          if (prefix) {
            idPrefixInput.value = prefix;
            console.log(`[Sync] Auto-loaded current series from server: ${prefix}`);
          }
        }
        if (prefix) {
          await window.SyncManager.forceSync(prefix);
          await window.syncUIWithLocalStorage();
          window.checkForStoredCSVData?.();
        }
      }, 2500);
    }
  }
}

async function syncUIWithLocalStorage() {
  console.log("🔄 Syncing UI with localStorage...");

  const queue = await window.loadQueueFromStorage();
  console.log(`📦 Found ${queue.length} patients in localStorage`);

  const table = document.getElementById("ctl00_contentMain_dgGrid");
  if (!table) {
    console.warn("⚠️ Table not found for UI sync");
    return;
  }

  const rows = table.querySelectorAll("tr");
  let statusChangesDetected = 0;

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) return;

    const nameCell = cells[1];
    if (!nameCell) return;

    const patientName = nameCell.textContent.trim();
    if (!patientName) return;

    const batchCell = row.querySelector('[id^="batch-cell-"]');
    if (!batchCell) return;

    const batchBtn = batchCell.querySelector("button");
    if (!batchBtn) return;

    const idPrefix = document.getElementById("id-prefix")?.value.trim();

    let storedPatient;
    if (idPrefix) {
      const patientKey = window.getPatientKey(idPrefix, patientName);
      storedPatient = queue.find(
        (p) =>
          window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume) ===
          patientKey
      );
    } else {
      storedPatient = queue.find(
        (p) =>
          p.patientInfo?.nume?.trim().toLowerCase() ===
          patientName.toLowerCase()
      );
    }

    if (storedPatient) {
      const currentStatusIcon = row.querySelector(".glyphicon");
      const currentStatus = currentStatusIcon?.getAttribute("title") || "Unknown";
      const storedStatus = storedPatient.importedStatus || "Unknown";

      const incompleteStatuses = ["In lucru", "Rezultate partiale"];
      if (incompleteStatuses.includes(storedStatus) && currentStatus === "Efectuat cu rezultate") {
        if (!storedPatient.statusChangedSinceImport) {
          storedPatient.statusChangedSinceImport = true;
          statusChangesDetected++;
          console.log(
            `🔔 Status changed for ${storedPatient.patientInfo?.nume}: "${storedStatus}" → "${currentStatus}"`
          );
        }
      }

      const patientKey = window.getPatientKey(idPrefix, patientName);

      if (storedPatient.excluded === false) {
        batchBtn.textContent = "✓";
        batchBtn.style.background = "#28a745";
        batchBtn.setAttribute("data-batched", "true");
        row.style.opacity = "1";

        if (storedPatient.statusChangedSinceImport) {
          row.style.backgroundColor = "#fff3cd";
        } else {
          row.style.backgroundColor = "";
        }

        const testResultCell = row.querySelector('[id^="test-results-"]');
        if (testResultCell) {
          testResultCell.style.opacity = "1";
          testResultCell.style.backgroundColor = "";

          const excludedIndicator = testResultCell.querySelector(
            ".excluded-indicator"
          );
          if (excludedIndicator) {
            excludedIndicator.remove();
          }

          window.displayTestResults(testResultCell, storedPatient, patientKey);
          console.log(
            `📊 Populated test results for ${storedPatient.patientInfo.nume}`
          );
        }

        console.log(
          `✅ Synced UI for ${storedPatient.patientInfo.nume}: not excluded${storedPatient.statusChangedSinceImport ? ' (status changed!)' : ''}`
        );
      } else {
        batchBtn.textContent = "+";
        batchBtn.style.background = "#007cba";
        batchBtn.setAttribute("data-batched", "false");
        row.style.opacity = "0.5";
        row.style.backgroundColor = "#f8f9fa";

        const testResultCell = row.querySelector('[id^="test-results-"]');
        if (testResultCell) {
          testResultCell.style.opacity = "0.5";
          testResultCell.style.backgroundColor = "#e9ecef";

          const excludedIndicator = testResultCell.querySelector(
            ".excluded-indicator"
          );
          if (!excludedIndicator) {
            const indicator = document.createElement("div");
            indicator.className = "excluded-indicator";
            indicator.style.cssText = `
              background: #6c757d;
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 10px;
              margin-top: 5px;
            `;
            indicator.textContent = "🚫 Excluded from export";
            testResultCell.appendChild(indicator);
          }
        }

        console.log(
          `🚫 Synced UI for ${storedPatient.patientInfo.nume}: excluded`
        );
      }
    } else {
      batchBtn.textContent = "+";
      batchBtn.style.background = "#007cba";
      batchBtn.setAttribute("data-batched", "false");
      row.style.opacity = "1";
      row.style.backgroundColor = "";

      console.log(
        `➕ Patient ${patientName} not in storage, showing default button`
      );
    }
  });

  if (statusChangesDetected > 0) {
    await window.saveQueueToStorage(queue);
    console.log(`💾 Saved ${statusChangesDetected} status change(s) to storage`);

    window.showSuccessToast(
      "🔔 Status Changes Detected",
      `${statusChangesDetected} patient(s) now have results ready. Click "Refetch" to update their data.`
    );
  }

  await window.updateExportCount();

  console.log("✅ UI sync complete");
}

// Export for Tampermonkey main entry point
window.initializeBatchExtension = initializeBatchExtension;
window.syncUIWithLocalStorage = syncUIWithLocalStorage;
