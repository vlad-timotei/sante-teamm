// UI Components v1.0.0
// UI modification and display functions

function hideCharismaFooter() {
  const footerDivs = document.querySelectorAll(
    'div[style*="position: fixed"][style*="bottom: 0"]',
  );
  footerDivs.forEach((div) => {
    const link = div.querySelector('a[href*="charisma"]');
    if (link && link.textContent.includes("Charisma Medical Software")) {
      div.style.display = "none";
      console.log("✅ Hidden Charisma footer");
    }
  });

  // Move welcome/logout row to bottom of page
  const welcomeLabel = document.getElementById("ctl00_contentMain_lblWelcome");
  if (welcomeLabel) {
    const welcomeRow = welcomeLabel.closest(".row");
    if (welcomeRow) {
      const welcomeItems = welcomeRow.querySelectorAll(".col-md-3, .col-maria, .col-md-1, .col-md-2");
      if (welcomeItems.length > 0) {
        const bottomBar = document.createElement("div");
        bottomBar.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 15px;
          margin-top: 20px;
          border-top: 1px solid #dee2e6;
          font-size: 12px;
          color: #666;
        `;
        welcomeItems.forEach((el) => {
          el.style.cssText = "";
          bottomBar.appendChild(el);
        });

        const spacer = document.createElement("div");
        spacer.style.flex = "1";
        bottomBar.appendChild(spacer);

        const refreshLink = document.createElement("a");
        refreshLink.href = "#";
        refreshLink.textContent = "🔄 Reîncarcă pacienți";
        refreshLink.style.cssText = `
          color: #17a2b8; text-decoration: none; font-size: 12px;
          font-weight: bold; white-space: nowrap; cursor: pointer;
        `;
        refreshLink.onclick = async (e) => {
          e.preventDefault();
          await GM.deleteValue('sante-patients-cache');
          const currentPrefix = document.getElementById("id-prefix")?.value;
          if (currentPrefix) await window.fetchAndApplyPatientIds(currentPrefix);
        };
        bottomBar.appendChild(refreshLink);

        const dashLink = document.createElement("a");
        dashLink.href = "#";
        dashLink.textContent = "⚙️ Administrare Teste";
        dashLink.style.cssText = `
          color: #17a2b8; text-decoration: none; font-size: 12px;
          font-weight: bold; white-space: nowrap; cursor: pointer;
        `;
        dashLink.onclick = (e) => { e.preventDefault(); window.openTestAdmin(); };
        bottomBar.appendChild(dashLink);

        document.querySelector(".form-horizontal")?.appendChild(bottomBar);
      }
    }
  }
}

function makeFiltersCollapsible() {
  const formGroups = document.querySelectorAll(
    ".form-horizontal .row.form-group",
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
    "ctl00_contentMain_lblComplexResults",
  );
  if (complexResultsLabel) {
    complexResultsLabel.style.display = "none";
  }

  const logoContainer = document.querySelector(
    'div[style*="padding-bottom: 5%"]',
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
    '.form-horizontal div > input[id*="btnFilter"]',
  );
  if (quickFilterButtons && quickFilterButtons.parentElement) {
    const filterParent = quickFilterButtons.parentElement;

    // Add spacing between quick filter buttons
    filterParent.querySelectorAll('input.col-filtersmr').forEach((btn) => {
      btn.style.marginRight = "8px";
    });

    // Create a clean controls row below the quick filters
    const controlsRow = document.createElement("div");
    controlsRow.style.cssText = `
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin: 6px 0 10px;
    `;

    toggleButton.style.float = "none";
    toggleButton.style.margin = "0";

    const sessionSelect = document.createElement("select");
    sessionSelect.id = "id-prefix";
    sessionSelect.style.cssText = `
      background: #17a2b8;
      color: white;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      border: 2px solid #17a2b8;
      cursor: pointer;
      min-width: 119px;
      height: 33px;
    `;
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "-- Sejur --";
    sessionSelect.appendChild(defaultOpt);

    controlsRow.appendChild(toggleButton);
    controlsRow.appendChild(sessionSelect);
    filterParent.appendChild(controlsRow);
  }

  formGroups.forEach((group) => {
    collapseWrapper.appendChild(group);
  });

  const firstFormGroup = formGroups[0];
  if (firstFormGroup.parentNode) {
    const parent = formHorizontal || firstFormGroup.parentNode.parentNode;
    if (parent) {
      const quickFilterRow = document.querySelector(
        '.form-horizontal .row:has(input[id*="btnFilter"])',
      );
      if (quickFilterRow && quickFilterRow.nextSibling) {
        parent.insertBefore(collapseWrapper, quickFilterRow.nextSibling);
      } else {
        parent.appendChild(collapseWrapper);
      }
    }
  }

  const hasFilledInputs = Array.from(
    collapseWrapper.querySelectorAll('input[type="text"], select'),
  ).some((input) => {
    if (input.tagName === "SELECT") {
      return input.value && input.value !== "-1" && input.value !== "";
    }
    return input.value && input.value.trim() !== "";
  });

  if (hasFilledInputs) {
    isExpanded = true;
    collapseWrapper.style.maxHeight = collapseWrapper.scrollHeight + "px";
    toggleButton.value = "▲ Filtre";
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
        `📋 Row ${index} is header row (has ${thElements.length} th elements)`,
      );
    } else if (tdElements.length > 0) {
      dataRows.push(row);
      console.log(
        `📋 Row ${index} is data row (has ${tdElements.length} td elements)`,
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
      `✅ Added batch processing and test results cells ${index} for link ${downloadLink.id}`,
    );
  });

  console.log("📊 Finished adding test results column");
}

function hideUnwantedColumns(table) {
  console.log(
    "🔧 Hiding unwanted columns (Nr Doc, Cod Bare, and Unitate recoltare)",
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
    '#ctl00_contentMain_dgGrid a[id*="lnkView"]',
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
    margin: 8px 0;
    padding: 4px 12px;
  `;

  buttonContainer.innerHTML = `
    <div style="display: flex; gap: 12px; align-items: center; justify-content: center;">
      <button type="button" id="sante-analyze-page" style="
        background: linear-gradient(135deg, #e8913a, #d4802e);
        color: white;
        border: none;
        padding: 10px 24px;
        border-radius: 20px;
        cursor: not-allowed;
        font-size: 14px;
        font-weight: bold;
        opacity: 0.5;
        display: inline-block;
        text-align: center;
        transition: all 0.3s;
        margin-bottom: 8px;
        box-shadow: 0 2px 8px rgba(232, 145, 58, 0.3);
        letter-spacing: 0.3px;
      " disabled>
        🔍 Analizează (<span id="analyze-count">0</span>)
      </button>
      <button type="button" id="sante-process-export" style="
        background: linear-gradient(135deg, #17a2b8, #1289a0);
        color: white;
        border: none;
        padding: 10px 24px;
        border-radius: 20px;
        cursor: not-allowed;
        font-size: 14px;
        font-weight: bold;
        opacity: 0.5;
        display: inline-block;
        text-align: center;
        transition: all 0.3s;
        margin-bottom: 8px;
        box-shadow: 0 2px 8px rgba(23, 162, 184, 0.3);
        letter-spacing: 0.3px;
      " disabled>
        📥 Importă în Teamm (<span id="exported-count">0</span>)
      </button>
    </div>
    <div id="analysis-progress" style="display: none; margin-top: 8px; text-align: center; font-size: 12px; color: #007cba; font-weight: bold;">
      🔄 Se analizează pagina... (<span id="analysis-completed">0</span>/<span id="analysis-total">0</span> finalizate)
    </div>
    <div id="match-results" style="display: none;"></div>
  `;

  table.parentNode.insertBefore(buttonContainer, table);

  const exportBtn = document.getElementById("sante-process-export");
  const analyzeBtn = document.getElementById("sante-analyze-page");
  if (exportBtn) exportBtn.onclick = window.exportData;
  if (analyzeBtn) analyzeBtn.onclick = window.analyzeCurrentPage;
}

function displayTestResults(testResultCell, extractedData, patientKey = null) {
  if (!testResultCell) return;

  const testResults = extractedData.structuredData?.testResults || {};
  const exportedTests = extractedData.exportedTests || {};
  const totalTests = Object.keys(testResults).length;
  const exportedCount = Object.keys(testResults).filter(
    (k) => exportedTests[k],
  ).length;

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
        🔔 Statusul s-a schimbat! Rezultate noi disponibile!
      </div>
    `;
  }

  let refetchButton = "";
  if (patientKey) {
    const buttonLabel = extractedData.statusChangedSinceImport
      ? "🔄 Reîncarcă rezultate"
      : extractedData.needsReexport
        ? "🔄 Reîncarcă (analize noi disponibile)"
        : "🔄 Reîncarcă";
    const statusChanged = extractedData.statusChangedSinceImport === true;
    refetchButton = `
      <button
        class="refetch-btn"
        data-patient-key="${patientKey}"
        style="
          background: #17a2b8;
          color: white;
          border: ${statusChanged ? "2px solid #dc3545" : "none"};
          padding: 4px 10px;
          border-radius: 3px;
          font-size: 11px;
          cursor: pointer;
          margin-bottom: 6px;
          display: block;
        "
        title="Redescarcă PDF-ul și actualizează rezultatele"
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
        <div class="exported-badge"
          data-patient-key="${patientKey || ""}"
          style="
          display: inline-block;
          background: #28a745;
          color: white;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          margin-bottom: 4px;
          cursor: context-menu;
        " title="Toate cele ${totalTests} analize exportate la: ${exportDate}. Click dreapta pentru a reimporta.">
          ✓ Exportat
        </div>
      `;
    } else {
      exportedBadge = `
        <div class="exported-badge"
          data-patient-key="${patientKey || ""}"
          style="
          display: inline-block;
          background: #ffc107;
          color: #212529;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          margin-bottom: 4px;
          cursor: context-menu;
        " title="${exportedCount}/${totalTests} analize exportate. ${totalTests - exportedCount} analiză(e) în așteptare. Click dreapta pentru a reimporta.">
          ⚡ ${exportedCount}/${totalTests} Exportate
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
        ⚡ Analize noi
      </div>
    `;
  }

  if (extractedData.error) {
    testResultCell.innerHTML =
      statusChangeBadge +
      refetchButton +
      exportedBadge +
      `<span style="color: #dc3545;">❌ Eroare: ${extractedData.error}</span>`;
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
      `<span style="color: #ffc107;">⚠️ Nu s-au găsit analize</span>`;
    return;
  }

  let testsHtml = `<div style="color: #28a745; font-weight: bold;">${testCount} analiză(e):</div>`;

  const ORDER = window.TEST_DEFINITIONS.map((t) => t.key);
  const DISPLAY = Object.fromEntries(
    window.TEST_DEFINITIONS.map((t) => [t.key, t.name]),
  );

  knownItems.sort((a, b) => {
    const ai = ORDER.indexOf(a.key);
    const bi = ORDER.indexOf(b.key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  knownItems.forEach(({ key, value, isExported }) => {
    const label = DISPLAY[key] || key;
    const exportIcon = isExported ? "✓" : "○";
    const style = isExported
      ? "color: #6c757d;"
      : "color: #000; font-weight: bold;";
    const tooltip = isExported ? "Deja exportat" : "Neexportat încă";
    testsHtml += `<div style="margin: 2px 0; ${style}" title="${tooltip}">
      <span style="font-size: 10px;">${exportIcon}</span> ${label}: <strong>${value}</strong>
    </div>`;
  });

  const remainingTests = extractedData.structuredData?.remainingTests || {};
  const remainingEntries = Object.entries(remainingTests);
  if (remainingEntries.length > 0) {
    testsHtml += `<div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #ccc; color: #888; font-size: 11px; font-weight: bold;">Alte teste:</div>`;
    remainingEntries.forEach(([name, testData]) => {
      testsHtml += `<div style="margin: 1px 0; color: #999; font-size: 11px;">
        ${name}: <strong>${testData.value || "N/A"}</strong>
      </div>`;
    });
  }

  testResultCell.innerHTML =
    statusChangeBadge +
    refetchButton +
    exportedBadge +
    needsReexportBadge +
    testsHtml;
  testResultCell.style.color = "#000";
  const totalWithRemaining = testCount + remainingEntries.length;
  testResultCell.title = `Rezultatele complete pentru acest pacient (${testCount} analize exportabile, ${remainingEntries.length} alte teste).`;
}

function updateTestResultsColumn(elementIndex, extractedData) {
  const testResultCell = document.getElementById(
    `test-results-${elementIndex}`,
  );

  if (!testResultCell) {
    console.warn(
      `Test result cell not found for index ${elementIndex}. Available cells:`,
      Array.from(document.querySelectorAll('[id^="test-results-"]')).map(
        (cell) => cell.id,
      ),
    );
    return;
  }

  console.log(
    `%c📊 UPDATING TEST RESULTS for index ${elementIndex}`,
    "color: blue; font-weight: bold",
  );

  const idPrefix = document.getElementById("id-prefix")?.value.trim();
  const patientName = extractedData.patientInfo?.nume;
  const patientKey = patientName
    ? window.getPatientKey(idPrefix, patientName)
    : null;

  displayTestResults(testResultCell, extractedData, patientKey);
}

function showWarningToast(title, message, persistent = false) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 50px;
    right: 12px;
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
    bottom: 50px;
    right: 12px;
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

// Escape a string for safe interpolation into innerHTML. Lab values may
// contain comparator symbols like "<0.01" that would otherwise be parsed as
// markup.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Right-click menu shown on the "✓ Exportat" badge. Single action that opens
// the re-import picker for that patient.
function showReimportContextMenu(x, y, patientKey) {
  document.getElementById("reimport-context-menu")?.remove();

  const menu = document.createElement("div");
  menu.id = "reimport-context-menu";
  menu.style.cssText = `
    position: fixed; top: ${y}px; left: ${x}px;
    background: white; border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    z-index: 100010; overflow: hidden; min-width: 170px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const makeItem = (text, onClick) => {
    const item = document.createElement("button");
    item.textContent = text;
    item.style.cssText = `
      display: block; width: 100%; text-align: left;
      padding: 10px 16px; border: none; background: white;
      font-size: 13px; font-weight: 600; color: #17a2b8; cursor: pointer;
    `;
    item.onmouseenter = () => (item.style.background = "#f1f3f5");
    item.onmouseleave = () => (item.style.background = "white");
    item.onclick = () => {
      menu.remove();
      onClick();
    };
    return item;
  };

  menu.appendChild(
    makeItem("🔄 Reîncarcă…", () => openReimportModal(patientKey))
  );
  menu.appendChild(
    makeItem("🔄 Reîncarcă tot", () => reimportAllForPatient(patientKey))
  );

  document.body.appendChild(menu);

  // Keep the menu on screen if opened near the right/bottom edge.
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`;
  }

  const close = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("click", close, true);
      document.removeEventListener("contextmenu", close, true);
    }
  };
  setTimeout(() => {
    document.addEventListener("click", close, true);
    document.addEventListener("contextmenu", close, true);
  }, 0);
}

