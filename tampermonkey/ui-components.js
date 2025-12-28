// UI Components v1.0.0
// UI modification and display functions

function hideCharismaFooter() {
  const footerDivs = document.querySelectorAll(
    'div[style*="position: fixed"][style*="bottom: 0"]'
  );
  footerDivs.forEach((div) => {
    const link = div.querySelector('a[href*="charisma"]');
    if (link && link.textContent.includes("Charisma Medical Software")) {
      div.style.display = "none";
      console.log("✅ Hidden Charisma footer");
    }
  });
}

function makeFiltersCollapsible() {
  const formGroups = document.querySelectorAll(
    ".form-horizontal .row.form-group"
  );

  if (formGroups.length === 0) {
    console.warn("⚠️ No form-group rows found");
    return;
  }

  const formHorizontal = document.querySelector(".form-horizontal");
  if (formHorizontal) {
    const hrRows = formHorizontal.querySelectorAll(".row");
    hrRows.forEach((row) => {
      const hr = row.querySelector("hr");
      if (hr) {
        row.style.display = "none";
      }
    });
  }

  const complexResultsLabel = document.getElementById(
    "ctl00_contentMain_lblComplexResults"
  );
  if (complexResultsLabel) {
    complexResultsLabel.style.display = "none";
  }

  const logoContainer = document.querySelector(
    'div[style*="padding-bottom: 5%"]'
  );
  if (logoContainer) {
    const logoImage = logoContainer.querySelector('img[src*="Sigla.png"]');
    if (logoImage) {
      logoContainer.style.paddingBottom = "20px";
      logoImage.style.height = "100px";
      logoImage.style.width = "auto";
      const customLogoUrl = "https://i.ibb.co/whDSh2sm/logo-sante-teamm2.jpg";
      if (customLogoUrl !== "PLACEHOLDER_LOGO_URL_HERE") {
        logoImage.src = customLogoUrl;
      }
    }
  }

  const collapseWrapper = document.createElement("div");
  collapseWrapper.id = "filter-collapse-wrapper";
  collapseWrapper.style.cssText = `
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out;
    width: 100%;
    padding: 0 15px;
    box-sizing: border-box;
  `;

  const toggleButton = document.createElement("input");
  toggleButton.type = "submit";
  toggleButton.id = "filter-toggle-btn";
  toggleButton.value = "▼ Filtre";
  toggleButton.className = "btn btn-default col-filtersmr";
  toggleButton.tabIndex = 8;
  toggleButton.style.float = "right";
  toggleButton.style.margin = "5px 0 10px";

  let isExpanded = false;
  toggleButton.onclick = (e) => {
    e.preventDefault();
    isExpanded = !isExpanded;
    if (isExpanded) {
      collapseWrapper.style.maxHeight = collapseWrapper.scrollHeight + "px";
      toggleButton.value = "▲ Filtre";
    } else {
      collapseWrapper.style.maxHeight = "0";
      toggleButton.value = "▼ Filtre";
    }
  };

  const quickFilterButtons = document.querySelector(
    '.form-horizontal div > input[id*="btnFilter"]'
  );
  if (quickFilterButtons && quickFilterButtons.parentElement) {
    quickFilterButtons.parentElement.appendChild(toggleButton);
  }

  formGroups.forEach((group) => {
    collapseWrapper.appendChild(group);
  });

  const firstFormGroup = formGroups[0];
  if (firstFormGroup.parentNode) {
    const parent = formHorizontal || firstFormGroup.parentNode.parentNode;
    if (parent) {
      const quickFilterRow = document.querySelector(
        '.form-horizontal .row:has(input[id*="btnFilter"])'
      );
      if (quickFilterRow && quickFilterRow.nextSibling) {
        parent.insertBefore(collapseWrapper, quickFilterRow.nextSibling);
      } else {
        parent.appendChild(collapseWrapper);
      }
    }
  }

  const hasFilledInputs = Array.from(
    collapseWrapper.querySelectorAll('input[type="text"], select')
  ).some((input) => {
    if (input.tagName === "SELECT") {
      return input.value && input.value !== "-1" && input.value !== "";
    }
    return input.value && input.value.trim() !== "";
  });

  if (hasFilledInputs) {
    isExpanded = true;
    collapseWrapper.style.maxHeight = collapseWrapper.scrollHeight + "px";
    toggleButton.value = "▲ Hide Filters";
    console.log("✅ Filters expanded by default (inputs have values)");
  }

  console.log("✅ Made filters collapsible");
}

