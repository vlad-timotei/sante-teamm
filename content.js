// Content script to inject batch functionality into the ASPX site
let batchCounter = 0;
let extractedData = [];
let pdfProcessor = null;
let batchQueue = []; // Store batch items locally

// Wait for page to load and inject batch buttons
document.addEventListener("DOMContentLoaded", initializeBatchExtension);

// Also run immediately in case DOM is already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeBatchExtension);
} else {
  initializeBatchExtension();
}

async function initializeBatchExtension() {
  // Initialize PDF processor with full PDF.js
  pdfProcessor = new PDFProcessor();
  await pdfProcessor.loadPDFJS();

  // Add test results column to table
  addTestResultsColumn();

  // Find all download buttons/links on the page
  const downloadElements = findDownloadElements();

  if (downloadElements.length > 0) {
    injectBatchButtons(downloadElements);
    createSingleProcessButton();

    // Check for stored CSV data after everything is set up
    setTimeout(() => {
      // Try to load stored data even if prefix field is empty by checking localStorage for any stored prefixes
      tryLoadAnyStoredData();
    }, 500);
  }
}

function addTestResultsColumn() {
  const table = document.getElementById("ctl00_contentMain_dgGrid");
  if (!table) {
    console.warn("Table not found for adding test results column");
    return;
  }

  console.log("📊 Adding test results column to table");

  // Hide unwanted columns (Nr Doc and Cod Bare)
  hideUnwantedColumns(table);

  // Find header row (contains th elements) and data rows (contain td elements)
  const allRows = table.querySelectorAll("tr");
  console.log(`📋 Found ${allRows.length} total rows in table`);

  let headerRow = null;
  let dataRows = [];

  allRows.forEach((row, index) => {
    const thElements = row.querySelectorAll("th");
    const tdElements = row.querySelectorAll("td");

    if (thElements.length > 0) {
      headerRow = row;
      console.log(
        `📋 Row ${index} is header row (has ${thElements.length} th elements)`
      );
    } else if (tdElements.length > 0) {
      dataRows.push(row);
      console.log(
        `📋 Row ${index} is data row (has ${tdElements.length} td elements)`
      );
    }
  });

  // Add headers for batch processing and test results columns
  if (headerRow) {
    // Add Batch Processing header
    const batchHeaderCell = document.createElement("th");
    batchHeaderCell.textContent = "Export";
    batchHeaderCell.style.cssText = `
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  padding: 8px;
  font-weight: bold;
  width: 80px;
`;
    headerRow.appendChild(batchHeaderCell);

    // Add Test Results header
    const testResultsHeaderCell = document.createElement("th");
    testResultsHeaderCell.textContent = "Results";
    testResultsHeaderCell.style.cssText = `
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  padding: 8px;
  font-weight: bold;
`;
    headerRow.appendChild(testResultsHeaderCell);
    console.log("✅ Added batch processing and test results headers");
  } else {
    console.warn("⚠️  No header row found with th elements");
  }

  console.log(`📋 Found ${dataRows.length} data rows to add test result cells`);

  dataRows.forEach((row, index) => {
    // Check if this is a pagination row - more comprehensive detection
    const paginationElement = row.querySelector(".pagination");
    const hasColspan = row.querySelector("td[colspan]");
    const hasPaginationLinks = row.querySelector('a[href*="doPostBack"]');
    const cellText = row.textContent.trim();
    const isPaginationRow =
      paginationElement ||
      row.closest("tfoot") ||
      (hasColspan && hasPaginationLinks) ||
      (hasColspan && /^\d+.*\d+$/.test(cellText)); // Pattern like "1 2 3 4 5..."

    console.log(`📋 Row ${index} analysis:`, {
      hasPagination: !!paginationElement,
      hasColspan: !!hasColspan,
      hasPaginationLinks: !!hasPaginationLinks,
      cellText: cellText.substring(0, 50),
      isPaginationRow: isPaginationRow,
    });

    if (isPaginationRow) {
      console.log(`📋 Detected pagination row ${index} - preserving as-is`);
      return;
    }

    const downloadLink = row.querySelector('a[id*="lnkView"]');
    if (!downloadLink) {
      console.log(`📋 Skipping row ${index} - no download link`);
      return;
    }

    // Add Batch Processing cell
    const batchCell = document.createElement("td");
    batchCell.id = `batch-cell-${index}`;
    batchCell.style.cssText = `
  border: 1px solid #dee2e6;
  padding: 8px;
  text-align: center;
  white-space: nowrap;
`;

    // Create container for button and input
    const container = document.createElement("div");
    container.style.cssText = `
  display: flex;
  align-items: center;
  gap: 5px;
  justify-content: center;
`;

    // Create batch button
    const batchBtn = document.createElement("button");
    batchBtn.textContent = "+";
    batchBtn.style.cssText = `
  background: #007cba;
  color: white;
  border: none;
  padding: 5px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
`;

    batchBtn.onclick = (e) => {
      e.preventDefault();
      toggleBatch(downloadLink, index, batchBtn);
    };

    // Create patient text input
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.id = `patient-text-${index}`;
    textInput.setAttribute("data-link-id", downloadLink.id); // Store link ID for easier matching
    textInput.placeholder = "*ID";
    textInput.style.cssText = `
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 2px;
  font-size: 11px;
  width: 30px;
`;

    container.appendChild(batchBtn);
    container.appendChild(textInput);
    batchCell.appendChild(container);

    // Add Test Results cell
    const testResultsCell = document.createElement("td");
    testResultsCell.id = `test-results-${index}`;
    testResultsCell.style.cssText = `
  border: 1px solid #dee2e6;
  padding: 8px;
  font-size: 12px;
  color: #666;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
`;
    testResultsCell.textContent = "-";
    testResultsCell.setAttribute("data-link-id", downloadLink.id);

    row.appendChild(batchCell);
    row.appendChild(testResultsCell);

    console.log(
      `✅ Added batch processing and test results cells ${index} for link ${downloadLink.id}`
    );
  });

  console.log("📊 Finished adding test results column");
}

function hideUnwantedColumns(table) {
  console.log(
    "🔧 Hiding unwanted columns (Nr Doc, Cod Bare, and Unitate recoltare)"
  );

  const rows = table.querySelectorAll("tr");
  if (rows.length === 0) return;

  // Find which columns to hide by examining the header row
  const headerRow = rows[0];
  const headerCells = headerRow.querySelectorAll("th, td");
  const columnsToHide = [];

  headerCells.forEach((cell, index) => {
    const cellText = cell.textContent.trim().toLowerCase();
    // Check for column names to hide
    if (
      (cellText.includes("nr") && cellText.includes("doc")) ||
      (cellText.includes("nr.") && cellText.includes("doc")) ||
      (cellText.includes("cod") && cellText.includes("bare")) ||
      (cellText.includes("unitate") && cellText.includes("recoltare"))
    ) {
      columnsToHide.push(index);
      console.log(`📋 Will hide column ${index}: "${cell.textContent}"`);
    }
  });

  // Hide the identified columns in all rows (except pagination rows)
  if (columnsToHide.length > 0) {
    rows.forEach((row) => {
      // Skip hiding columns for pagination rows
      const isPaginationRow =
        row.querySelector(".pagination") || row.querySelector("td[colspan]");

      if (isPaginationRow) {
        console.log(`📋 Skipping column hiding for pagination row`);
        return;
      }

      const cells = row.querySelectorAll("th, td");
      columnsToHide.forEach((columnIndex) => {
        if (cells[columnIndex]) {
          cells[columnIndex].style.display = "none";
        }
      });
    });
    console.log(`✅ Hidden ${columnsToHide.length} unwanted columns`);
  } else {
    console.log("ℹ️ No unwanted columns found to hide");
  }
}

