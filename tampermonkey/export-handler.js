// Export Handler v1.0.0
// Data export and upload functionality

async function exportData() {
  console.log("=== EXPORT DEBUG ===");

  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  if (!idPrefix) {
    window.showWarningToast("⚠️ ID Prefix Missing", "Te rog să introduci un prefix de ID (ex: 25S19)");
    return;
  }

  const allPatients = await window.getQueueData();
  console.log(`📦 Total patients in localStorage: ${allPatients.length}`);

  const patientsToExport = allPatients.filter((p) => {
    if (p.excluded === true) return false;

    const testResults = p.structuredData?.testResults || {};
    const exportedTests = p.exportedTests || {};

    return Object.keys(testResults).some((key) => !exportedTests[key]);
  });

  let totalUnexportedTests = 0;
  patientsToExport.forEach((p) => {
    const testResults = p.structuredData?.testResults || {};
    const exportedTests = p.exportedTests || {};
    const unexported = Object.keys(testResults).filter((key) => !exportedTests[key]);
    totalUnexportedTests += unexported.length;
  });

  console.log(
    `📊 Patients with unexported tests: ${patientsToExport.length} (${totalUnexportedTests} tests)`
  );
  console.log(
    `🚫 Excluded patients: ${
      allPatients.filter((p) => p.excluded === true).length
    }`
  );
  console.log(
    `✓ Fully exported patients: ${
      allPatients.filter((p) => {
        const testResults = p.structuredData?.testResults || {};
        const exportedTests = p.exportedTests || {};
        return Object.keys(testResults).every((key) => exportedTests[key]);
      }).length
    }`
  );

  if (patientsToExport.length === 0 || totalUnexportedTests === 0) {
    window.showWarningToast(
      "Nu am ce să export! Toate testele au fost deja exportate sau pacienții sunt excluși."
    );
    return;
  }

  const missingIds = patientsToExport.filter(
    (item) => !item.patientInfo?.patientText
  );
  if (missingIds.length > 0) {
    alert(
      `Cannot export: ${missingIds.length} patient(s) are missing ID suffixes. Please enter ID suffixes for all selected patients.`
    );
    return;
  }

  const now = new Date();
  const day = now.getDate();
  const monthNames = [
    "ian",
    "feb",
    "mar",
    "apr",
    "mai",
    "iun",
    "iul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const month = monthNames[now.getMonth()];
  const filename = `${idPrefix}_${day}_${month}_Sante.txt`;

  console.log(`📁 Generated filename: ${filename}`);

  let csvContent;
  if (window.pdfProcessor && patientsToExport.length > 0) {
    console.log("Using PDF processor for CSV generation (with per-test filtering)");
    csvContent = window.pdfProcessor.generateCSVFromExtractedData(
      patientsToExport,
      idPrefix,
      true
    );
    console.log(
      "Generated CSV content (first 500 chars):",
      csvContent.substring(0, 500)
    );

    const validationIssues = window.pdfProcessor.validateExportCompleteness(
      patientsToExport,
      csvContent
    );
    if (validationIssues.length > 0) {
      console.warn(
        `⚠️ Export validation found ${validationIssues.length} patient(s) with missing data:`,
        validationIssues
      );
      validationIssues.forEach((issue) => {
        window.showWarningToast(
          `⚠️ Could not export data for: ${issue.patient}`,
          `Extracted ${issue.extractedTests} tests but 0 rows exported (tests not mapped to known keys)`,
          true
        );
      });
    } else {
      console.log(
        `✅ Export validation passed: All ${patientsToExport.length} patients exported successfully`
      );
    }
  } else {
    console.log("Using fallback CSV generation");
    csvContent = convertToCSV(patientsToExport);
  }

  downloadCSV(csvContent, filename);
  await storeFileForUpload(csvContent, filename);

  const exportTimestamp = Date.now();
  const queue = await window.loadQueueFromStorage();
  const exportedKeys = new Set(
    patientsToExport.map((p) =>
      window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume)
    )
  );

  let totalTestsMarked = 0;
  queue.forEach((patient) => {
    const patientKey = window.getPatientKey(
      patient.patientInfo?.idPrefix,
      patient.patientInfo?.nume
    );
    if (exportedKeys.has(patientKey)) {
      const testResults = patient.structuredData?.testResults || {};
      patient.exportedTests = patient.exportedTests || {};

      Object.keys(testResults).forEach((testKey) => {
        if (!patient.exportedTests[testKey]) {
          patient.exportedTests[testKey] = exportTimestamp;
          totalTestsMarked++;
        }
      });

      patient.exported = true;
      patient.exportedAt = exportTimestamp;
      patient.needsReexport = false;
    }
  });

  await window.saveQueueToStorage(queue);
  await updateExportCount();
  await window.syncUIWithLocalStorage();

  console.log(
    `✅ Marked ${totalTestsMarked} tests from ${patientsToExport.length} patients as exported`
  );

  const patientsWithExportableData = patientsToExport.filter((patient) => {
    const testResults = patient.structuredData?.testResults || {};
    let mappedCount = 0;

    Object.entries(testResults).forEach(([testName, testData]) => {
      try {
        if (
          window.pdfProcessor &&
          typeof window.pdfProcessor.mapTestNameToKey === "function"
        ) {
          const mapped = window.pdfProcessor.mapTestNameToKey(testName);
          if (mapped) mappedCount++;
        }
      } catch (e) {}
    });

    return mappedCount > 0;
  });

  await window.syncUIWithLocalStorage();

  const exportMessage =
    patientsWithExportableData.length === patientsToExport.length
      ? `Exported ${patientsWithExportableData.length} patients with exportable data.`
      : `Exported ${
          patientsWithExportableData.length
        } patients with exportable data (${
          patientsToExport.length - patientsWithExportableData.length
        } had no exportable tests).`;

  window.showSuccessToast(
    "✅ Export Complete",
    exportMessage + " Data preserved in localStorage."
  );

  await new Promise(resolve => setTimeout(resolve, 500));
  window.open(
    "https://teamm.work/admin/guests/intake-values-import-dumbrava",
    "_blank"
  );

  console.log(
    `✅ Exported ${patientsToExport.length} patients from localStorage - Downloaded locally AND opening teamm.work for upload`
  );
}