function addTestResultsColumn() {
  const table = document.getElementById("ctl00_contentMain_dgGrid");
  if (!table) {
    console.warn("Table not found for adding test results column");
    return;
  }

  console.log("📊 Adding test results column to table");
  hideUnwantedColumns(table);

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

  if (headerRow) {
    const batchHeaderCell = document.createElement("th");
    batchHeaderCell.textContent = "Acțiuni";
    batchHeaderCell.style.cssText = `
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      padding: 8px;
      font-weight: bold;
      width: 80px;
    `;
    headerRow.appendChild(batchHeaderCell);

    const testResultsHeaderCell = document.createElement("th");
    testResultsHeaderCell.textContent = "Rezultate";
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
    const paginationElement = row.querySelector(".pagination");
    const hasColspan = row.querySelector("td[colspan]");
    const hasPaginationLinks = row.querySelector('a[href*="doPostBack"]');
    const cellText = row.textContent.trim();
    const isPaginationRow =
      paginationElement ||
      row.closest("tfoot") ||
      (hasColspan && hasPaginationLinks) ||
      (hasColspan && /^\d+.*\d+$/.test(cellText));

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

    const batchCell = document.createElement("td");
    batchCell.id = `batch-cell-${index}`;
    batchCell.style.cssText = `
      border: 1px solid #dee2e6;
      padding: 8px;
      text-align: center;
      white-space: nowrap;
    `;

    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 5px;
      justify-content: center;
    `;

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

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.id = `patient-text-${index}`;
    textInput.setAttribute("data-link-id", downloadLink.id);
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

  const headerRow = rows[0];
  const headerCells = headerRow.querySelectorAll("th, td");
  const columnsToHide = [];

  headerCells.forEach((cell, index) => {
    const cellText = cell.textContent.trim().toLowerCase();
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

  if (columnsToHide.length > 0) {
    rows.forEach((row) => {
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
  const downloadLinks = document.querySelectorAll(
    '#ctl00_contentMain_dgGrid a[id*="lnkView"]'
  );
  return Array.from(downloadLinks);
}

function injectBatchButtons(downloadElements) {
  console.log("Batch buttons are now integrated into table columns");
}

function createSingleProcessButton() {
  const table = document.getElementById("ctl00_contentMain_dgGrid");
  if (!table) return;

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = `
    margin: 0px 0;
    padding: 0px 12px;
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
      <button type="button" id="sante-analyze-page" style="
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
        🔍 Analizează (<span id="analyze-count">0</span>)
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
        📥 Import Teamm (<span id="exported-count">0</span>)
      </button>
    </div>
    <div id="analysis-progress" style="display: none; margin-top: 8px; text-align: center; font-size: 12px; color: #007cba; font-weight: bold;">
      🔄 Analyzing page... (<span id="analysis-completed">0</span>/<span id="analysis-total">0</span> complete)
    </div>
    <div id="match-results" style="display: none;"></div>
  `;

  table.parentNode.insertBefore(buttonContainer, table);

  const exportBtn = document.getElementById("sante-process-export");
  const analyzeBtn = document.getElementById("sante-analyze-page");
  if (exportBtn) exportBtn.onclick = window.exportData;
  if (analyzeBtn) analyzeBtn.onclick = window.analyzeCurrentPage;

  const csvFileInput = document.getElementById("csv-upload");
  csvFileInput.onchange = function (event) {
    if (this.files && this.files[0]) {
      console.log("CSV file selected, auto-processing...");
      window.handleCSVUpload(event);
    }
  };
}

function displayTestResults(testResultCell, extractedData, patientKey = null) {
  if (!testResultCell) return;

  const testResults = extractedData.structuredData?.testResults || {};
  const exportedTests = extractedData.exportedTests || {};
  const totalTests = Object.keys(testResults).length;
  const exportedCount = Object.keys(testResults).filter((k) => exportedTests[k]).length;

  const showRefetch =
    extractedData.statusChangedSinceImport === true ||
    extractedData.importedStatus === "In lucru" ||
    extractedData.importedStatus === "Rezultate partiale" ||
    extractedData.needsReexport === true;

  let statusChangeBadge = "";
  if (extractedData.statusChangedSinceImport) {
    statusChangeBadge = `
      <div style="
        display: block;
        background: #fff3cd;
        color: #856404;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 6px;
        border: 1px solid #ffeeba;
      ">
        🔔 Status changed! Results ready to fetch
      </div>
    `;
  }

  let refetchButton = "";
  if (showRefetch && patientKey) {
    const buttonLabel = extractedData.statusChangedSinceImport
      ? "🔄 Refetch Results"
      : extractedData.needsReexport
      ? "🔄 Refetch (new tests available)"
      : "🔄 Refetch";
    refetchButton = `
      <button
        class="refetch-btn"
        data-patient-key="${patientKey}"
        style="
          background: #17a2b8;
          color: white;
          border: none;
          padding: 4px 10px;
          border-radius: 3px;
          font-size: 11px;
          cursor: pointer;
          margin-bottom: 6px;
          display: block;
        "
        title="Re-download PDF and update test results"
      >
        ${buttonLabel}
      </button>
    `;
  }

  let exportedBadge = "";
  if (exportedCount > 0) {
    const allExported = exportedCount === totalTests;
    const exportDate = extractedData.exportedAt
      ? new Date(extractedData.exportedAt).toLocaleString("ro-RO", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Unknown";

    if (allExported) {
      exportedBadge = `
        <div style="
          display: inline-block;
          background: #28a745;
          color: white;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          margin-bottom: 4px;
          cursor: help;
        " title="All ${totalTests} tests exported on: ${exportDate}">
          ✓ Exported
        </div>
      `;
    } else {
      exportedBadge = `
        <div style="
          display: inline-block;
          background: #ffc107;
          color: #212529;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          margin-bottom: 4px;
          cursor: help;
        " title="${exportedCount}/${totalTests} tests exported. ${totalTests - exportedCount} test(s) pending export.">
          ⚡ ${exportedCount}/${totalTests} Exported
        </div>
      `;
    }
  }

  let needsReexportBadge = "";
  if (extractedData.needsReexport && !extractedData.statusChangedSinceImport) {
    needsReexportBadge = `
      <div style="
        display: inline-block;
        background: #17a2b8;
        color: white;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 4px;
        margin-left: 4px;
      ">
        ⚡ New tests
      </div>
    `;
  }

  if (extractedData.error) {
    testResultCell.innerHTML =
      statusChangeBadge +
      refetchButton +
      exportedBadge +
      `<span style="color: #dc3545;">❌ Error: ${extractedData.error}</span>`;
    return;
  }

  const knownItems = Object.entries(testResults).map(([key, testData]) => ({
    key,
    value: testData.value || "N/A",
    isExported: !!exportedTests[key],
  }));

  const testCount = knownItems.length;

  if (testCount === 0) {
    testResultCell.innerHTML =
      statusChangeBadge +
      refetchButton +
      `<span style="color: #ffc107;">⚠️ No tests found</span>`;
    return;
  }

  let testsHtml = `<div style="color: #28a745; font-weight: bold;">${testCount} analiză(e):</div>`;

  const ORDER = window.TEST_DEFINITIONS.map((t) => t.key);
  const DISPLAY = Object.fromEntries(window.TEST_DEFINITIONS.map((t) => [t.key, t.name]));

  knownItems.sort((a, b) => {
    const ai = ORDER.indexOf(a.key);
    const bi = ORDER.indexOf(b.key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  knownItems.forEach(({ key, value, isExported }) => {
    const label = DISPLAY[key] || key;
    const exportIcon = isExported ? "✓" : "○";
    const style = isExported ? "color: #6c757d;" : "color: #000; font-weight: bold;";
    const tooltip = isExported ? "Already exported" : "Not yet exported";
    testsHtml += `<div style="margin: 2px 0; ${style}" title="${tooltip}">
      <span style="font-size: 10px;">${exportIcon}</span> ${label}: <strong>${value}</strong>
    </div>`;
  });

  testResultCell.innerHTML =
    statusChangeBadge + refetchButton + exportedBadge + needsReexportBadge + testsHtml;
  testResultCell.style.color = "#000";
  testResultCell.title = `Full test results for this patient (${testCount} tests).`;
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

  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  const patientName = extractedData.patientInfo?.nume;
  const patientKey = patientName ? window.getPatientKey(idPrefix, patientName) : null;

  displayTestResults(testResultCell, extractedData, patientKey);
}

function showWarningToast(title, message, persistent = false) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #ff9800;
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10001;
    max-width: 400px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
    font-size: 13px;
    animation: slideIn 0.3s ease-out;
  `;
  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
    <div style="font-size: 12px;">${message}</div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    if (persistent) return;
    toast.style.transition = "opacity 0.3s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 8000);
}

function showSuccessToast(title, message) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10001;
    max-width: 400px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
    font-size: 13px;
    animation: slideIn 0.3s ease-out;
  `;
  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
    <div style="font-size: 12px;">${message}</div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.3s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Export to window
window.hideCharismaFooter = hideCharismaFooter;
window.makeFiltersCollapsible = makeFiltersCollapsible;
window.addTestResultsColumn = addTestResultsColumn;
window.hideUnwantedColumns = hideUnwantedColumns;
window.findDownloadElements = findDownloadElements;
window.injectBatchButtons = injectBatchButtons;
window.createSingleProcessButton = createSingleProcessButton;
window.displayTestResults = displayTestResults;
window.updateTestResultsColumn = updateTestResultsColumn;
window.showWarningToast = showWarningToast;
window.showSuccessToast = showSuccessToast;