// Modal to pick which of a patient's already-exported analyses should be
// re-imported. Selecting an analysis simply un-marks it as exported so it
// re-enters the batch queue — the user then presses the blue "Export" button
// at the top to re-import everything pending in one go.
async function openReimportModal(patientKey) {
  if (!patientKey) {
    window.showWarningToast(
      "⚠️ Nu pot reimporta",
      "Selectează mai întâi o serie (prefix ID)."
    );
    return;
  }

  document.getElementById("reimport-overlay")?.remove();

  const queue = await window.loadQueueFromDB();
  const patient = window.findPatientByKey(queue, patientKey);
  if (!patient) {
    window.showWarningToast(
      "⚠️ Pacient negăsit",
      "Nu am găsit datele pacientului pentru reimport."
    );
    return;
  }

  const testResults = patient.structuredData?.testResults || {};
  const exportedTests = patient.exportedTests || {};
  const DISPLAY = Object.fromEntries(
    window.TEST_DEFINITIONS.map((t) => [t.key, t.name])
  );
  const ORDER = window.TEST_DEFINITIONS.map((t) => t.key);
  const keys = Object.keys(testResults).sort((a, b) => {
    const ai = ORDER.indexOf(a);
    const bi = ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  if (keys.length === 0) {
    window.showWarningToast(
      "⚠️ Fără analize",
      "Acest pacient nu are analize de reimportat."
    );
    return;
  }

  const patientName = patient.patientInfo?.nume || "Pacient";

  const overlay = document.createElement("div");
  overlay.id = "reimport-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    z-index: 100005; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  const rows = keys
    .map((key) => {
      const label = DISPLAY[key] || key;
      const value = testResults[key]?.value || "N/A";
      const isExported = !!exportedTests[key];
      const statusText = isExported
        ? '<span style="color:#28a745;font-weight:600;">✓ importat</span>'
        : '<span style="color:#dc3545;font-weight:600;">○ neimportat</span>';
      return `
        <label style="
          display:flex; align-items:center; gap:10px;
          padding:8px 10px; border-bottom:1px solid #eee; cursor:pointer;
        ">
          <input type="checkbox" class="reimport-test" data-key="${key}"
            style="width:16px;height:16px;cursor:pointer;">
          <span style="flex:1;font-size:13px;color:#212529;">
            ${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong>
          </span>
          <span style="font-size:11px;">${statusText}</span>
        </label>
      `;
    })
    .join("");

  const modal = document.createElement("div");
  modal.style.cssText = `
    background:#f5f6fa; border-radius:12px; width:90%; max-width:520px;
    max-height:85vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.3);
  `;
  modal.innerHTML = `
    <div style="
      background:linear-gradient(135deg,#17a2b8,#1289a0);
      color:white; padding:14px 20px; border-radius:12px 12px 0 0;
      display:flex; align-items:center; justify-content:space-between;
    ">
      <span style="font-size:15px;font-weight:bold;">🔄 Reimportă analize — ${escapeHtml(patientName)}</span>
      <button data-action="close" style="
        background:none;border:none;color:white;font-size:20px;
        cursor:pointer;padding:0 4px;line-height:1;">✕</button>
    </div>

    <div style="padding:16px 20px;">
      <div style="
        background:#fff3cd; color:#856404; border:1px solid #ffeeba;
        border-radius:6px; padding:10px 12px; margin-bottom:14px;
        font-size:12px; font-weight:600;
      ">
        ⚠️ Verifică că nu sunt importate deja!
      </div>

      <label style="
        display:flex; align-items:center; gap:10px;
        padding:8px 10px; margin-bottom:6px; cursor:pointer;
        font-size:12px; font-weight:600; color:#495057;
      ">
        <input type="checkbox" id="reimport-select-all"
          style="width:16px;height:16px;cursor:pointer;">
        Selectează toate
      </label>

      <div style="background:white;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
        ${rows}
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button data-action="cancel" style="
          padding:9px 18px; border:none; border-radius:18px; font-size:13px;
          font-weight:600; cursor:pointer; background:#e9ecef; color:#495057;
        ">Anulează</button>
        <button data-action="confirm" style="
          padding:9px 18px; border:none; border-radius:18px; font-size:13px;
          font-weight:600; cursor:pointer;
          background:linear-gradient(135deg,#17a2b8,#1289a0); color:white;
          box-shadow:0 2px 6px rgba(23,162,184,0.35);
        ">🔄 Marchează pentru reimport</button>
      </div>
    </div>
  `;

  modal.querySelector("#reimport-select-all").addEventListener("change", (e) => {
    modal
      .querySelectorAll(".reimport-test")
      .forEach((cb) => (cb.checked = e.target.checked));
  });

  modal.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "close" || action === "cancel") {
      overlay.remove();
      return;
    }

    if (action === "confirm") {
      const selectedKeys = Array.from(
        modal.querySelectorAll(".reimport-test:checked")
      ).map((cb) => cb.dataset.key);

      if (selectedKeys.length === 0) {
        window.showWarningToast(
          "⚠️ Nicio analiză selectată",
          "Bifează cel puțin o analiză pentru reimport."
        );
        return;
      }

      const result = await markTestsForReimport(patientKey, selectedKeys);
      if (!result) return; // warning already shown; keep modal open to retry
      overlay.remove();

      window.showSuccessToast(
        "🔄 Pregătit pentru reimport",
        `${result.count} analiză(e) marcate ca neimportate pentru ${escapeHtml(result.patientName)}. Apasă butonul albastru „Export" de sus pentru a le reimporta.`
      );
    }
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// Un-mark test keys as exported for a patient, so they re-enter the batch
// export queue. Pass `testKeys = null` to reimport all of the patient's
// analyses. Loads the queue once, persists, and refreshes the UI + count.
// Shows the relevant warning toast and returns null on any failure; on success
// returns { patientName, count }.
async function markTestsForReimport(patientKey, testKeys = null) {
  if (!patientKey) {
    window.showWarningToast(
      "⚠️ Nu pot reimporta",
      "Selectează mai întâi o serie (prefix ID)."
    );
    return null;
  }

  const queue = await window.loadQueueFromDB();
  const patient = window.findPatientByKey(queue, patientKey);
  if (!patient) {
    window.showWarningToast(
      "⚠️ Pacient negăsit",
      "Nu am găsit datele pacientului pentru reimport."
    );
    return null;
  }

  if (!patient.exportedTests || Array.isArray(patient.exportedTests)) {
    patient.exportedTests = {};
  }

  const testResults = patient.structuredData?.testResults || {};
  const keys = testKeys ?? Object.keys(testResults);
  if (keys.length === 0) {
    window.showWarningToast(
      "⚠️ Fără analize",
      "Acest pacient nu are analize de reimportat."
    );
    return null;
  }

  keys.forEach((key) => {
    delete patient.exportedTests[key];
  });

  const stillFullyExported = Object.keys(testResults).every(
    (key) => patient.exportedTests[key]
  );
  if (!stillFullyExported) {
    patient.exported = false;
    patient.exportedAt = null;
  }

  await window.saveQueueToDB(queue);
  await window.updateExportCount();
  await window.syncUIWithLocalStorage();

  const patientName = patient.patientInfo?.nume || "";
  console.log(
    `🔄 Marked ${keys.length} test(s) for reimport on ${patientName}:`,
    keys
  );
  return { patientName, count: keys.length };
}

// Quick path: mark every one of a patient's analyses for reimport without
// opening the picker modal.
async function reimportAllForPatient(patientKey) {
  const result = await markTestsForReimport(patientKey);
  if (!result) return; // warning already shown by markTestsForReimport

  window.showSuccessToast(
    "🔄 Pregătit pentru reimport",
    `Toate cele ${result.count} analize ale pacientului ${escapeHtml(result.patientName)} au fost marcate ca neimportate. Apasă butonul albastru „Export" de sus pentru a le reimporta.`
  );
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
window.showReimportContextMenu = showReimportContextMenu;
window.openReimportModal = openReimportModal;
window.markTestsForReimport = markTestsForReimport;
window.reimportAllForPatient = reimportAllForPatient;
window.showSuccessToast = showSuccessToast;
