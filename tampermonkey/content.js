// Content v2.0.0
// Main initialization — DB-only sync, no localStorage timeouts

async function initializeBatchExtension() {
  window.pdfProcessor = new window.PDFProcessor();
  await window.pdfProcessor.loadPDFJS();

  await window.SyncManager.init();

  window.hideCharismaFooter();
  window.makeFiltersCollapsible();
  window.addTestResultsColumn();

  const downloadElements = window.findDownloadElements();
  if (downloadElements.length === 0) return;

  window.injectBatchButtons(downloadElements);
  window.createSingleProcessButton();

  document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("refetch-btn")) {
      e.preventDefault();
      const patientKey = e.target.dataset.patientKey;
      const row = e.target.closest("tr");
      await window.refetchPatientData(patientKey, row);
    }
  });

  const idPrefixInput = document.getElementById("id-prefix");

  // Determine active series prefix
  let prefix = idPrefixInput?.value.trim();
  if (!prefix) {
    prefix = await window.SyncManager.fetchCurrentSeries();
    if (prefix && idPrefixInput) {
      idPrefixInput.value = prefix;
      console.log(`[Sync] Auto-loaded current series from server: ${prefix}`);
    }
  }

  // Load state from server and set up UI
  if (prefix) {
    await window.SyncManager.loadState(prefix);
    await window.SyncManager.setCurrentSeries(prefix);
    await window.migratePatientData();
    await window.syncUIWithLocalStorage();
    window.checkForStoredCSVData?.();
  }

  // Prefix change: load fresh state from server
  if (idPrefixInput) {
    idPrefixInput.addEventListener("change", async () => {
      const p = idPrefixInput.value.trim();
      if (!p) return;
      await window.SyncManager.loadState(p);
      await window.SyncManager.setCurrentSeries(p);
      await window.syncUIWithLocalStorage();
      window.checkForStoredCSVData?.();
    });
  }
}

async function syncUIWithLocalStorage() {
  console.log("🔄 Syncing UI with localStorage...");

  const queue = await window.loadQueueFromDB();
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

      if (storedPatient.excluded !== true) {
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
            indicator.textContent = "🚫 Exclus din export";
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
    await window.saveQueueToDB(queue);
    console.log(`💾 Saved ${statusChangesDetected} status change(s) to storage`);

    window.showSuccessToast(
      "🔔 Schimbări de status detectate",
      `${statusChangesDetected} pacient(i) au acum rezultate disponibile. Apăsați "Reîncarcă" pentru a actualiza datele.`
    );
  }

  await window.updateExportCount();

  console.log("✅ UI sync complete");
}

// Export for Tampermonkey main entry point
window.initializeBatchExtension = initializeBatchExtension;
window.syncUIWithLocalStorage = syncUIWithLocalStorage;
