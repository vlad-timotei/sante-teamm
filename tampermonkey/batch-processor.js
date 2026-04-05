// Batch Processor v1.2.0
// Batch processing, PDF download, and analysis functions

// Global state for batch processing (using window.* to avoid shadowing issues)
window.batchCounter = 0;
window.extractedData = [];
window.batchQueue = [];
// Note: pdfProcessor is set on window by content.js

window.currentPageAnalysis = {
  isAnalyzing: false,
  patients: [],
  completed: 0,
  total: 0,
};

async function toggleBatch(element, index, batchBtn) {
  const isCurrentlyBatched = batchBtn.getAttribute("data-batched") === "true";

  if (isCurrentlyBatched) {
    await removeFromBatch(element, index, batchBtn);
  } else {
    await addToBatch(element, index, batchBtn);
  }
}

async function addToBatch(element, index, batchBtn) {
  const patientTextInput = document.getElementById(`patient-text-${index}`);
  const patientText = patientTextInput ? patientTextInput.value.trim() : "";

  if (!patientText) {
    alert("Please enter an ID suffix for this patient before adding to batch.");
    return;
  }

  const row = element.closest("tr");
  const cells = row.querySelectorAll("td");

  const statusIcon = row.querySelector(".glyphicon");
  let importedStatus = "Unknown";
  if (statusIcon) {
    const statusTitle = statusIcon.getAttribute("title");
    console.log(`🔍 Checking status for patient: ${statusTitle}`);

    if (statusTitle === "Efectuat cu rezultate" || statusTitle === "In lucru" || statusTitle === "Rezultate partiale") {
      importedStatus = statusTitle;

      if (statusTitle === "In lucru" || statusTitle === "Rezultate partiale") {
        console.log(
          `⚠️ Patient has "${statusTitle}" status - results may be partial. You can refetch later when complete.`
        );
      } else {
        console.log(
          `✅ STATUS OK: Patient has "${statusTitle}" status - processing allowed`
        );
      }
    } else {
      alert(
        `Cannot process patient: Status is "${statusTitle}". Only patients with "Efectuat cu rezultate", "In lucru", or "Rezultate partiale" status can be processed.`
      );
      console.log(
        `❌ BLOCKED: Patient status "${statusTitle}" - not allowed`
      );
      return;
    }
  } else {
    console.warn(
      `⚠️ No status icon found for patient - proceeding with caution`
    );
  }

  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  if (!idPrefix) {
    alert("Please enter an ID prefix (e.g., 25S19) before processing.");
    return;
  }

  const patientData = {
    nume: cells[1]?.textContent.trim().replace(/\s*\(CSV:.*$/, "").trim(),
    cnp: cells[2]?.textContent.trim(),
    dataNasterii: cells[3]?.textContent.trim(),
    patientText: patientText,
    idPrefix: idPrefix,
    importedStatus: importedStatus,
  };

  const patientName = patientData.nume.trim();
  const patientKey = window.getPatientKey(idPrefix, patientName);

  const queue = await window.loadQueueFromDB();
  const existingPatient = queue.find(
    (p) =>
      window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume) === patientKey
  );

  if (row) {
    row.style.opacity = "1";
    row.style.backgroundColor = "";
  }

  const testResultCell = document.getElementById(`test-results-${index}`);
  if (testResultCell) {
    testResultCell.style.opacity = "1";
    testResultCell.style.backgroundColor = "";

    const excludedIndicator = testResultCell.querySelector(
      ".excluded-indicator"
    );
    if (excludedIndicator) {
      excludedIndicator.remove();
    }
  }

  if (existingPatient) {
    existingPatient.excluded = false;
    existingPatient.patientInfo.patientText = patientText;

    batchBtn.textContent = "✓";
    batchBtn.style.background = "#28a745";
    batchBtn.setAttribute("data-batched", "true");
    batchBtn.setAttribute("data-element-id", element.id);

    if (testResultCell) {
      window.displayTestResults(testResultCell, existingPatient, patientKey);
      console.log(`📊 Refreshed test results for ${patientData.nume}`);
    }

    console.log(
      `%c✅ MARKED AS EXPORTABLE: ${patientData.nume} (already in storage, no re-download)`,
      "color: green; font-weight: bold"
    );

    if (window.currentPageAnalysis.isAnalyzing) {
      window.currentPageAnalysis.completed++;
      updateAnalysisProgress();

      console.log(
        `%c📦 Batch progress: ${window.currentPageAnalysis.completed}/${window.currentPageAnalysis.total}`,
        "color: blue; font-weight: bold"
      );

      if (window.currentPageAnalysis.completed === window.currentPageAnalysis.total) {
        await window.saveQueueToDB(queue);
        await finishBatchAnalysis();
      }
    } else {
      await window.saveQueueToDB(queue);
      await window.updateExportCount();
    }

    return;
  }

  window.batchCounter++;

  const batchItem = {
    id: `pdf_${window.batchCounter}`,
    elementId: element.id,
    patientData: patientData,
    elementIndex: index,
    timestamp: Date.now(),
  };

  window.batchQueue.push(batchItem);

  console.log("Storing batch item locally:", batchItem);

  updateBatchCount(window.batchQueue.length);

  batchBtn.textContent = "⏳";
  batchBtn.style.background = "#ffc107";
  batchBtn.setAttribute("data-batched", "true");
  batchBtn.setAttribute("data-element-id", element.id);

  console.log(
    `%c✅ ADDED TO BATCH: ${patientData.nume} - Auto-processing...`,
    "color: green; font-weight: bold"
  );

  try {
    await downloadAndProcessPDF(element, batchItem);

    const extractedItem = window.extractedData.find(
      (item) => item.id === batchItem.id
    );

    if (extractedItem) {
      extractedItem.excluded = false;

      if (window.currentPageAnalysis.isAnalyzing) {
        window.currentPageAnalysis.patients.push(extractedItem);
        window.currentPageAnalysis.completed++;

        console.log(
          `%c✅ ADDED TO BATCH: ${extractedItem.patientInfo?.nume} (${window.currentPageAnalysis.completed}/${window.currentPageAnalysis.total})`,
          "color: green; font-weight: bold"
        );

        updateAnalysisProgress();

        if (window.currentPageAnalysis.completed === window.currentPageAnalysis.total) {
          await finishBatchAnalysis();
        }
      } else {
        queue.push(extractedItem);
        await window.saveQueueToDB(queue);

        console.log(
          `%c✅ SAVED TO LOCALSTORAGE: ${extractedItem.patientInfo?.nume}`,
          "color: green; font-weight: bold"
        );

        await window.updateExportCount();
      }
    }

    batchBtn.textContent = "✓";
    batchBtn.style.background = "#28a745";

    console.log(
      `%c🎉 AUTO-PROCESSING COMPLETE: ${patientData.nume}`,
      "color: green; font-weight: bold"
    );
  } catch (error) {
    console.error(
      `%c❌ AUTO-PROCESSING FAILED: ${patientData.nume}`,
      "color: red; font-weight: bold",
      error
    );
    console.error(`🔥 Error details for ${patientData.nume}:`, error);

    batchBtn.textContent = "❌";
    batchBtn.style.background = "#dc3545";
    batchBtn.title = `Error: ${error.message}. Click to retry.`;

    batchBtn.setAttribute("data-batched", "false");

    batchBtn.style.opacity = "1";
    batchBtn.onclick = (e) => {
      e.preventDefault();
      batchBtn.textContent = "+";
      batchBtn.style.background = "#007cba";
      batchBtn.title = "";
      toggleBatch(element, index, batchBtn);
    };

    console.log(
      `%c⏭️ ERROR ISOLATED: Other downloads will continue normally`,
      "color: orange; font-weight: bold"
    );

    if (window.currentPageAnalysis.isAnalyzing) {
      window.currentPageAnalysis.completed++;
      updateAnalysisProgress();

      if (window.currentPageAnalysis.completed === window.currentPageAnalysis.total) {
        await finishBatchAnalysis();
      }
    } else {
      await window.updateExportCount();
    }
  }
}

