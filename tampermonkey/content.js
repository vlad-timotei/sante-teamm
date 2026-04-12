// Content v2.2.0
// Main initialization — DB-only sync, API-based patient IDs

// Format "25S7" → "2025 - S7", "25S19" → "2025 - S19"
function formatSessionLabel(prefix) {
  const match = prefix.match(/^(\d{2})(S.+)$/i);
  if (match) return `20${match[1]} - ${match[2]}`;
  return prefix;
}
window.formatSessionLabel = formatSessionLabel;

async function initializeBatchExtension() {
  window.pdfProcessor = new window.PDFProcessor();
  await window.pdfProcessor.loadPDFJS();

  await window.SyncManager.init();

  document.title = "Analize Sante";
  const existingFavicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  if (existingFavicon) existingFavicon.remove();
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/png";
  favicon.href = "https://i.ibb.co/8DkVV28V/sante-teamm-favicon.png";
  document.head.appendChild(favicon);

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

  const idPrefixSelect = document.getElementById("id-prefix");

  // Populate session dropdown from DB
  if (idPrefixSelect) {
    const allSeries = await window.SyncManager.fetchAllSeries();
    const currentPrefix = await window.SyncManager.fetchCurrentSeries();

    allSeries.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.prefix;
      opt.textContent = window.formatSessionLabel(s.prefix);
      if (s.prefix === currentPrefix) opt.selected = true;
      idPrefixSelect.appendChild(opt);
    });

    const prefix = idPrefixSelect.value;

    // Load state from server and set up UI
    if (prefix) {
      await window.SyncManager.loadState(prefix);
      await window.SyncManager.setCurrentSeries(prefix);
      await window.migratePatientData();
      await window.syncUIWithLocalStorage();
      await window.ensurePatientIds(prefix);
    }

    // Session change: load fresh state from server
    idPrefixSelect.addEventListener("change", async () => {
      const p = idPrefixSelect.value;
      if (!p) return;
      await window.SyncManager.loadState(p);
      await window.SyncManager.setCurrentSeries(p);
      await window.syncUIWithLocalStorage();
      await window.ensurePatientIds(p);
    });
  }

  // Wire up bottom buttons
  const syncBtn = document.getElementById("sante-sync-sessions");
  if (syncBtn) {
    syncBtn.onclick = async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = "⏳ Se sincronizează...";
      const year = new Date().getFullYear();
      const result = await window.SyncManager.syncSessions(year);
      if (result?.success) {
        // Refresh dropdown
        const freshSeries = await window.SyncManager.fetchAllSeries();
        const select = document.getElementById("id-prefix");
        const currentVal = select.value;
        // Remove all options except the first placeholder
        while (select.options.length > 1) select.remove(1);
        freshSeries.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.prefix;
          opt.textContent = window.formatSessionLabel(s.prefix);
          if (s.prefix === currentVal) opt.selected = true;
          select.appendChild(opt);
        });
        window.showSuccessToast("Sesiuni sincronizate", `${result.created} noi, ${result.skipped} existente`);
      }
      syncBtn.disabled = false;
      syncBtn.textContent = "🔄 Sincronizează Sesiuni";
    };
  }

  const updateIdsBtn = document.getElementById("sante-update-ids");
  if (updateIdsBtn) {
    updateIdsBtn.onclick = async () => {
      const currentPrefix = document.getElementById("id-prefix")?.value;
      if (!currentPrefix) {
        alert("Selectați mai întâi o sesiune.");
        return;
      }
      updateIdsBtn.disabled = true;
      updateIdsBtn.textContent = "⏳ Se actualizează...";
      await window.fetchAndApplyPatientIds(currentPrefix, true);
      updateIdsBtn.disabled = false;
      updateIdsBtn.textContent = "🔄 Actualizează ID-uri";
    };
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