function findDownloadElements() {
  // Target the specific download links in the table
  const downloadLinks = document.querySelectorAll(
    '#ctl00_contentMain_dgGrid a[id*="lnkView"]'
  );
  return Array.from(downloadLinks);
}

// Batch buttons are now integrated into the table columns
function injectBatchButtons(downloadElements) {
  // This function is now obsolete - batch buttons are created in addTestResultsColumn()
  console.log("Batch buttons are now integrated into table columns");
}

function createSingleProcessButton() {
  // Find the table and add button after it
  const table = document.getElementById("ctl00_contentMain_dgGrid");
  if (!table) return;

  // Create compact button container
  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = `
margin: 10px 0;
padding: 8px 12px;
background: #f8f9fa;
border: 1px solid #dee2e6;
border-radius: 4px;
  `;

  buttonContainer.innerHTML = `
<div style="display: flex; gap: 12px; align-items: center; justify-content: center;">
  <input type="hidden" id="id-prefix">
  <label for="csv-upload" style="
    background: #28a745;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    border: 2px solid #28a745;
    display: inline-block;
    text-align: center;
    transition: all 0.2s;
  " onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">
    📁 Choose CSV File
  </label>
  <input type="file" id="csv-upload" accept=".csv" style="display: none;">
  <button type="button" id="sante-download-all" style="
    background: #6c757d;
    color: white;
    border: 2px solid #6c757d;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: not-allowed;
    font-size: 12px;
    font-weight: bold;
    opacity: 0.6;
    display: inline-block;
    text-align: center;
    transition: all 0.2s;
  " disabled>
    📥 Download All (<span id="download-count">0</span>)
  </button>
  <button type="button" id="sante-process-export" style="
    background: #6c757d;
    color: white;
    border: 2px solid #6c757d;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: not-allowed;
    font-size: 12px;
    font-weight: bold;
    opacity: 0.6;
    display: inline-block;
    text-align: center;
    transition: all 0.2s;
  " disabled>
    📥 Export (<span id="exported-count">0</span>)
  </button>
</div>
<div id="match-results" style="display: none;"></div>
  `;

  // Insert before the table
  table.parentNode.insertBefore(buttonContainer, table);

  document.getElementById("sante-process-export").onclick = exportData;
  document.getElementById("sante-download-all").onclick = downloadAllWithIDs;

  // Auto-submit CSV when file is selected
  const csvFileInput = document.getElementById("csv-upload");
  csvFileInput.onchange = function (event) {
    if (this.files && this.files[0]) {
      console.log("CSV file selected, auto-processing...");
      handleCSVUpload(event);
    }
  };
}

// Status display is now integrated into the main control panel

function toggleBatch(element, index, batchBtn) {
  const isCurrentlyBatched = batchBtn.getAttribute("data-batched") === "true";

  if (isCurrentlyBatched) {
    // Remove from batch
    removeFromBatch(element, index, batchBtn);
  } else {
    // Add to batch
    addToBatch(element, index, batchBtn);
  }
}

async function addToBatch(element, index, batchBtn) {
  // Get patient text input value
  const patientTextInput = document.getElementById(`patient-text-${index}`);
  const patientText = patientTextInput ? patientTextInput.value.trim() : "";

  // Check if patient text is provided
  if (!patientText) {
    alert("Please enter an ID suffix for this patient before adding to batch.");
    return;
  }

  // Get patient data from the table row
  const row = element.closest("tr");
  const cells = row.querySelectorAll("td");

  // Check patient status before processing
  const statusIcon = row.querySelector(".glyphicon");
  if (statusIcon) {
    const statusTitle = statusIcon.getAttribute("title");
    console.log(`🔍 Checking status for patient: ${statusTitle}`);

    // Block patients with "In lucru" status
    if (statusTitle === "In lucru") {
      alert(
        `Cannot process patient: Status is "${statusTitle}". Only patients with "Efectuat cu rezultate" status can be processed.`
      );
      console.log(
        `❌ BLOCKED: Patient has "In lucru" status - processing would fail`
      );
      return;
    }

    // Only allow patients with "Efectuat cu rezultate" status
    if (statusTitle !== "Efectuat cu rezultate") {
      alert(
        `Cannot process patient: Status is "${statusTitle}". Only patients with "Efectuat cu rezultate" status can be processed.`
      );
      console.log(
        `❌ BLOCKED: Patient status "${statusTitle}" - only "Efectuat cu rezultate" allowed`
      );
      return;
    }

    console.log(
      `✅ STATUS OK: Patient has "${statusTitle}" status - processing allowed`
    );
  } else {
    console.warn(
      `⚠️ No status icon found for patient - proceeding with caution`
    );
  }

  const patientData = {
    nrDoc: cells[0]?.textContent.trim(),
    nume: cells[1]?.textContent.trim(),
    cnp: cells[2]?.textContent.trim(),
    dataNasterii: cells[3]?.textContent.trim(),
    unitateRecoltare: cells[4]?.textContent.trim(),
    codBare: cells[5]?.textContent.trim(),
    dataRecoltare: cells[6]?.textContent.trim(),
    dataRezultate: cells[7]?.textContent.trim(),
    patientText: patientText, // Store the patient-specific text
  };

  batchCounter++;

  // Store locally first, then try to sync with background
  const batchItem = {
    id: `pdf_${batchCounter}`,
    elementId: element.id,
    patientData: patientData,
    elementIndex: index,
    timestamp: Date.now(),
  };

  batchQueue.push(batchItem);

  // Store locally (Chrome extension background script removed for Tampermonkey)
  console.log("Storing batch item locally:", batchItem);

  updateBatchCount(batchQueue.length);

  // Visual feedback - mark as added and processing
  batchBtn.textContent = "⏳";
  batchBtn.style.background = "#ffc107";
  batchBtn.setAttribute("data-batched", "true");
  batchBtn.setAttribute("data-element-id", element.id);

  console.log(
    `%c✅ ADDED TO BATCH: ${patientData.nume} - Auto-processing...`,
    "color: green; font-weight: bold"
  );

  // Restore row styling if it was previously excluded
  if (row) {
    row.style.opacity = "1";
    row.style.backgroundColor = "";
  }

  // Restore test results cell styling
  const testResultCell = document.getElementById(`test-results-${index}`);
  if (testResultCell) {
    testResultCell.style.opacity = "1";
    testResultCell.style.backgroundColor = "";

    // Remove excluded indicator if it exists
    const excludedIndicator = testResultCell.querySelector(
      ".excluded-indicator"
    );
    if (excludedIndicator) {
      excludedIndicator.remove();
    }
  }

  // Auto-process this PDF immediately
  try {
    await downloadAndProcessPDF(element, batchItem);

    // Mark as included if it was previously excluded
    const extractedItem = extractedData.find(
      (item) =>
        item.debugInfo?.elementIndex === index || item.id === batchItem.id
    );
    if (extractedItem) {
      extractedItem.excluded = false;
      console.log(
        `%c✅ MARKED AS INCLUDED: ${extractedItem.patientInfo?.nume}`,
        "color: green; font-weight: bold"
      );
    }

    // Update button to show completed
    batchBtn.textContent = "✓";
    batchBtn.style.background = "#28a745";

    console.log(
      `%c🎉 AUTO-PROCESSING COMPLETE: ${patientData.nume}`,
      "color: green; font-weight: bold"
    );
    updateExportCount();
  } catch (error) {
    // Isolated error handling - this failure should not affect other downloads
    console.error(
      `%c❌ AUTO-PROCESSING FAILED: ${patientData.nume}`,
      "color: red; font-weight: bold",
      error
    );
    console.error(`🔥 Error details for ${patientData.nume}:`, error);

    // Update button to show error but keep it functional for retry
    batchBtn.textContent = "❌";
    batchBtn.style.background = "#dc3545";
    batchBtn.title = `Error: ${error.message}. Click to retry.`;

    // Reset batch state so the button can be clicked again
    batchBtn.setAttribute("data-batched", "false");

    // Clear any error styling to make it clear this can be retried
    batchBtn.style.opacity = "1";
    batchBtn.onclick = (e) => {
      e.preventDefault();
      // Clear previous error state completely
      batchBtn.textContent = "+";
      batchBtn.style.background = "#007cba";
      batchBtn.title = "";
      // Re-trigger the batch processing
      toggleBatch(element, index, batchBtn);
    };

    // Log that other downloads should continue normally
    console.log(
      `%c⏭️ ERROR ISOLATED: Other downloads will continue normally`,
      "color: orange; font-weight: bold"
    );

    updateExportCount();
  }
}