async function removeFromBatch(element, index, batchBtn) {
  const row = element.closest("tr");
  if (!row) {
    console.error("❌ Cannot remove from batch: Element not in table row");
    return;
  }
  const cells = row.querySelectorAll("td");
  const patientName = cells[1]?.textContent.trim();

  if (!patientName) {
    console.error("❌ Cannot remove from batch: Patient name not found");
    return;
  }

  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  if (!idPrefix) {
    alert("Please enter an ID prefix before removing from batch.");
    return;
  }

  const patientKey = window.getPatientKey(idPrefix, patientName);

  const queue = await window.loadQueueFromDB();
  const patient = queue.find(
    (p) =>
      window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume) === patientKey
  );

  if (patient) {
    patient.excluded = true;
    await window.saveQueueToDB(queue);
    console.log(
      `%c🚫 MARKED AS EXCLUDED IN LOCALSTORAGE: ${patient.patientInfo.nume} (key: ${patientKey})`,
      "color: gray; font-weight: bold"
    );
  } else {
    console.warn(
      `⚠️ Patient ${patientName} not found in localStorage (key: ${patientKey}), cannot mark as excluded`
    );
  }

  const extractedItem = window.extractedData.find(
    (item) =>
      window.getPatientKey(item.patientInfo?.idPrefix, item.patientInfo?.nume) ===
      patientKey
  );

  if (extractedItem) {
    extractedItem.excluded = true;
    console.log(
      `%c🚫 MARKED AS EXCLUDED IN CURRENT PAGE: ${extractedItem.patientInfo?.nume}`,
      "color: gray; font-weight: bold"
    );
  }

  const elementId = element.id;
  const itemIndex = window.batchQueue.findIndex(
    (item) => item.elementId === elementId
  );

  if (itemIndex !== -1) {
    const removedItem = window.batchQueue.splice(itemIndex, 1)[0];
    console.log(
      `%c❌ REMOVED FROM BATCH QUEUE: ${removedItem.patientData.nume}`,
      "color: orange; font-weight: bold"
    );
  }

  updateBatchCount(window.batchQueue.length);

  batchBtn.textContent = "+";
  batchBtn.style.background = "#007cba";
  batchBtn.removeAttribute("data-batched");
  batchBtn.removeAttribute("data-element-id");

  if (row) {
    row.style.opacity = "0.5";
    row.style.backgroundColor = "#f8f9fa";
  }

  const testResultCell = document.getElementById(`test-results-${index}`);
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

  await window.updateExportCount();
}