function convertToCSV(data) {
  const headers = ["ID", "Size (bytes)", "Timestamp", "Data"];
  const csvRows = [headers.join(",")];

  data.forEach((item) => {
    const row = [item.id, item.size, item.timestamp, `"${item.data}"`];
    csvRows.push(row.join(","));
  });

  return csvRows.join("\n");
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

async function storeFileForUpload(content, filename) {
  const data = {
    content,
    filename,
    timestamp: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  await StorageAdapter.set({ pendingUpload: data });
  console.log("💾 File stored for upload to teamm.work:", filename);
}

async function updateExportCount() {
  const queue = await window.loadQueueFromStorage();

  const patientsWithUnexportedTests = queue.filter((p) => {
    if (p.excluded === true) return false;

    const testResults = p.structuredData?.testResults || {};
    const exportedTests = p.exportedTests || {};

    return Object.keys(testResults).some((key) => !exportedTests[key]);
  });

  const exportCount = patientsWithUnexportedTests.length;

  const countElement = document.getElementById("exported-count");
  const exportButton = document.getElementById("sante-process-export");

  if (countElement) {
    countElement.textContent = exportCount;
  }

  if (exportButton) {
    if (exportCount > 0) {
      exportButton.disabled = false;
      exportButton.style.background = "#007cba";
      exportButton.style.borderColor = "#007cba";
      exportButton.style.cursor = "pointer";
      exportButton.style.opacity = "1";
    } else {
      exportButton.disabled = true;
      exportButton.style.background = "#6c757d";
      exportButton.style.borderColor = "#6c757d";
      exportButton.style.cursor = "not-allowed";
      exportButton.style.opacity = "0.6";
    }
  }
}

async function updateDownloadCount() {
  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  if (!idPrefix) {
    const countElement = document.getElementById("analyze-count");
    const analyzeButton = document.getElementById("sante-analyze-page");
    if (countElement) countElement.textContent = 0;
    if (analyzeButton) {
      analyzeButton.disabled = true;
      analyzeButton.style.background = "#6c757d";
      analyzeButton.style.borderColor = "#6c757d";
      analyzeButton.style.color = "white";
      analyzeButton.style.cursor = "not-allowed";
      analyzeButton.style.opacity = "0.6";
    }
    return;
  }

  const queue = await window.loadQueueFromStorage();
  const existingKeys = new Set(
    queue.map((p) =>
      window.getPatientKey(p.patientInfo?.idPrefix, p.patientInfo?.nume)
    )
  );

  const patientInputs = document.querySelectorAll('input[id^="patient-text-"]');
  const analyzeCount = Array.from(patientInputs).filter((input) => {
    if (input.value.trim() === "") return false;

    const row = input.closest("tr");
    const statusIcon = row?.querySelector(".glyphicon");

    if (statusIcon) {
      const statusTitle = statusIcon.getAttribute("title");
      if (statusTitle !== "Efectuat cu rezultate" && statusTitle !== "In lucru" && statusTitle !== "Rezultate partiale") return false;
    } else {
      return false;
    }

    const cells = row.querySelectorAll("td");
    const patientName = cells[1]?.textContent.trim();
    const patientKey = window.getPatientKey(idPrefix, patientName);

    return !existingKeys.has(patientKey);
  }).length;

  const countElement = document.getElementById("analyze-count");
  const analyzeButton = document.getElementById("sante-analyze-page");

  if (countElement) {
    countElement.textContent = analyzeCount;
  }

  if (analyzeButton) {
    if (analyzeCount > 0) {
      analyzeButton.disabled = false;
      analyzeButton.style.background = "#ffc107";
      analyzeButton.style.borderColor = "#ffc107";
      analyzeButton.style.color = "#212529";
      analyzeButton.style.cursor = "pointer";
      analyzeButton.style.opacity = "1";
    } else {
      analyzeButton.disabled = true;
      analyzeButton.style.background = "#6c757d";
      analyzeButton.style.borderColor = "#6c757d";
      analyzeButton.style.color = "white";
      analyzeButton.style.cursor = "not-allowed";
      analyzeButton.style.opacity = "0.6";
    }
  }
}

// Export to window
window.exportData = exportData;
window.convertToCSV = convertToCSV;
window.downloadCSV = downloadCSV;
window.storeFileForUpload = storeFileForUpload;
window.updateExportCount = updateExportCount;
window.updateDownloadCount = updateDownloadCount;