function removeFromBatch(element, index, batchBtn) {
  // Find and remove the item from batchQueue
  const elementId = element.id;
  const itemIndex = batchQueue.findIndex(
    (item) => item.elementId === elementId
  );

  if (itemIndex !== -1) {
    const removedItem = batchQueue.splice(itemIndex, 1)[0];
    console.log(
      `%c❌ REMOVED FROM BATCH: ${removedItem.patientData.nume}`,
      "color: orange; font-weight: bold"
    );
  }

  // Mark extracted data as excluded
  const extractedItem = extractedData.find((item) => {
    const batchItem =
      batchQueue.find((batch) => batch.elementId === elementId) ||
      extractedData.find(
        (extracted) => extracted.debugInfo?.elementIndex === index
      );
    return batchItem ? item.id === batchItem.id : extracted === item;
  });

  if (extractedItem) {
    extractedItem.excluded = true;
    console.log(
      `%c🚫 MARKED AS EXCLUDED: ${extractedItem.patientInfo?.nume}`,
      "color: gray; font-weight: bold"
    );
  }

  updateBatchCount(batchQueue.length);

  // Visual feedback - mark as not batched
  batchBtn.textContent = "+";
  batchBtn.style.background = "#007cba";
  batchBtn.removeAttribute("data-batched");
  batchBtn.removeAttribute("data-element-id");

  // Grey out the table row and test results
  const row = element.closest("tr");
  if (row) {
    row.style.opacity = "0.5";
    row.style.backgroundColor = "#f8f9fa";
  }

  // Grey out test results cell
  const testResultCell = document.getElementById(`test-results-${index}`);
  if (testResultCell) {
    testResultCell.style.opacity = "0.5";
    testResultCell.style.backgroundColor = "#e9ecef";

    // Add excluded indicator
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

  // Update export count
  updateExportCount();
}

async function processAndExportAll() {
  const button = document.getElementById("sante-process-export");
  const statusText = document.getElementById("status-text");

  if (batchQueue.length === 0) {
    statusText.textContent = "No PDFs selected! Click + Batch buttons first.";
    statusText.style.color = "#dc3545";
    setTimeout(() => {
      statusText.textContent =
        "Click + Batch buttons above, then process all at once";
      statusText.style.color = "#666";
    }, 3000);
    return;
  }

  button.disabled = true;
  button.textContent = "Processing...";
  statusText.textContent = `Processing ${batchQueue.length} PDFs...`;
  statusText.style.color = "#007cba";

  console.log(
    `%c🚀 STARTING BATCH PROCESSING of ${batchQueue.length} PDFs`,
    "color: blue; font-weight: bold"
  );

  // Process all PDFs
  await processBatch();

  // Auto-export data
  if (extractedData.length > 0) {
    statusText.textContent = "Exporting data...";
    console.log(`%c📤 AUTO-EXPORTING DATA`, "color: green; font-weight: bold");
    exportData();

    statusText.textContent = `✅ Exported ${extractedData.length} results! Data preserved.`;
    statusText.style.color = "#28a745";
  } else {
    statusText.textContent = "❌ No data extracted. Check console for errors.";
    statusText.style.color = "#dc3545";
  }

  // Reset button (keep data and test results)
  button.disabled = false;
  button.textContent = `Process & Export All PDFs (${batchQueue.length})`;

  setTimeout(() => {
    statusText.textContent =
      "Data exported and preserved. Process more or reload page to start fresh.";
    statusText.style.color = "#666";
  }, 5000);
}

async function processBatch() {
  if (batchQueue.length === 0) {
    return;
  }

  // Process each PDF in the batch queue
  for (let i = 0; i < batchQueue.length; i++) {
    const item = batchQueue[i];
    const patientName = item.patientData.nume || "Unknown";

    // Update status if status text exists
    const statusText = document.getElementById("status-text");
    if (statusText) {
      statusText.textContent = `Processing ${i + 1}/${
        batchQueue.length
      }: ${patientName}`;
    }

    console.log(
      `%c📋 PROCESSING PATIENT ${i + 1}/${batchQueue.length}`,
      "color: blue; font-weight: bold"
    );
    console.log(`👤 Patient: ${patientName}`);
    console.log(`🆔 Element ID: ${item.elementId}`);
    console.log(`📅 Batch Item:`, item);

    try {
      // Find the download link for this item
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

        // List all available elements for debugging
        const allLinks = document.querySelectorAll(
          '#ctl00_contentMain_dgGrid a[id*="lnkView"]'
        );
        console.log(
          `🔍 Available download links:`,
          Array.from(allLinks).map((link) => link.id)
        );

        // Create error entry if link not found
        const linkErrorData = {
          id: item.id,
          patientInfo: item.patientData,
          extractionDate: new Date().toISOString(),
          error:
            "Download link not found - element may have been removed from page",
          status: "LINK_NOT_FOUND",
          availableLinks: Array.from(allLinks).map((link) => link.id),
        };
        extractedData.push(linkErrorData);

        // Update test results column with error
        updateTestResultsColumn(item.elementIndex, linkErrorData);
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
      extractedData.push(processingErrorData);

      // Update test results column with error
      updateTestResultsColumn(item.elementIndex, processingErrorData);
    }

    // Progress tracking removed - using simplified UI
    console.log(
      `%c📊 Progress: ${extractedData.length}/${batchQueue.length} completed`,
      "color: purple"
    );

    // Wait between downloads to avoid overwhelming the server
    if (i < batchQueue.length - 1) {
      console.log(`⏳ Waiting 2 seconds before next download...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

function clearAllData() {
  console.log(`%c🧹 CLEARING ALL DATA`, "color: orange; font-weight: bold");

  // Clear local data
  batchQueue = [];
  extractedData = [];
  batchCounter = 0;

  // Background data clearing removed for Tampermonkey compatibility
  console.log("Batch data cleared locally");

  updateBatchCount(0);

  // Reset all batch buttons to original state
  const batchedButtons = document.querySelectorAll(
    'button[data-batched="true"]'
  );
  batchedButtons.forEach((btn) => {
    btn.textContent = "+";
    btn.style.background = "#007cba";
    btn.disabled = false;
    btn.removeAttribute("data-batched");
  });

  // Clear all test results columns
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

function updateExportCount() {
  const exportCount = extractedData.filter((item) => !item.excluded).length;
  const countElement = document.getElementById("exported-count");
  const exportButton = document.getElementById("sante-process-export");

  if (countElement) {
    countElement.textContent = exportCount;
  }

  if (exportButton) {
    if (exportCount > 0) {
      // Enable button when results are available
      exportButton.disabled = false;
      exportButton.style.background = "#007cba";
      exportButton.style.borderColor = "#007cba";
      exportButton.style.cursor = "pointer";
      exportButton.style.opacity = "1";
    } else {
      // Disable button when no results are available
      exportButton.disabled = true;
      exportButton.style.background = "#6c757d";
      exportButton.style.borderColor = "#6c757d";
      exportButton.style.cursor = "not-allowed";
      exportButton.style.opacity = "0.6";
    }
  }
}

function updateDownloadCount() {
  // Count how many patients have ID suffixes filled in AND have ready status
  const patientInputs = document.querySelectorAll('input[id^="patient-text-"]');
  const downloadCount = Array.from(patientInputs).filter((input) => {
    if (input.value.trim() === "") return false;

    // Check patient status
    const row = input.closest("tr");
    const statusIcon = row?.querySelector(".glyphicon");

    if (statusIcon) {
      const statusTitle = statusIcon.getAttribute("title");
      // Only count patients with ready status
      return statusTitle === "Efectuat cu rezultate";
    }

    // If no status found, don't count (safer approach)
    return false;
  }).length;

  const countElement = document.getElementById("download-count");
  const downloadButton = document.getElementById("sante-download-all");

  if (countElement) {
    countElement.textContent = downloadCount;
  }

  if (downloadButton) {
    if (downloadCount > 0) {
      // Enable button when patients with IDs are available
      downloadButton.disabled = false;
      downloadButton.style.background = "#ffc107";
      downloadButton.style.borderColor = "#ffc107";
      downloadButton.style.color = "#212529";
      downloadButton.style.cursor = "pointer";
      downloadButton.style.opacity = "1";
    } else {
      // Disable button when no patients have IDs
      downloadButton.disabled = true;
      downloadButton.style.background = "#6c757d";
      downloadButton.style.borderColor = "#6c757d";
      downloadButton.style.color = "white";
      downloadButton.style.cursor = "not-allowed";
      downloadButton.style.opacity = "0.6";
    }
  }
}

async function downloadAllWithIDs() {
  console.log("🔄 Starting download all with IDs...");

  // Find all patients with filled ID suffixes
  const patientInputs = document.querySelectorAll('input[id^="patient-text-"]');
  const patientsWithIDs = [];

  patientInputs.forEach((input) => {
    const idSuffix = input.value.trim();
    if (idSuffix !== "") {
      // Check patient status before adding to download list
      const row = input.closest("tr");
      const statusIcon = row?.querySelector(".glyphicon");

      if (statusIcon) {
        const statusTitle = statusIcon.getAttribute("title");

        // Skip patients with non-ready status
        if (
          statusTitle === "In lucru" ||
          statusTitle !== "Efectuat cu rezultate"
        ) {
          console.log(
            `⏭️ Skipping patient with ID suffix ${idSuffix} - status: "${statusTitle}"`
          );
          return;
        }

        console.log(
          `✅ Including patient with ID suffix ${idSuffix} - status: "${statusTitle}"`
        );
      }

      // Find the corresponding batch button
      const batchButton = findBatchButtonForInput(input);
      if (batchButton) {
        patientsWithIDs.push({
          input: input,
          button: batchButton,
          suffix: idSuffix,
        });
      }
    }
  });

  if (patientsWithIDs.length === 0) {
    const totalWithIDs = Array.from(patientInputs).filter(
      (input) => input.value.trim() !== ""
    ).length;
    if (totalWithIDs > 0) {
      alert(
        `Found ${totalWithIDs} patients with IDs, but none have "Efectuat cu rezultate" status. Only patients with ready status can be downloaded.`
      );
    } else {
      alert("No patients with ID suffixes found!");
    }
    return;
  }

  console.log(
    `📥 Found ${patientsWithIDs.length} patients with IDs to download`
  );

  // Trigger batch processing for each patient with a delay to avoid overwhelming the server
  // Each download is isolated - if one fails, others will continue
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
        // Error is isolated, other downloads will continue
      }
    }, i * 500); // 500ms delay between each download
  }

  console.log(
    `✅ Triggered downloads for ${patientsWithIDs.length} patients (with error isolation)`
  );
}

function updateTestResultsColumn(elementIndex, extractedData) {
  const testResultCell = document.getElementById(
    `test-results-${elementIndex}`
  );

  if (!testResultCell) {
    console.warn(
      `Test result cell not found for index ${elementIndex}. Available cells:`,
      Array.from(document.querySelectorAll('[id^="test-results-"]')).map(
        (cell) => cell.id
      )
    );
    return;
  }

  console.log(
    `%c📊 UPDATING TEST RESULTS for index ${elementIndex}`,
    "color: blue; font-weight: bold"
  );

  // Format test results for display
  if (extractedData.error) {
    testResultCell.innerHTML = `
  <span style="color: #dc3545;">❌ Error: ${extractedData.error}</span>
`;
    return;
  }

  const testResults = extractedData.structuredData?.testResults || {};
  const testCount = Object.keys(testResults).length;

  if (testCount === 0) {
    testResultCell.innerHTML = `
  <span style="color: #ffc107;">⚠️ No tests found</span>
`;
    return;
  }

  // Create summary of tests with values
  let testsHtml = `<div style="color: #28a745; font-weight: bold;">${testCount} test(s) found:</div>`;

  const knownItems = [];
  const otherItems = [];

  Object.entries(testResults).forEach(([testName, testData]) => {
    const value = testData.value || "N/A";
    let mapped = null;
    try {
      if (pdfProcessor && typeof pdfProcessor.mapTestNameToKey === "function") {
        mapped = pdfProcessor.mapTestNameToKey(testName);
      }
    } catch (e) {}

    if (mapped) {
      knownItems.push({ key: mapped, value });
    } else {
      otherItems.push(`${testName}: ${value}`);
    }
  });

  // Sort known mapped items in a consistent order
  const ORDER = [
    "B12",
    "25OHD",
    "TSH",
    "FT4",
    "ATPO",
    "HBA1C",
    "FERITINA",
    "IRON",
    "PSA",
    "VSH",
    "HOMOCYSTEIN",
    "TSB",
    "CRP",
  ];
  // Nice display labels for table
  const DISPLAY = {
    B12: "Vitamina B12",
    "25OHD": "25-OH Vitamina D",
    TSH: "TSH",
    FT4: "FT4",
    ATPO: "Anti-TPO (Anti-tiroidperoxidaza)",
    HBA1C: "Hemoglobina glicozilata (HbA1c)",
    FERITINA: "Feritina",
    IRON: "Sideremie",
    PSA: "PSA",
    VSH: "VSH",
    HOMOCYSTEIN: "Homocisteina",
    TSB: "Bilirubina totală",
    CRP: "CRP (Proteina C reactivă)",
  };
  knownItems.sort((a, b) => {
    const ai = ORDER.indexOf(a.key);
    const bi = ORDER.indexOf(b.key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Render known mapped items with nice names
  knownItems.forEach(({ key, value }) => {
    const label = DISPLAY[key] || key;
    testsHtml += `<div style="margin: 2px 0;">• ${label}: <strong>${value}</strong></div>`;
  });

  // Visual-only summary for unmapped tests
  if (otherItems.length > 0) {
    testsHtml += `<div style="margin: 4px 0; color: #555;">Other tests: ${otherItems.join(
      "; "
    )}</div>`;
  }

  testResultCell.innerHTML = testsHtml;
  testResultCell.style.color = "#000";
  testResultCell.title = `Full test results for this patient (${testCount} tests).`;
}

async function downloadAndProcessPDF(downloadLink, batchItem) {
  const patientName = batchItem.patientData.nume || "Unknown";

  return new Promise((resolve, reject) => {
    try {
      console.log(
        `%c🔽 STARTING PDF DOWNLOAD for ${patientName}`,
        "color: orange; font-weight: bold"
      );

      // Create a form to submit the ASPX postback manually
      const form = document.createElement("form");
      form.method = "POST";
      form.action = document.location.pathname;
      form.style.display = "none";

      // Copy all the ASPX form fields
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

      // Set the postback target from the download link
      const hrefMatch = downloadLink.href.match(
        /__doPostBack\('([^']+)','([^']*)'\)/
      );
      if (hrefMatch) {
        console.log(
          `🎯 Setting postback target: ${hrefMatch[1]}, argument: ${hrefMatch[2]}`
        );

        // Update the event target
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

      // Submit form and capture response
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

          // Process the PDF content with a fresh PDF processor instance
          try {
            console.log(
              `%c🔍 STARTING PDF TEXT EXTRACTION for ${patientName}`,
              "color: blue"
            );

            // Create a fresh PDF processor instance to avoid state corruption
            let isolatedProcessor = null;
            try {
              isolatedProcessor = new PDFProcessor();
              await isolatedProcessor.loadPDFJS();
              console.log(
                `🔄 Created fresh PDF processor instance for ${patientName}`
              );
            } catch (processorError) {
              console.warn(
                `⚠️ Could not create fresh PDF processor, using global instance:`,
                processorError
              );
              isolatedProcessor = pdfProcessor;
            }

            // Add extra protection against PDF.js global state corruption
            let processingResult = null;
            try {
              // Create a timeout promise to prevent hanging
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                  () =>
                    reject(
                      new Error("PDF processing timeout after 30 seconds")
                    ),
                  30000
                );
              });

              // Race the PDF processing against timeout
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
              // Handle specific PDF.js errors
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
                // Force cleanup of PDF.js state
                if (typeof window.pdfjsLib !== "undefined") {
                  try {
                    // Clear any cached PDF documents
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

              // Re-throw to be handled by outer catch
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

            // Add debug info to extracted data
            extractedPDFData.debugInfo = {
              elementIndex: batchItem.elementIndex,
              batchId: batchItem.id,
              patientName: patientName,
              extractionTimestamp: Date.now(),
            };

            extractedData.push(extractedPDFData);

            // Update test results column
            updateTestResultsColumn(batchItem.elementIndex, extractedPDFData);

            // Clean up isolated processor if it was created
            try {
              if (isolatedProcessor && isolatedProcessor !== pdfProcessor) {
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

            // Still save what we can
            const errorData = {
              id: batchItem.id,
              patientInfo: batchItem.patientData,
              extractionDate: new Date().toISOString(),
              error: "PDF processing failed: " + pdfError.message,
              status: "PDF_PROCESSING_ERROR",
              pdfSize: arrayBuffer.byteLength,
              errorDetails: pdfError.toString(),
            };
            extractedData.push(errorData);

            // Update test results column with error
            updateTestResultsColumn(batchItem.elementIndex, errorData);

            // Clean up isolated processor if it was created
            try {
              if (isolatedProcessor && isolatedProcessor !== pdfProcessor) {
                isolatedProcessor = null;
                console.log(
                  `🧹 Cleaned up isolated PDF processor instance for ${patientName}`
                );
              }
            } catch (cleanupError) {
              console.warn(
                `⚠️ Could not clean up isolated PDF processor:`,
                cleanupError
              );
            }

            // Additional PDF.js global cleanup for InvalidPDFException
            const isInvalidPDF =
              pdfError.name === "InvalidPDFException" ||
              pdfError.message.includes("Invalid PDF structure");
            if (isInvalidPDF) {
              try {
                // Force more aggressive cleanup
                if (typeof window.pdfjsLib !== "undefined") {
                  window.pdfjsLib.PDFWorker.cleanup();
                }
                // Clear any potential cached state
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

          // Create error data entry for tracking
          const errorData = {
            id: batchItem.id,
            patientInfo: batchItem.patientData,
            extractionDate: new Date().toISOString(),
            error: "Download failed: " + error.message,
            status: "DOWNLOAD_ERROR",
            errorDetails: error.toString(),
          };
          extractedData.push(errorData);

          // Update test results column with error
          updateTestResultsColumn(batchItem.elementIndex, errorData);

          console.log(
            `⏭️ Download error isolated - next downloads will continue normally`
          );

          // Resolve instead of reject to prevent error propagation
          resolve(errorData);
        })
        .finally(() => {
          // Clean up
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

// Export functionality is now integrated into processAndExportAll()

function exportData() {
  console.log("=== EXPORT DEBUG ===");
  console.log("Number of extracted items:", extractedData.length);

  // Check for ID prefix
  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  if (!idPrefix) {
    alert("Please enter an ID prefix (e.g., 25S19) before exporting.");
    return;
  }

  // Filter out excluded items
  const includedData = extractedData.filter((item) => !item.excluded);
  console.log("Items to export (excluding unchecked):", includedData.length);
  console.log("Excluded items:", extractedData.length - includedData.length);

  if (includedData.length === 0) {
    alert(
      "No data to export! All items have been unchecked or no data was extracted."
    );
    return;
  }

  // Check if all included patients have ID suffixes
  const missingIds = includedData.filter(
    (item) => !item.patientInfo?.patientText
  );
  if (missingIds.length > 0) {
    alert(
      `Cannot export: ${missingIds.length} patient(s) are missing ID suffixes. Please enter ID suffixes for all selected patients.`
    );
    return;
  }

  // Use the PDF processor to generate proper CSV with PDF content
  if (pdfProcessor && includedData.length > 0) {
    console.log("Using PDF processor for CSV generation");
    const csvContent = pdfProcessor.generateCSVFromExtractedData(
      includedData,
      idPrefix
    );
    console.log(
      "Generated CSV content (first 500 chars):",
      csvContent.substring(0, 500)
    );
    downloadCSV(csvContent, "sante_medical_reports.csv");
  } else {
    console.log("Using fallback CSV generation");
    // Fallback to simple CSV
    const csvContent = convertToCSV(includedData);
    downloadCSV(csvContent, "sante_medical_reports.csv");
  }

  console.log(
    `✅ Exported ${includedData.length} items (${
      extractedData.length - includedData.length
    } excluded)`
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
  const blob = new Blob([content], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

// Auto-select functionality removed per user request

// Auto-pagination functionality removed per user request

// Navigation functionality removed - simplified to single page processing

// CSV Upload and Matching functionality
let csvPatientData = []; // Store uploaded CSV data

// Local Storage functions for CSV data
function getStoredCSVKey(idPrefix) {
  return `sante-csv-${idPrefix}`;
}

function storeCSVData(idPrefix, csvData) {
  const key = getStoredCSVKey(idPrefix);
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        data: csvData,
        timestamp: Date.now(),
        count: csvData.length,
      })
    );
    console.log(
      `💾 Stored CSV data for prefix ${idPrefix}: ${csvData.length} patients`
    );
  } catch (error) {
    console.error("Failed to store CSV data:", error);
  }
}

function getStoredCSVData(idPrefix) {
  const key = getStoredCSVKey(idPrefix);
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log(
        `📱 Retrieved stored CSV data for prefix ${idPrefix}: ${
          parsed.count
        } patients (stored ${new Date(parsed.timestamp).toLocaleString()})`
      );
      return parsed.data;
    }
  } catch (error) {
    console.error("Failed to retrieve CSV data:", error);
  }
  return null;
}

function clearStoredCSVData(idPrefix) {
  const key = getStoredCSVKey(idPrefix);
  localStorage.removeItem(key);
  console.log(`🗑️ Cleared stored CSV data for prefix ${idPrefix}`);
}

function tryLoadAnyStoredData() {
  console.log("🔍 Trying to load any available stored CSV data...");

  // First try the current ID prefix if it exists
  const idPrefixInput = document.getElementById("id-prefix");
  if (idPrefixInput && idPrefixInput.value.trim()) {
    checkForStoredCSVData();
    return;
  }

  // If no prefix is set, look for any stored CSV data in localStorage
  console.log(
    "🔍 No ID prefix set, scanning localStorage for any stored CSV data..."
  );

  const storedPrefixes = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("sante-csv-")) {
      const prefix = key.replace("sante-csv-", "");
      storedPrefixes.push(prefix);
    }
  }

  console.log(
    `Found ${storedPrefixes.length} stored prefixes:`,
    storedPrefixes
  );

  // If we found stored prefixes, try to load the most recently used one
  if (storedPrefixes.length > 0) {
    // Get the most recent one by checking timestamps
    let mostRecentPrefix = storedPrefixes[0];
    let mostRecentTime = 0;

    storedPrefixes.forEach((prefix) => {
      const data = getStoredCSVData(prefix);
      if (data) {
        const key = getStoredCSVKey(prefix);
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.timestamp > mostRecentTime) {
            mostRecentTime = parsed.timestamp;
            mostRecentPrefix = prefix;
          }
        }
      }
    });

    // Load the most recent data
    console.log(
      `📅 Loading most recent CSV data for prefix: ${mostRecentPrefix}`
    );
    if (idPrefixInput) {
      idPrefixInput.value = mostRecentPrefix;
    }
    checkForStoredCSVData();
  } else {
    console.log("❌ No stored CSV data found in localStorage");
  }
}

function checkForStoredCSVData() {
  console.log("🔍 Checking for stored CSV data...");

  const idPrefixInput = document.getElementById("id-prefix");
  if (!idPrefixInput) {
    console.log("❌ ID prefix input not found");
    return;
  }

  const idPrefix = idPrefixInput.value.trim();
  if (!idPrefix) {
    console.log("❌ No ID prefix entered");
    return;
  }

  console.log(`🔍 Looking for stored data for prefix: ${idPrefix}`);
  const storedData = getStoredCSVData(idPrefix);

  if (storedData && storedData.length > 0) {
    console.log(`✅ Found stored CSV data for ${idPrefix}, loading...`);
    csvPatientData = storedData;
    updateCSVButton(idPrefix, storedData.length, true);

    // Auto-match with stored data
    const matchResults = matchCSVToTablePatients(csvPatientData);
    displayMatchResults(matchResults);

    console.log(
      `🔄 Auto-loaded stored CSV data for ${idPrefix} and performed matching`
    );

    // Update download count after matching
    setTimeout(updateDownloadCount, 100);
  } else {
    console.log(`❌ No stored CSV data found for prefix: ${idPrefix}`);
  }
}

function updateCSVButton(idPrefix, patientCount, isStored) {
  const csvLabel = document.querySelector('label[for="csv-upload"]');
  if (!csvLabel) return;

  if (isStored) {
    // Show that we're using stored data with X button
    csvLabel.innerHTML = `📱 Using ID ${idPrefix} (${patientCount} patients) <span id="clear-csv-data" style="
  margin-left: 8px;
  background: #dc3545;
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  font-weight: bold;
" title="Clear stored CSV data">✕</span>`;
    csvLabel.style.background = "#17a2b8"; // Blue color for stored data
    csvLabel.style.borderColor = "#17a2b8";
    csvLabel.title = `Using stored CSV data for ID prefix ${idPrefix} with ${patientCount} patients. Click to replace with new CSV.`;

    // Add click handler for the X button
    setTimeout(() => {
      const clearButton = document.getElementById("clear-csv-data");
      if (clearButton) {
        clearButton.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();

          // Clear the stored data
          clearStoredCSVData(idPrefix);

          // Reset the interface
          csvPatientData = [];
          updateCSVButton("", 0, false);

          // Clear the ID prefix
          const idPrefixInput = document.getElementById("id-prefix");
          if (idPrefixInput) {
            idPrefixInput.value = "";
          }

          // Update export count
          updateExportCount();

          console.log(`🗑️ Cleared stored CSV data and reset interface`);
        };
      }
    }, 10);
  } else {
    // Reset to default
    csvLabel.innerHTML = "📁 Choose CSV File";
    csvLabel.style.background = "#28a745"; // Green color for new upload
    csvLabel.style.borderColor = "#28a745";
    csvLabel.title = "Click to upload a new CSV file";
  }
}

function autoDetectIdPrefix(csvPatients) {
  if (csvPatients.length === 0) return null;

  // Find the most common 5-character prefix from all IDs
  const prefixCounts = {};

  csvPatients.forEach((patient) => {
    if (patient.fullId && patient.fullId.length >= 5) {
      const prefix = patient.fullId.substring(0, 5);
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    }
  });

  // Find the most common prefix
  let mostCommonPrefix = "";
  let maxCount = 0;

  Object.entries(prefixCounts).forEach(([prefix, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonPrefix = prefix;
    }
  });

  if (mostCommonPrefix) {
    const idPrefixInput = document.getElementById("id-prefix");
    if (idPrefixInput) {
      idPrefixInput.value = mostCommonPrefix;
      console.log(
        `✅ Auto-detected ID prefix: ${mostCommonPrefix} (${maxCount}/${csvPatients.length} patients)`
      );
    }
    return mostCommonPrefix;
  }
  return null;
}

async function handleCSVUpload(event) {
  // Prevent any form submission or page reload
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const fileInput = document.getElementById("csv-upload");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a CSV file first.");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    alert("Please select a CSV file (.csv extension required).");
    return;
  }

  try {
    const csvContent = await readFileAsText(file);
    csvPatientData = parseCSV(csvContent);

    if (csvPatientData.length === 0) {
      alert("No patient data found in CSV file.");
      return;
    }

    // Auto-detect and set ID prefix from CSV data
    const detectedPrefix = autoDetectIdPrefix(csvPatientData);

    // Store CSV data in localStorage with the detected prefix
    if (detectedPrefix) {
      storeCSVData(detectedPrefix, csvPatientData);
      updateCSVButton(detectedPrefix, csvPatientData.length, false); // false = newly uploaded, not stored
    }

    // Perform matching
    const matchResults = matchCSVToTablePatients(csvPatientData);
    displayMatchResults(matchResults);

    // Update download count after matching
    setTimeout(updateDownloadCount, 100);
  } catch (error) {
    console.error("CSV upload error:", error);
    alert("Error reading CSV file: " + error.message);
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error("Failed to read file"));
    reader.readAsText(file, "UTF-8");
  });
}