async function processBatch() {
  if (window.batchQueue.length === 0) {
    return;
  }

  for (let i = 0; i < window.batchQueue.length; i++) {
    const item = window.batchQueue[i];
    const patientName = item.patientData.nume || "Unknown";

    const statusText = document.getElementById("status-text");
    if (statusText) {
      statusText.textContent = `Processing ${i + 1}/${
        window.batchQueue.length
      }: ${patientName}`;
    }

    console.log(
      `%c📋 PROCESSING PATIENT ${i + 1}/${window.batchQueue.length}`,
      "color: blue; font-weight: bold"
    );
    console.log(`👤 Patient: ${patientName}`);
    console.log(`🆔 Element ID: ${item.elementId}`);
    console.log(`📅 Batch Item:`, item);

    try {
      const downloadLink = document.getElementById(item.elementId);
      if (downloadLink) {
        console.log(
          `%c✅ Download link found for ${patientName}`,
          "color: green"
        );
        console.log(`🔗 Link href:`, downloadLink.href);

        await downloadAndProcessPDF(downloadLink, item);
        console.log(
          `%c✅ SUCCESS: Processed PDF for ${patientName}`,
          "color: green; font-weight: bold"
        );
      } else {
        const errorMsg = `❌ DOWNLOAD LINK NOT FOUND for ${patientName} (ID: ${item.elementId})`;
        console.error(`%c${errorMsg}`, "color: red; font-weight: bold");

        const allLinks = document.querySelectorAll(
          '#ctl00_contentMain_dgGrid a[id*="lnkView"]'
        );
        console.log(
          `🔍 Available download links:`,
          Array.from(allLinks).map((link) => link.id)
        );

        const linkErrorData = {
          id: item.id,
          patientInfo: item.patientData,
          extractionDate: new Date().toISOString(),
          error:
            "Download link not found - element may have been removed from page",
          status: "LINK_NOT_FOUND",
          availableLinks: Array.from(allLinks).map((link) => link.id),
        };
        window.extractedData.push(linkErrorData);

        window.updateTestResultsColumn(item.elementIndex, linkErrorData);
      }
    } catch (error) {
      const errorMsg = `❌ PROCESSING ERROR for ${patientName}: ${error.message}`;
      console.error(`%c${errorMsg}`, "color: red; font-weight: bold");
      console.error(`🔥 Full error:`, error);
      console.error(`📍 Error stack:`, error.stack);

      const processingErrorData = {
        id: item.id,
        patientInfo: item.patientData,
        extractionDate: new Date().toISOString(),
        error: error.message,
        errorType: error.name,
        status: "PROCESSING_ERROR",
        fullError: error.toString(),
      };
      window.extractedData.push(processingErrorData);

      window.updateTestResultsColumn(item.elementIndex, processingErrorData);
    }

    console.log(
      `%c📊 Progress: ${window.extractedData.length}/${window.batchQueue.length} completed`,
      "color: purple"
    );

    if (i < window.batchQueue.length - 1) {
      console.log(`⏳ Waiting 2 seconds before next download...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

function clearAllData() {
  console.log(`%c🧹 CLEARING ALL DATA`, "color: orange; font-weight: bold");

  window.batchQueue = [];
  window.extractedData = [];
  window.batchCounter = 0;

  console.log("Batch data cleared locally");

  updateBatchCount(0);

  const batchedButtons = document.querySelectorAll(
    'button[data-batched="true"]'
  );
  batchedButtons.forEach((btn) => {
    btn.textContent = "+";
    btn.style.background = "#007cba";
    btn.disabled = false;
    btn.removeAttribute("data-batched");
  });

  const testResultCells = document.querySelectorAll('[id^="test-results-"]');
  testResultCells.forEach((cell) => {
    cell.textContent = "Not processed";
    cell.style.color = "#666";
    cell.removeAttribute("title");
  });
}

function updateBatchCount(count) {
  const countElement = document.getElementById("batch-count");
  if (countElement) {
    countElement.textContent = count;
  }
}

async function analyzeCurrentPage() {
  console.log("🔄 Starting page analysis...");

  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  if (!idPrefix) {
    alert("Please enter an ID prefix (e.g., 25S19) before analyzing.");
    return;
  }

  const queue = await window.loadQueueFromDB();
  const existingKeys = new Set(
    queue.map((p) =>
      window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume)
    )
  );

  const patientInputs = document.querySelectorAll('input[id^="patient-text-"]');
  const patientsWithIDs = [];

  patientInputs.forEach((input) => {
    const idSuffix = input.value.trim();
    if (idSuffix !== "") {
      const row = input.closest("tr");
      const statusIcon = row?.querySelector(".glyphicon");

      if (statusIcon) {
        const statusTitle = statusIcon.getAttribute("title");

        if (statusTitle !== "Efectuat cu rezultate" && statusTitle !== "In lucru" && statusTitle !== "Rezultate partiale") {
          console.log(
            `⏭️ Skipping patient with ID suffix ${idSuffix} - status: "${statusTitle}" (not allowed)`
          );
          return;
        }

        if (statusTitle === "In lucru" || statusTitle === "Rezultate partiale") {
          console.log(
            `⚠️ Including patient with ID suffix ${idSuffix} - status: "${statusTitle}" (partial results)`
          );
        } else {
          console.log(
            `✅ Including patient with ID suffix ${idSuffix} - status: "${statusTitle}"`
          );
        }
      }

      const cells = row.querySelectorAll("td");
      const patientName = cells[1]?.textContent.trim();
      const patientKey = window.getPatientKey(idPrefix, patientName);

      if (existingKeys.has(patientKey)) {
        console.log(
          `⏭️ Skipping patient ${patientName} - already has data in localStorage (key: ${patientKey})`
        );
        return;
      }

      const batchButton = window.findBatchButtonForInput(input);
      if (batchButton) {
        patientsWithIDs.push({
          input: input,
          button: batchButton,
          suffix: idSuffix,
          importedStatus: statusIcon?.getAttribute("title") || "Unknown",
        });
      }
    }
  });

  if (patientsWithIDs.length === 0) {
    const totalWithIDs = Array.from(patientInputs).filter(
      (input) => input.value.trim() !== ""
    ).length;
    if (totalWithIDs > 0) {
      window.showWarningToast(
        "Am analizat toți pacienții cu ID-uri.",
        "Nu sunt informații noi. Fie au statusul în prelucrare fie deja există date pentru aceștia."
      );
    } else {
      window.showWarningToast(
        "Niciun pacient cu ID.",
        "Introduceți sufixe de ID pentru pacienți înainte de analiză."
      );
    }
    return;
  }

  console.log(
    `📥 Found ${patientsWithIDs.length} patients with IDs to download`
  );

  window.currentPageAnalysis = {
    isAnalyzing: true,
    patients: [],
    completed: 0,
    total: patientsWithIDs.length,
  };

  const analyzeButton = document.getElementById("sante-analyze-page");
  const exportButton = document.getElementById("sante-process-export");

  if (analyzeButton) {
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = `🔄 Analyzing... (0/${patientsWithIDs.length})`;
    analyzeButton.style.background = "#007cba";
    analyzeButton.style.cursor = "not-allowed";
  }

  if (exportButton) {
    exportButton.disabled = true;
    exportButton.style.opacity = "0.5";
    exportButton.style.cursor = "not-allowed";
  }

  updateAnalysisProgress();

  for (let i = 0; i < patientsWithIDs.length; i++) {
    const patient = patientsWithIDs[i];
    console.log(
      `📥 Triggering download ${i + 1}/${
        patientsWithIDs.length
      } for ID suffix: ${patient.suffix}`
    );

    setTimeout(() => {
      try {
        console.log(`🔄 Processing patient with ID suffix: ${patient.suffix}`);
        patient.button.click();
      } catch (error) {
        console.error(
          `❌ Failed to trigger download for ID suffix: ${patient.suffix}`,
          error
        );
        console.log(`⏭️ Continuing with next download...`);
      }
    }, i * 500);
  }

  console.log(
    `✅ Triggered downloads for ${patientsWithIDs.length} patients (with error isolation)`
  );
}

async function refetchPatientData(patientKey, rowElement) {
  console.log(`🔄 Starting refetch for patient key: ${patientKey}`);

  if (!patientKey) {
    window.showWarningToast("❌ Refetch Failed", "Patient key not found.");
    return;
  }

  const queue = await window.loadQueueFromDB();
  const existingPatient = queue.find(
    (p) => window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume) === patientKey
  );

  if (!existingPatient) {
    window.showWarningToast("❌ Refetch Failed", "Patient not found in storage.");
    return;
  }

  const downloadLink = rowElement?.querySelector('a[href*="__doPostBack"]');
  if (!downloadLink) {
    window.showWarningToast("❌ Refetch Failed", "Download link not found.");
    return;
  }

  const oldTestResults = existingPatient.structuredData?.testResults || {};
  const oldExportedTests = existingPatient.exportedTests || {};
  const oldTestCount = Object.keys(oldTestResults).length;

  const testResultCell = rowElement?.querySelector('[id^="test-results-"]');
  if (testResultCell) {
    testResultCell.innerHTML = '<span style="color: #ffc107;">⏳ Refetching...</span>';
  }

  try {
    const table = document.getElementById("ctl00_contentMain_dgGrid");
    const rows = Array.from(table.querySelectorAll("tr"));
    const rowIndex = rows.indexOf(rowElement);

    const batchItem = {
      id: `refetch_${Date.now()}`,
      elementId: downloadLink.id,
      patientData: existingPatient.patientInfo,
      elementIndex: rowIndex,
      timestamp: Date.now(),
    };

    const newExtractedData = await downloadAndProcessPDF(downloadLink, batchItem, true);

    if (newExtractedData && newExtractedData.structuredData?.testResults) {
      const newTestResults = newExtractedData.structuredData.testResults;

      const mergedTestResults = { ...oldTestResults };
      let newTestsFound = 0;

      Object.entries(newTestResults).forEach(([key, testData]) => {
        if (!mergedTestResults[key]) {
          mergedTestResults[key] = testData;
          newTestsFound++;
          console.log(`✨ New test found: ${key} = ${testData.value}`);
        }
      });

      existingPatient.structuredData = existingPatient.structuredData || {};
      existingPatient.structuredData.testResults = mergedTestResults;
      existingPatient.lastRefetchAt = Date.now();
      existingPatient.exportedTests = oldExportedTests;
      delete existingPatient.extractedText;

      const statusIcon = rowElement?.querySelector(".glyphicon");
      if (statusIcon) {
        existingPatient.importedStatus = statusIcon.getAttribute("title");
      }

      existingPatient.statusChangedSinceImport = false;

      if (newTestsFound > 0) {
        existingPatient.needsReexport = true;
        console.log(`📋 Patient marked for re-export (${newTestsFound} new tests found)`);
      }

      await window.saveQueueToDB(queue);

      rowElement.style.backgroundColor = "";

      window.displayTestResults(testResultCell, existingPatient, patientKey);

      await window.updateExportCount();

      const message = newTestsFound > 0
        ? `Found ${newTestsFound} new test(s). Total: ${Object.keys(mergedTestResults).length} tests.`
        : `No new tests found. Total: ${Object.keys(mergedTestResults).length} tests.`;

      window.showSuccessToast("🔄 Refetch Complete", message);
      console.log(`✅ Refetch complete for ${existingPatient.patientInfo?.nume}: ${message}`);
    } else {
      window.showWarningToast("⚠️ Refetch Warning", "Could not extract test data from PDF.");

      window.displayTestResults(testResultCell, existingPatient, patientKey);
    }
  } catch (error) {
    console.error("Refetch failed:", error);
    window.showWarningToast("❌ Refetch Failed", error.message);

    window.displayTestResults(testResultCell, existingPatient, patientKey);
  }
}

async function downloadAndProcessPDF(downloadLink, batchItem, skipUIUpdate = false) {
  const patientName = batchItem.patientData.nume || "Unknown";

  return new Promise((resolve, reject) => {
    try {
      console.log(
        `%c🔽 STARTING PDF DOWNLOAD for ${patientName}`,
        "color: orange; font-weight: bold"
      );

      const form = document.createElement("form");
      form.method = "POST";
      form.action = document.location.pathname;
      form.style.display = "none";

      const originalForm = document.getElementById("aspnetForm");
      if (!originalForm) {
        throw new Error("ASPX form not found on page");
      }

      console.log(`📝 Copying form data from ASPX form...`);
      const formData = new FormData(originalForm);
      let fieldCount = 0;

      for (let [key, value] of formData.entries()) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
        fieldCount++;
      }
      console.log(`📝 Copied ${fieldCount} form fields`);

      const hrefMatch = downloadLink.href.match(
        /__doPostBack\('([^']+)','([^']*)'\)/
      );
      if (hrefMatch) {
        console.log(
          `🎯 Setting postback target: ${hrefMatch[1]}, argument: ${hrefMatch[2]}`
        );

        const eventTargetInput =
          form.querySelector('input[name="__EVENTTARGET"]') ||
          document.createElement("input");
        eventTargetInput.type = "hidden";
        eventTargetInput.name = "__EVENTTARGET";
        eventTargetInput.value = hrefMatch[1];
        if (!form.contains(eventTargetInput))
          form.appendChild(eventTargetInput);

        const eventArgumentInput =
          form.querySelector('input[name="__EVENTARGUMENT"]') ||
          document.createElement("input");
        eventArgumentInput.type = "hidden";
        eventArgumentInput.name = "__EVENTARGUMENT";
        eventArgumentInput.value = hrefMatch[2];
        if (!form.contains(eventArgumentInput))
          form.appendChild(eventArgumentInput);
      } else {
        throw new Error(
          `Could not extract postback parameters from href: ${downloadLink.href}`
        );
      }

      document.body.appendChild(form);
      console.log(`📤 Submitting form to download PDF...`);

      fetch(document.location.href, {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      })
        .then((response) => {
          console.log(
            `📥 Received response: ${response.status} ${response.statusText}`
          );
          console.log(
            `📄 Content-Type: ${response.headers.get("content-type")}`
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/pdf")) {
            console.warn(
              `⚠️  Unexpected content type: ${contentType}. Proceeding anyway...`
            );
          }

          return response.arrayBuffer();
        })
        .then(async (arrayBuffer) => {
          console.log(
            `%c📋 PDF DOWNLOADED: ${arrayBuffer.byteLength} bytes for ${patientName}`,
            "color: green"
          );

          if (arrayBuffer.byteLength === 0) {
            throw new Error("Received empty PDF file");
          }

          if (arrayBuffer.byteLength < 100) {
            console.warn(
              `⚠️  Very small PDF file (${arrayBuffer.byteLength} bytes) - might be an error response`
            );
          }

          try {
            console.log(
              `%c🔍 STARTING PDF TEXT EXTRACTION for ${patientName}`,
              "color: blue"
            );

            let isolatedProcessor = null;
            try {
              isolatedProcessor = new window.PDFProcessor();
              await isolatedProcessor.loadPDFJS();
              console.log(
                `🔄 Created fresh PDF processor instance for ${patientName}`
              );
            } catch (processorError) {
              console.warn(
                `⚠️ Could not create fresh PDF processor, using global instance:`,
                processorError
              );
              isolatedProcessor = window.pdfProcessor;
            }

            let processingResult = null;
            try {
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                  () =>
                    reject(
                      new Error("PDF processing timeout after 30 seconds")
                    ),
                  30000
                );
              });

              processingResult = await Promise.race([
                isolatedProcessor.extractTextFromPDF(
                  arrayBuffer,
                  batchItem.patientData
                ),
                timeoutPromise,
              ]);

              console.log(
                `✅ PDF processing completed successfully for ${patientName}`
              );
            } catch (pdfProcessingError) {
              const isInvalidPDF =
                pdfProcessingError.name === "InvalidPDFException" ||
                pdfProcessingError.message.includes("Invalid PDF structure");

              console.error(
                `❌ PDF processing failed for ${patientName}:`,
                pdfProcessingError
              );

              if (isInvalidPDF) {
                console.log(
                  `🔍 Detected corrupted/invalid PDF file for ${patientName}`
                );
                if (typeof window.pdfjsLib !== "undefined") {
                  try {
                    window.pdfjsLib.PDFWorker.cleanup();
                    console.log(
                      `🧹 Forced PDF.js worker cleanup after invalid PDF`
                    );
                  } catch (cleanupError) {
                    console.warn(
                      `⚠️ Could not cleanup PDF.js worker:`,
                      cleanupError
                    );
                  }
                }
              }

              throw pdfProcessingError;
            }

            const extractedPDFData = processingResult;

            console.log(
              `%c✅ PDF EXTRACTION COMPLETE for ${patientName}`,
              "color: green"
            );
            console.log(
              `📊 Tests found: ${
                Object.keys(extractedPDFData.structuredData?.testResults || {})
                  .length
              }`
            );
            console.log(`🧾 Extracted data summary:`, {
              patient: extractedPDFData.patientInfo?.nume,
              tests: Object.keys(
                extractedPDFData.structuredData?.testResults || {}
              ),
              textLength: extractedPDFData.extractedText?.length,
              hasError: !!extractedPDFData.error,
            });

            extractedPDFData.id = batchItem.id;
            extractedPDFData.exported = false;
            extractedPDFData.exportedAt = null;
            extractedPDFData.exportedTests = {};
            extractedPDFData.importedStatus = batchItem.patientData?.importedStatus || "Unknown";
            extractedPDFData.statusChangedSinceImport = false;
            extractedPDFData.lastRefetchAt = null;
            extractedPDFData.needsReexport = false;

            window.extractedData.push(extractedPDFData);

            if (!skipUIUpdate) {
              window.updateTestResultsColumn(batchItem.elementIndex, extractedPDFData);
            }

            try {
              if (isolatedProcessor && isolatedProcessor !== window.pdfProcessor) {
                isolatedProcessor = null;
                console.log(
                  `🧹 Cleaned up isolated PDF processor instance for ${patientName} (success)`
                );
              }
            } catch (cleanupError) {
              console.warn(
                `⚠️ Could not clean up isolated PDF processor:`,
                cleanupError
              );
            }

            resolve(extractedPDFData);
          } catch (pdfError) {
            const errorMsg = `PDF text extraction failed for ${patientName}: ${pdfError.message}`;
            console.error(`%c❌ ${errorMsg}`, "color: red; font-weight: bold");
            console.error(`🔥 PDF processing error details:`, pdfError);

            const errorData = {
              id: batchItem.id,
              patientInfo: batchItem.patientData,
              extractionDate: new Date().toISOString(),
              error: "PDF processing failed: " + pdfError.message,
              status: "PDF_PROCESSING_ERROR",
              pdfSize: arrayBuffer.byteLength,
              errorDetails: pdfError.toString(),
              exported: false,
              exportedAt: null,
              exportedTests: {},
              importedStatus: batchItem.patientData?.importedStatus || "Unknown",
              statusChangedSinceImport: false,
              lastRefetchAt: null,
              needsReexport: false,
            };
            window.extractedData.push(errorData);

            if (!skipUIUpdate) {
              window.updateTestResultsColumn(batchItem.elementIndex, errorData);
            }

            const isInvalidPDF =
              pdfError.name === "InvalidPDFException" ||
              pdfError.message.includes("Invalid PDF structure");
            if (isInvalidPDF) {
              try {
                if (typeof window.pdfjsLib !== "undefined") {
                  window.pdfjsLib.PDFWorker.cleanup();
                }
                if (typeof window.pdfjsWorker !== "undefined") {
                  window.pdfjsWorker = null;
                }
                console.log(
                  `🧹 Performed aggressive PDF.js cleanup after InvalidPDFException`
                );
              } catch (aggressiveCleanupError) {
                console.warn(
                  `⚠️ Aggressive PDF.js cleanup failed:`,
                  aggressiveCleanupError
                );
              }
            }

            console.log(
              `⏭️ PDF processing error isolated with fresh processor - next downloads will use clean state`
            );
            resolve();
          }
        })
        .catch((error) => {
          const errorMsg = `PDF download failed for ${patientName}: ${error.message}`;
          console.error(`%c❌ ${errorMsg}`, "color: red; font-weight: bold");
          console.error(`🔥 Download error details:`, error);

          const errorData = {
            id: batchItem.id,
            patientInfo: batchItem.patientData,
            extractionDate: new Date().toISOString(),
            error: "Download failed: " + error.message,
            status: "DOWNLOAD_ERROR",
            errorDetails: error.toString(),
            exported: false,
            exportedAt: null,
          };
          window.extractedData.push(errorData);

          window.updateTestResultsColumn(batchItem.elementIndex, errorData);

          console.log(
            `⏭️ Download error isolated - next downloads will continue normally`
          );

          resolve(errorData);
        })
        .finally(() => {
          if (document.body.contains(form)) {
            document.body.removeChild(form);
            console.log(`🧹 Cleaned up form for ${patientName}`);
          }
        });
    } catch (error) {
      const errorMsg = `Setup error for ${patientName}: ${error.message}`;
      console.error(`%c❌ ${errorMsg}`, "color: red; font-weight: bold");
      console.error(`🔥 Setup error details:`, error);
      reject(error);
    }
  });
}

function updateAnalysisProgress() {
  const progressDiv = document.getElementById("analysis-progress");
  const analyzeButton = document.getElementById("sante-analyze-page");

  if (window.currentPageAnalysis.isAnalyzing) {
    if (progressDiv) {
      progressDiv.style.display = "none";
    }

    if (analyzeButton) {
      analyzeButton.innerHTML = `🔄 Analyzing... (${window.currentPageAnalysis.completed}/${window.currentPageAnalysis.total})`;
    }
  } else {
    if (progressDiv) {
      progressDiv.style.display = "none";
    }
  }
}

async function finishBatchAnalysis() {
  console.log("🎉 Batch analysis complete! Saving to localStorage...");

  const queue = await window.loadQueueFromDB();

  const existingKeys = new Set(
    queue.map((p) =>
      window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume)
    )
  );

  const newPatients = window.currentPageAnalysis.patients.filter((p) => {
    const key = window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume);
    return !existingKeys.has(key);
  });

  const merged = [...queue, ...newPatients];
  await window.saveQueueToDB(merged);

  console.log(
    `✅ Saved ${newPatients.length} new patients to localStorage (${
      window.currentPageAnalysis.patients.length - newPatients.length
    } duplicates skipped)`
  );

  await window.updateExportCount();

  const message =
    newPatients.length === window.currentPageAnalysis.patients.length
      ? `Added ${newPatients.length} patients`
      : `Added ${newPatients.length} patients (${
          window.currentPageAnalysis.patients.length - newPatients.length
        } duplicates skipped)`;

  window.showSuccessToast("✅ Analysis Complete", message);

  window.currentPageAnalysis = {
    isAnalyzing: false,
    patients: [],
    completed: 0,
    total: 0,
  };

  updateAnalysisProgress();

  const analyzeButton = document.getElementById("sante-analyze-page");
  const exportButton = document.getElementById("sante-process-export");

  if (analyzeButton) {
    analyzeButton.innerHTML = `🔍 Analizează (<span id="analyze-count">0</span>)`;
    await window.updateDownloadCount();
  }

  if (exportButton) {
    exportButton.style.opacity = "1";
    exportButton.style.cursor = "pointer";
  }
}

// Export functions to window
window.toggleBatch = toggleBatch;
window.addToBatch = addToBatch;
window.removeFromBatch = removeFromBatch;
window.processBatch = processBatch;
window.clearAllData = clearAllData;
window.updateBatchCount = updateBatchCount;
window.analyzeCurrentPage = analyzeCurrentPage;
window.refetchPatientData = refetchPatientData;
window.downloadAndProcessPDF = downloadAndProcessPDF;
window.updateAnalysisProgress = updateAnalysisProgress;
window.finishBatchAnalysis = finishBatchAnalysis;