function parseCSV(csvContent) {
  const lines = csvContent.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV must have at least a header and one data row");
  }

  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  console.log("CSV Header:", header);

  // Find column indexes
  let nameColumnIndex = -1;
  let idColumnIndex = -1;

  // Look for name column variations
  const nameVariations = [
    "nume și prenume",
    "nume si prenume",
    "nume",
    "name",
    "full name",
    "patient name",
  ];
  const idVariations = ["id", "patient id", "cod pacient", "identifier"];

  header.forEach((col, index) => {
    const colLower = col.toLowerCase();
    if (nameVariations.some((variation) => colLower.includes(variation))) {
      nameColumnIndex = index;
    }
    if (idVariations.some((variation) => colLower.includes(variation))) {
      idColumnIndex = index;
    }
  });

  if (nameColumnIndex === -1 || idColumnIndex === -1) {
    throw new Error(
      `Required columns not found. Expected columns like "Nume și prenume" and "ID". Found: ${header.join(
        ", "
      )}`
    );
  }

  console.log(
    `Using column ${nameColumnIndex} for names, column ${idColumnIndex} for IDs`
  );

  const patients = [];
  for (let i = 1; i < lines.length; i++) {
    const columns = parseCSVLine(lines[i]);
    if (columns.length > Math.max(nameColumnIndex, idColumnIndex)) {
      const name = columns[nameColumnIndex]?.trim();
      const id = columns[idColumnIndex]?.trim();

      if (name && id) {
        patients.push({
          name: name,
          fullId: id,
          originalLine: i + 1,
        });
      }
    }
  }

  console.log(`Parsed ${patients.length} patients from CSV`);
  return patients;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current.trim());
  return result;
}

function matchCSVToTablePatients(csvPatients) {
  const tableRows = document.querySelectorAll("#ctl00_contentMain_dgGrid tr");
  const tablePatients = [];

  // Extract patient names from table with better indexing
  tableRows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      const downloadLink = row.querySelector('a[id*="lnkView"]');
      if (downloadLink) {
        // Check patient status - only process if "Efectuat cu rezultate"
        const statusIcon = row.querySelector(".glyphicon");
        if (statusIcon) {
          const statusTitle = statusIcon.getAttribute("title");
          console.log(`Row ${rowIndex} status: ${statusTitle}`);

          // Skip patients with "In lucru" status
          if (statusTitle === "In lucru") {
            console.log(
              `⏭️ Skipping patient in row ${rowIndex} - status is "In lucru"`
            );
            return;
          }

          // Only process patients with "Efectuat cu rezultate" status
          if (statusTitle !== "Efectuat cu rezultate") {
            console.log(
              `⏭️ Skipping patient in row ${rowIndex} - status is not "Efectuat cu rezultate"`
            );
            return;
          }
        }

        const name = cells[1]?.textContent.trim(); // Nume column
        if (name) {
          // Create unique identifier for each table patient
          const tablePatientId = `${name}_${downloadLink.id}_${rowIndex}`;
          tablePatients.push({
            name: name,
            rowIndex: rowIndex,
            downloadLink: downloadLink,
            row: row,
            uniqueId: tablePatientId,
          });
          console.log(
            `✅ Added patient for processing: ${name} (status: Efectuat cu rezultate)`
          );
        }
      }
    }
  });

  console.log(`Found ${tablePatients.length} patients in table`);
  console.log(`Found ${csvPatients.length} patients in CSV`);

  const matches = [];
  const unmatched = [];
  const usedCSVPatients = new Set(); // Track which CSV patients are already used
  const processedTablePatients = new Set(); // Track which table patient names are already processed

  // Sort table patients by name to handle duplicates consistently
  const sortedTablePatients = [...tablePatients].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // For each table patient, find best available match in CSV
  sortedTablePatients.forEach((tablePatient) => {
    const tableName = normalizedName(tablePatient.name);

    // Skip if we've already processed a patient with this name
    if (processedTablePatients.has(tableName)) {
      console.log(
        `⏭️ SKIPPING DUPLICATE: "${tablePatient.name}" (already processed)`
      );
      return;
    }

    // Mark this patient name as processed
    processedTablePatients.add(tableName);

    console.log(
      `🔍 Processing table patient: "${tablePatient.name}" → normalized: "${tableName}"`
    );
    let bestMatch = null;
    let bestScore = 0;

    // Find best match among CSV patients (allow reuse for exact matches)
    csvPatients.forEach((csvPatient, csvIndex) => {
      const csvName = normalizedName(csvPatient.name);
      const score = calculateNameSimilarity(tableName, csvName);

      // For exact matches (score >= 0.95), allow reuse of CSV patients
      // For partial matches, check if CSV patient is already used
      const isExactMatch = score >= 0.95;
      const isAlreadyUsed = usedCSVPatients.has(csvIndex);

      if (isAlreadyUsed && !isExactMatch) {
        return; // Skip already used CSV patients for partial matches only
      }

      if (score > 0.5) {
        // Log potential matches
        console.log(
          `  📋 CSV "${
            csvPatient.name
          }" → normalized: "${csvName}" → score: ${score.toFixed(3)} ${
            isAlreadyUsed ? "(reused for exact match)" : ""
          }`
        );
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { patient: csvPatient, index: csvIndex };
      }
    });

    if (bestMatch && bestScore >= 0.666) {
      // 66.6% similarity threshold
      console.log(
        `✅ MATCH FOUND: "${tablePatient.name}" ↔ "${
          bestMatch.patient.name
        }" (score: ${bestScore.toFixed(3)})`
      );
      // Mark this CSV patient as used
      usedCSVPatients.add(bestMatch.index);

      // Extract ID suffix using first 5 characters as prefix
      let idSuffix = bestMatch.patient.fullId;

      if (bestMatch.patient.fullId.length > 5) {
        // First 5 chars = prefix, rest = suffix
        idSuffix = bestMatch.patient.fullId.substring(5);
      }

      console.log(
        `Table: ${tablePatient.name} → CSV: ${bestMatch.patient.name} → ID: ${bestMatch.patient.fullId} → Suffix: ${idSuffix}`
      );

      matches.push({
        tablePatient: tablePatient,
        csvPatient: bestMatch.patient,
        similarity: bestScore,
        idSuffix: idSuffix,
        matchQuality:
          bestScore >= 0.95 ? "exact" : bestScore >= 0.85 ? "good" : "partial",
      });
    } else {
      console.log(
        `❌ NO MATCH: "${tablePatient.name}" (best score: ${bestScore.toFixed(
          3
        )} with "${
          bestMatch?.patient?.name || "none"
        }" - below threshold 0.666)`
      );
      unmatched.push({
        tablePatient: tablePatient,
        bestMatch: bestMatch?.patient,
        bestScore: bestScore,
      });
    }
  });

  return { matches, unmatched };
}

function normalizedName(name) {
  return name
    .toLowerCase()
    .replace(/[ăâîșț]/g, (match) => {
      const map = { ă: "a", â: "a", î: "i", ș: "s", ț: "t" };
      return map[match] || match;
    })
    .replace(/[^a-z\s]/g, "") // Remove non-letter characters
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

function calculateNameSimilarity(name1, name2) {
  // Exact match
  if (name1 === name2) return 1.0;

  // Split into words and compare
  const words1 = name1.split(" ").filter((w) => w.length > 1);
  const words2 = name2.split(" ").filter((w) => w.length > 1);

  if (words1.length === 0 || words2.length === 0) return 0;

  let matchingWords = 0;
  const totalWords = Math.max(words1.length, words2.length);

  // Check each word from name1 against words in name2
  words1.forEach((word1) => {
    const bestWordMatch = Math.max(
      ...words2.map((word2) => calculateLevenshteinSimilarity(word1, word2))
    );
    if (bestWordMatch > 0.8) {
      // Word similarity threshold
      matchingWords++;
    }
  });

  return matchingWords / totalWords;
}

function calculateLevenshteinSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix = Array(len1 + 1)
    .fill()
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

function displayMatchResults(results) {
  const { matches, unmatched } = results;
  const resultsDiv = document.getElementById("match-results");

  if (!resultsDiv) {
    console.error("Match results div not found!");
    return;
  }

  console.log("Displaying match results:", results);

  // Apply matches to form
  let autoFilled = 0;
  matches.forEach((match) => {
    const linkId = match.tablePatient.downloadLink.id;
    console.log(
      `Processing match for link ID: ${linkId}, table patient: ${match.tablePatient.name}`
    );

    let patientInput = null;

    // Method 1: Try to find by data-link-id attribute (most reliable)
    console.log(`🔍 Looking for input with data-link-id="${linkId}"`);
    patientInput = document.querySelector(`input[data-link-id="${linkId}"]`);
    if (patientInput) {
      console.log(`✓ Found input by data-link-id: ${patientInput.id}`);
    } else {
      console.log(`❌ No input found with data-link-id="${linkId}"`);
    }

    // Method 1b: Try to find by link-based ID pattern as fallback
    if (!patientInput) {
      let inputId = linkId.replace("lnkView", "patient-text-");
      console.log(`🔍 Trying link pattern replacement: ${linkId} → ${inputId}`);
      patientInput = document.getElementById(inputId);
      if (patientInput) {
        console.log(`✓ Found input by link pattern: ${inputId}`);
      } else {
        console.log(`❌ No input found with ID: ${inputId}`);
      }
    }

    // Method 1c: If not found, try to find by extracting the numeric part and using it as index
    if (!patientInput) {
      const linkMatch = linkId.match(/\d+/);
      if (linkMatch) {
        const numericPart = linkMatch[0];
        const inputId = `patient-text-${numericPart}`;
        patientInput = document.getElementById(inputId);
        if (patientInput) {
          console.log(`✓ Found input by numeric extraction: ${inputId}`);
        }
      }
    }

    // Method 2: Search in the same table row for any text input
    if (!patientInput) {
      console.log(`🔍 Searching for text inputs in table row...`);
      const row = match.tablePatient.row;
      const rowInputs = row.querySelectorAll('input[type="text"]');
      console.log(
        `Found ${rowInputs.length} text inputs in row:`,
        Array.from(rowInputs).map((input) => input.id || "no-id")
      );
      if (rowInputs.length > 0) {
        patientInput = rowInputs[0]; // Take the first text input in the row
        console.log(`✓ Found input in same row: ${patientInput.id || "no-id"}`);
      } else {
        console.log(`❌ No text inputs found in row`);
      }
    }

    // Method 3: Search by proximity to the download link
    if (!patientInput) {
      const linkElement = document.getElementById(linkId);
      if (linkElement) {
        // Look in parent containers
        let parent = linkElement.parentElement;
        for (let i = 0; i < 3 && parent && !patientInput; i++) {
          const parentInputs = parent.querySelectorAll('input[type="text"]');
          if (parentInputs.length > 0) {
            patientInput = parentInputs[0];
            console.log(
              `✓ Found input in parent level ${i + 1}: ${
                patientInput.id || "no-id"
              }`
            );
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    console.log(
      `Final result for ${
        match.tablePatient.name
      }: input found = ${!!patientInput}`
    );

    if (patientInput) {
      patientInput.value = match.idSuffix;
      patientInput.style.backgroundColor =
        match.matchQuality === "exact"
          ? "#d4edda"
          : match.matchQuality === "good"
          ? "#fff3cd"
          : "#f8d7da";
      autoFilled++;
      const matchTypeLog =
        match.matchQuality === "exact"
          ? "✅ EXACT MATCH"
          : match.matchQuality === "good"
          ? "🔶 GOOD MATCH (partial)"
          : "⚠️ FAIR MATCH (partial)";

      console.log(
        `${matchTypeLog}: Table "${match.tablePatient.name}" ↔ CSV "${match.csvPatient.name}" (ID: ${match.csvPatient.fullId}) → filled ${match.idSuffix}`
      );

      // Update the table row to show matched CSV name
      const nameCell = match.tablePatient.row.cells[1]; // Nume column
      if (nameCell && !nameCell.querySelector(".csv-match")) {
        const matchIndicator = document.createElement("div");
        matchIndicator.className = "csv-match";
        matchIndicator.style.cssText = `
      font-size: 11px;
      color: #666;
      font-style: italic;
      margin-top: 2px;
    `;
        const csvInfo =
          match.matchQuality === "exact"
            ? `(CSV: ${match.csvPatient.name})`
            : `(CSV: ${match.csvPatient.name} | ID: ${match.csvPatient.fullId})`;
        matchIndicator.textContent = csvInfo;
        nameCell.appendChild(matchIndicator);
      }

      // Auto-trigger batch processing disabled - user will manually trigger via "Download All" button
    } else {
      console.error(`❌ Input not found for link: ${linkId}`);
      // List all available patient text inputs for debugging
      const allInputs = document.querySelectorAll('input[id*="patient-text-"]');
      console.log(
        `Available patient inputs:`,
        Array.from(allInputs).map((inp) => inp.id)
      );
    }
  });

  // Hide the results div completely - no summary needed
  resultsDiv.style.display = "none";

  // Add a timeout to check if the element is still there
  setTimeout(() => {
    const stillThere = document.getElementById("match-results");
    if (!stillThere) {
      console.error("⚠️ Match results div disappeared after timeout!");
    } else {
      console.log("✅ Match results div still present after timeout");
    }
  }, 2000);

  console.log(
    `✅ CSV matching complete: ${matches.length} matched, ${unmatched.length} require manual attention`
  );
}

function findBatchButtonForInput(input) {
  // The batch button should be in the same container as the input
  const container = input.parentElement;
  if (container) {
    const button = container.querySelector("button");
    if (button) {
      console.log(`Found batch button for input ${input.id}`);
      return button;
    }
  }

  // Alternative: search in the same table cell
  const cell = input.closest("td");
  if (cell) {
    const button = cell.querySelector("button");
    if (button) {
      console.log(`Found batch button in same cell for input ${input.id}`);
      return button;
    }
  }

  console.error(`❌ Batch button not found for input ${input.id}`);
  return null;
}
