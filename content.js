// Content script to inject batch functionality into the ASPX site
let batchCounter = 0;
let extractedData = [];
let pdfProcessor = null;
let batchQueue = []; // Store batch items locally

// Wait for page to load and inject batch buttons
document.addEventListener('DOMContentLoaded', initializeBatchExtension);

// Also run immediately in case DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBatchExtension);
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
  }
}

function addTestResultsColumn() {
  const table = document.getElementById('ctl00_contentMain_dgGrid');
  if (!table) {
    console.warn('Table not found for adding test results column');
    return;
  }

  console.log('📊 Adding test results column to table');

  // Find header row (contains th elements) and data rows (contain td elements)
  const allRows = table.querySelectorAll('tr');
  console.log(`📋 Found ${allRows.length} total rows in table`);

  let headerRow = null;
  let dataRows = [];

  allRows.forEach((row, index) => {
    const thElements = row.querySelectorAll('th');
    const tdElements = row.querySelectorAll('td');

    if (thElements.length > 0) {
      headerRow = row;
      console.log(`📋 Row ${index} is header row (has ${thElements.length} th elements)`);
    } else if (tdElements.length > 0) {
      dataRows.push(row);
      console.log(`📋 Row ${index} is data row (has ${tdElements.length} td elements)`);
    }
  });

  // Add header for test results column
  if (headerRow) {
    const newHeaderCell = document.createElement('th');
    newHeaderCell.textContent = 'Test Results';
    newHeaderCell.style.cssText = `
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      padding: 8px;
      font-weight: bold;
    `;
    headerRow.appendChild(newHeaderCell);
    console.log('✅ Added test results header');
  } else {
    console.warn('⚠️  No header row found with th elements');
  }

  console.log(`📋 Found ${dataRows.length} data rows to add test result cells`);

  dataRows.forEach((row, index) => {
    // Skip footer rows (pagination)
    if (row.closest('tfoot')) {
      console.log(`📋 Skipping footer row ${index} (pagination)`);
      return;
    }

    const downloadLink = row.querySelector('a[id*="lnkView"]');
    if (!downloadLink) {
      console.log(`📋 Skipping row ${index} - no download link`);
      return;
    }

    const newCell = document.createElement('td');
    newCell.id = `test-results-${index}`;
    newCell.style.cssText = `
      border: 1px solid #dee2e6;
      padding: 8px;
      font-size: 12px;
      color: #666;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    newCell.textContent = 'Not processed';

    newCell.setAttribute('data-link-id', downloadLink.id);
    console.log(`✅ Added test result cell ${index} for link ${downloadLink.id}`);

    row.appendChild(newCell);
  });

  console.log('📊 Finished adding test results column');
}

function findDownloadElements() {
  // Target the specific download links in the table
  const downloadLinks = document.querySelectorAll('#ctl00_contentMain_dgGrid a[id*="lnkView"]');
  return Array.from(downloadLinks);
}

function injectBatchButtons(downloadElements) {
  downloadElements.forEach((element, index) => {
    // Create container for button and input
    const container = document.createElement('div');
    container.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-left: 10px;
      gap: 5px;
    `;

    // Create batch button
    const batchBtn = document.createElement('button');
    batchBtn.textContent = '+';
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
      toggleBatch(element, index, batchBtn);
    };

    // Create patient text input
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.id = `patient-text-${index}`;
    textInput.placeholder = 'ID suffix';
    textInput.style.cssText = `
      padding: 3px 6px;
      border: 1px solid #ccc;
      border-radius: 2px;
      font-size: 11px;
      width: 80px;
    `;

    container.appendChild(batchBtn);
    container.appendChild(textInput);

    // Insert container next to download element
    element.parentNode.insertBefore(container, element.nextSibling);
  });
}

function createSingleProcessButton() {
  // Find the table and add button after it
  const table = document.getElementById('ctl00_contentMain_dgGrid');
  if (!table) return;

  // Create simple button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    margin: 20px 0;
    text-align: center;
    padding: 20px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 5px;
  `;

  buttonContainer.innerHTML = `
    <div style="margin-bottom: 15px;">
      <label for="id-prefix" style="
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
        color: #333;
      ">ID Prefix (e.g., 25S19):</label>
      <input type="text" id="id-prefix" placeholder="25S19" style="
        padding: 8px 12px;
        border: 2px solid #dee2e6;
        border-radius: 4px;
        font-size: 14px;
        width: 200px;
      ">
    </div>
    <button id="sante-process-export" style="
      background: #007cba;
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    ">
      📥 Export Results (<span id="exported-count">0</span> ready)
    </button>
    <div id="status-text" style="
      margin-top: 10px;
      font-size: 14px;
      color: #666;
    ">
      Enter ID prefix above, click + buttons to auto-process PDFs, then export results
    </div>
  `;

  // Insert after the table
  table.parentNode.insertBefore(buttonContainer, table.nextSibling);

  document.getElementById('sante-process-export').onclick = exportData;
}

// Status display is now integrated into the main control panel

function toggleBatch(element, index, batchBtn) {
  const isCurrentlyBatched = batchBtn.getAttribute('data-batched') === 'true';

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
  const patientText = patientTextInput ? patientTextInput.value.trim() : '';

  // Check if patient text is provided
  if (!patientText) {
    alert('Please enter an ID suffix for this patient before adding to batch.');
    return;
  }

  // Get patient data from the table row
  const row = element.closest('tr');
  const cells = row.querySelectorAll('td');

  const patientData = {
    nrDoc: cells[0]?.textContent.trim(),
    nume: cells[1]?.textContent.trim(),
    cnp: cells[2]?.textContent.trim(),
    dataNasterii: cells[3]?.textContent.trim(),
    unitateRecoltare: cells[4]?.textContent.trim(),
    codBare: cells[5]?.textContent.trim(),
    dataRecoltare: cells[6]?.textContent.trim(),
    dataRezultate: cells[7]?.textContent.trim(),
    patientText: patientText // Store the patient-specific text
  };

  batchCounter++;

  // Store locally first, then try to sync with background
  const batchItem = {
    id: `pdf_${batchCounter}`,
    elementId: element.id,
    patientData: patientData,
    elementIndex: index,
    timestamp: Date.now()
  };

  batchQueue.push(batchItem);

  // Try to send to background script with error handling
  try {
    chrome.runtime.sendMessage({
      action: 'addToBatch',
      ...batchItem
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Background not available, working locally only');
      }
      // Continue regardless of background script response
    });
  } catch (error) {
    console.log('Extension messaging not available, working locally');
  }

  updateBatchCount(batchQueue.length);

  // Visual feedback - mark as added and processing
  batchBtn.textContent = '⏳';
  batchBtn.style.background = '#ffc107';
  batchBtn.setAttribute('data-batched', 'true');
  batchBtn.setAttribute('data-element-id', element.id);

  console.log(`%c✅ ADDED TO BATCH: ${patientData.nume} - Auto-processing...`, 'color: green; font-weight: bold');

  // Restore row styling if it was previously excluded
  if (row) {
    row.style.opacity = '1';
    row.style.backgroundColor = '';
  }

  // Restore test results cell styling
  const testResultCell = document.getElementById(`test-results-${index}`);
  if (testResultCell) {
    testResultCell.style.opacity = '1';
    testResultCell.style.backgroundColor = '';

    // Remove excluded indicator if it exists
    const excludedIndicator = testResultCell.querySelector('.excluded-indicator');
    if (excludedIndicator) {
      excludedIndicator.remove();
    }
  }

  // Auto-process this PDF immediately
  try {
    await downloadAndProcessPDF(element, batchItem);

    // Mark as included if it was previously excluded
    const extractedItem = extractedData.find(item =>
      item.debugInfo?.elementIndex === index ||
      item.id === batchItem.id
    );
    if (extractedItem) {
      extractedItem.excluded = false;
      console.log(`%c✅ MARKED AS INCLUDED: ${extractedItem.patientInfo?.nume}`, 'color: green; font-weight: bold');
    }

    // Update button to show completed
    batchBtn.textContent = '✓';
    batchBtn.style.background = '#28a745';

    console.log(`%c🎉 AUTO-PROCESSING COMPLETE: ${patientData.nume}`, 'color: green; font-weight: bold');
    updateExportCount();
  } catch (error) {
    console.error(`%c❌ AUTO-PROCESSING FAILED: ${patientData.nume}`, 'color: red; font-weight: bold', error);
    batchBtn.textContent = '❌';
    batchBtn.style.background = '#dc3545';
    updateExportCount();
  }
}

function removeFromBatch(element, index, batchBtn) {
  // Find and remove the item from batchQueue
  const elementId = element.id;
  const itemIndex = batchQueue.findIndex(item => item.elementId === elementId);

  if (itemIndex !== -1) {
    const removedItem = batchQueue.splice(itemIndex, 1)[0];
    console.log(`%c❌ REMOVED FROM BATCH: ${removedItem.patientData.nume}`, 'color: orange; font-weight: bold');
  }

  // Mark extracted data as excluded
  const extractedItem = extractedData.find(item => {
    const batchItem = batchQueue.find(batch => batch.elementId === elementId) ||
                     extractedData.find(extracted => extracted.debugInfo?.elementIndex === index);
    return batchItem ? item.id === batchItem.id : extracted === item;
  });

  if (extractedItem) {
    extractedItem.excluded = true;
    console.log(`%c🚫 MARKED AS EXCLUDED: ${extractedItem.patientInfo?.nume}`, 'color: gray; font-weight: bold');
  }

  updateBatchCount(batchQueue.length);

  // Visual feedback - mark as not batched
  batchBtn.textContent = '+';
  batchBtn.style.background = '#007cba';
  batchBtn.removeAttribute('data-batched');
  batchBtn.removeAttribute('data-element-id');

  // Grey out the table row and test results
  const row = element.closest('tr');
  if (row) {
    row.style.opacity = '0.5';
    row.style.backgroundColor = '#f8f9fa';
  }

  // Grey out test results cell
  const testResultCell = document.getElementById(`test-results-${index}`);
  if (testResultCell) {
    testResultCell.style.opacity = '0.5';
    testResultCell.style.backgroundColor = '#e9ecef';

    // Add excluded indicator
    const excludedIndicator = testResultCell.querySelector('.excluded-indicator');
    if (!excludedIndicator) {
      const indicator = document.createElement('div');
      indicator.className = 'excluded-indicator';
      indicator.style.cssText = `
        background: #6c757d;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        margin-top: 5px;
      `;
      indicator.textContent = '🚫 Excluded from export';
      testResultCell.appendChild(indicator);
    }
  }

  // Update export count
  updateExportCount();
}

async function processAndExportAll() {
  const button = document.getElementById('sante-process-export');
  const statusText = document.getElementById('status-text');

  if (batchQueue.length === 0) {
    statusText.textContent = 'No PDFs selected! Click + Batch buttons first.';
    statusText.style.color = '#dc3545';
    setTimeout(() => {
      statusText.textContent = 'Click + Batch buttons above, then process all at once';
      statusText.style.color = '#666';
    }, 3000);
    return;
  }

  button.disabled = true;
  button.textContent = 'Processing...';
  statusText.textContent = `Processing ${batchQueue.length} PDFs...`;
  statusText.style.color = '#007cba';

  console.log(`%c🚀 STARTING BATCH PROCESSING of ${batchQueue.length} PDFs`, 'color: blue; font-weight: bold');

  // Process all PDFs
  await processBatch();

  // Auto-export data
  if (extractedData.length > 0) {
    statusText.textContent = 'Exporting data...';
    console.log(`%c📤 AUTO-EXPORTING DATA`, 'color: green; font-weight: bold');
    exportData();

    statusText.textContent = `✅ Exported ${extractedData.length} results! Data preserved.`;
    statusText.style.color = '#28a745';
  } else {
    statusText.textContent = '❌ No data extracted. Check console for errors.';
    statusText.style.color = '#dc3545';
  }

  // Reset button (keep data and test results)
  button.disabled = false;
  button.textContent = `Process & Export All PDFs (${batchQueue.length})`;

  setTimeout(() => {
    statusText.textContent = 'Data exported and preserved. Process more or reload page to start fresh.';
    statusText.style.color = '#666';
  }, 5000);
}

async function processBatch() {
  if (batchQueue.length === 0) {
    return;
  }

  // Process each PDF in the batch queue
  for (let i = 0; i < batchQueue.length; i++) {
    const item = batchQueue[i];
    const patientName = item.patientData.nume || 'Unknown';

    // Update status if status text exists
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = `Processing ${i + 1}/${batchQueue.length}: ${patientName}`;
    }

    console.log(`%c📋 PROCESSING PATIENT ${i + 1}/${batchQueue.length}`, 'color: blue; font-weight: bold');
    console.log(`👤 Patient: ${patientName}`);
    console.log(`🆔 Element ID: ${item.elementId}`);
    console.log(`📅 Batch Item:`, item);

    try {
      // Find the download link for this item
      const downloadLink = document.getElementById(item.elementId);
      if (downloadLink) {
        console.log(`%c✅ Download link found for ${patientName}`, 'color: green');
        console.log(`🔗 Link href:`, downloadLink.href);

        await downloadAndProcessPDF(downloadLink, item);
        console.log(`%c✅ SUCCESS: Processed PDF for ${patientName}`, 'color: green; font-weight: bold');
      } else {
        const errorMsg = `❌ DOWNLOAD LINK NOT FOUND for ${patientName} (ID: ${item.elementId})`;
        console.error(`%c${errorMsg}`, 'color: red; font-weight: bold');

        // List all available elements for debugging
        const allLinks = document.querySelectorAll('#ctl00_contentMain_dgGrid a[id*="lnkView"]');
        console.log(`🔍 Available download links:`, Array.from(allLinks).map(link => link.id));

        // Create error entry if link not found
        const linkErrorData = {
          id: item.id,
          patientInfo: item.patientData,
          extractionDate: new Date().toISOString(),
          error: 'Download link not found - element may have been removed from page',
          status: 'LINK_NOT_FOUND',
          availableLinks: Array.from(allLinks).map(link => link.id)
        };
        extractedData.push(linkErrorData);

        // Update test results column with error
        updateTestResultsColumn(item.elementIndex, linkErrorData);
      }
    } catch (error) {
      const errorMsg = `❌ PROCESSING ERROR for ${patientName}: ${error.message}`;
      console.error(`%c${errorMsg}`, 'color: red; font-weight: bold');
      console.error(`🔥 Full error:`, error);
      console.error(`📍 Error stack:`, error.stack);

      const processingErrorData = {
        id: item.id,
        patientInfo: item.patientData,
        extractionDate: new Date().toISOString(),
        error: error.message,
        errorType: error.name,
        status: 'PROCESSING_ERROR',
        fullError: error.toString()
      };
      extractedData.push(processingErrorData);

      // Update test results column with error
      updateTestResultsColumn(item.elementIndex, processingErrorData);
    }

    // Progress tracking removed - using simplified UI
    console.log(`%c📊 Progress: ${extractedData.length}/${batchQueue.length} completed`, 'color: purple');

    // Wait between downloads to avoid overwhelming the server
    if (i < batchQueue.length - 1) {
      console.log(`⏳ Waiting 2 seconds before next download...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

}

function clearAllData() {
  console.log(`%c🧹 CLEARING ALL DATA`, 'color: orange; font-weight: bold');

  // Clear local data
  batchQueue = [];
  extractedData = [];
  batchCounter = 0;

  // Try to clear background data too
  try {
    chrome.runtime.sendMessage({action: 'clearBatch'}, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Background not available for clearing');
      }
    });
  } catch (error) {
    console.log('Extension messaging not available');
  }

  updateBatchCount(0);

  // Reset all batch buttons to original state
  const batchedButtons = document.querySelectorAll('button[data-batched="true"]');
  batchedButtons.forEach(btn => {
    btn.textContent = '+';
    btn.style.background = '#007cba';
    btn.disabled = false;
    btn.removeAttribute('data-batched');
  });

  // Clear all test results columns
  const testResultCells = document.querySelectorAll('[id^="test-results-"]');
  testResultCells.forEach(cell => {
    cell.textContent = 'Not processed';
    cell.style.color = '#666';
    cell.removeAttribute('title');
  });
}

function updateBatchCount(count) {
  const countElement = document.getElementById('batch-count');
  if (countElement) {
    countElement.textContent = count;
  }
}

function updateExportCount() {
  const exportCount = extractedData.filter(item => !item.excluded).length;
  const countElement = document.getElementById('exported-count');
  if (countElement) {
    countElement.textContent = exportCount;
  }
}

function updateTestResultsColumn(elementIndex, extractedData) {
  const testResultCell = document.getElementById(`test-results-${elementIndex}`);

  if (!testResultCell) {
    console.warn(`Test result cell not found for index ${elementIndex}. Available cells:`,
      Array.from(document.querySelectorAll('[id^="test-results-"]')).map(cell => cell.id));
    return;
  }

  console.log(`%c📊 UPDATING TEST RESULTS for index ${elementIndex}`, 'color: blue; font-weight: bold');

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
    const value = testData.value || 'N/A';
    let mapped = null;
    try {
      if (pdfProcessor && typeof pdfProcessor.mapTestNameToKey === 'function') {
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
  const ORDER = ['B12','25OHD','TSH','FT4','ATPO','HBA1C','FERITINA','IRON','PSA','VSH','HOMOCYSTEIN','TSB','CRP'];
  // Nice display labels for table
  const DISPLAY = {
    B12: 'Vitamina B12',
    '25OHD': '25-OH Vitamina D',
    TSH: 'TSH',
    FT4: 'FT4',
    ATPO: 'Anti-TPO (Anti-tiroidperoxidaza)',
    HBA1C: 'Hemoglobina glicozilata (HbA1c)',
    FERITINA: 'Feritina',
    IRON: 'Sideremie',
    PSA: 'PSA',
    VSH: 'VSH',
    HOMOCYSTEIN: 'Homocisteina',
    TSB: 'Bilirubina totală',
    CRP: 'CRP (Proteina C reactivă)'
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
    testsHtml += `<div style="margin: 4px 0; color: #555;">Other tests: ${otherItems.join('; ')}</div>`;
  }

  testResultCell.innerHTML = testsHtml;
  testResultCell.style.color = '#000';
  testResultCell.title = `Full test results for this patient (${testCount} tests).`;
}

async function downloadAndProcessPDF(downloadLink, batchItem) {
  const patientName = batchItem.patientData.nume || 'Unknown';

  return new Promise((resolve, reject) => {
    try {
      console.log(`%c🔽 STARTING PDF DOWNLOAD for ${patientName}`, 'color: orange; font-weight: bold');

      // Create a form to submit the ASPX postback manually
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = document.location.pathname;
      form.style.display = 'none';

      // Copy all the ASPX form fields
      const originalForm = document.getElementById('aspnetForm');
      if (!originalForm) {
        throw new Error('ASPX form not found on page');
      }

      console.log(`📝 Copying form data from ASPX form...`);
      const formData = new FormData(originalForm);
      let fieldCount = 0;

      for (let [key, value] of formData.entries()) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
        fieldCount++;
      }
      console.log(`📝 Copied ${fieldCount} form fields`);

      // Set the postback target from the download link
      const hrefMatch = downloadLink.href.match(/__doPostBack\('([^']+)','([^']*)'\)/);
      if (hrefMatch) {
        console.log(`🎯 Setting postback target: ${hrefMatch[1]}, argument: ${hrefMatch[2]}`);

        // Update the event target
        const eventTargetInput = form.querySelector('input[name="__EVENTTARGET"]') ||
                                document.createElement('input');
        eventTargetInput.type = 'hidden';
        eventTargetInput.name = '__EVENTTARGET';
        eventTargetInput.value = hrefMatch[1];
        if (!form.contains(eventTargetInput)) form.appendChild(eventTargetInput);

        const eventArgumentInput = form.querySelector('input[name="__EVENTARGUMENT"]') ||
                                  document.createElement('input');
        eventArgumentInput.type = 'hidden';
        eventArgumentInput.name = '__EVENTARGUMENT';
        eventArgumentInput.value = hrefMatch[2];
        if (!form.contains(eventArgumentInput)) form.appendChild(eventArgumentInput);
      } else {
        throw new Error(`Could not extract postback parameters from href: ${downloadLink.href}`);
      }

      document.body.appendChild(form);
      console.log(`📤 Submitting form to download PDF...`);

      // Submit form and capture response
      fetch(document.location.href, {
        method: 'POST',
        body: new FormData(form),
        credentials: 'same-origin'
      })
      .then(response => {
        console.log(`📥 Received response: ${response.status} ${response.statusText}`);
        console.log(`📄 Content-Type: ${response.headers.get('content-type')}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/pdf')) {
          console.warn(`⚠️  Unexpected content type: ${contentType}. Proceeding anyway...`);
        }

        return response.arrayBuffer();
      })
      .then(async arrayBuffer => {
        console.log(`%c📋 PDF DOWNLOADED: ${arrayBuffer.byteLength} bytes for ${patientName}`, 'color: green');

        if (arrayBuffer.byteLength === 0) {
          throw new Error('Received empty PDF file');
        }

        if (arrayBuffer.byteLength < 100) {
          console.warn(`⚠️  Very small PDF file (${arrayBuffer.byteLength} bytes) - might be an error response`);
        }


        // Process the PDF content
        try {
          console.log(`%c🔍 STARTING PDF TEXT EXTRACTION for ${patientName}`, 'color: blue');
          const extractedPDFData = await pdfProcessor.extractTextFromPDF(arrayBuffer, batchItem.patientData);

          console.log(`%c✅ PDF EXTRACTION COMPLETE for ${patientName}`, 'color: green');
          console.log(`📊 Tests found: ${Object.keys(extractedPDFData.structuredData?.testResults || {}).length}`);
          console.log(`🧾 Extracted data summary:`, {
            patient: extractedPDFData.patientInfo?.nume,
            tests: Object.keys(extractedPDFData.structuredData?.testResults || {}),
            textLength: extractedPDFData.extractedText?.length,
            hasError: !!extractedPDFData.error
          });

          // Add debug info to extracted data
          extractedPDFData.debugInfo = {
            elementIndex: batchItem.elementIndex,
            batchId: batchItem.id,
            patientName: patientName,
            extractionTimestamp: Date.now()
          };


          extractedData.push(extractedPDFData);

          // Update test results column
          updateTestResultsColumn(batchItem.elementIndex, extractedPDFData);

          resolve(extractedPDFData);
        } catch (pdfError) {
          const errorMsg = `PDF text extraction failed for ${patientName}: ${pdfError.message}`;
          console.error(`%c❌ ${errorMsg}`, 'color: red; font-weight: bold');
          console.error(`🔥 PDF processing error details:`, pdfError);

          // Still save what we can
          const errorData = {
            id: batchItem.id,
            patientInfo: batchItem.patientData,
            extractionDate: new Date().toISOString(),
            error: 'PDF processing failed: ' + pdfError.message,
            status: 'PDF_PROCESSING_ERROR',
            pdfSize: arrayBuffer.byteLength,
            errorDetails: pdfError.toString()
          };
          extractedData.push(errorData);

          // Update test results column with error
          updateTestResultsColumn(batchItem.elementIndex, errorData);

          resolve();
        }
      })
      .catch(error => {
        const errorMsg = `PDF download failed for ${patientName}: ${error.message}`;
        console.error(`%c❌ ${errorMsg}`, 'color: red; font-weight: bold');
        console.error(`🔥 Download error details:`, error);
        reject(error);
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
      console.error(`%c❌ ${errorMsg}`, 'color: red; font-weight: bold');
      console.error(`🔥 Setup error details:`, error);
      reject(error);
    }
  });
}

// Export functionality is now integrated into processAndExportAll()

function exportData() {
  console.log('=== EXPORT DEBUG ===');
  console.log('Number of extracted items:', extractedData.length);

  // Check for ID prefix
  const idPrefix = document.getElementById('id-prefix')?.value.trim();
  if (!idPrefix) {
    alert('Please enter an ID prefix (e.g., 25S19) before exporting.');
    return;
  }

  // Filter out excluded items
  const includedData = extractedData.filter(item => !item.excluded);
  console.log('Items to export (excluding unchecked):', includedData.length);
  console.log('Excluded items:', extractedData.length - includedData.length);

  if (includedData.length === 0) {
    alert('No data to export! All items have been unchecked or no data was extracted.');
    return;
  }

  // Check if all included patients have ID suffixes
  const missingIds = includedData.filter(item => !item.patientInfo?.patientText);
  if (missingIds.length > 0) {
    alert(`Cannot export: ${missingIds.length} patient(s) are missing ID suffixes. Please enter ID suffixes for all selected patients.`);
    return;
  }

  // Use the PDF processor to generate proper CSV with PDF content
  if (pdfProcessor && includedData.length > 0) {
    console.log('Using PDF processor for CSV generation');
    const csvContent = pdfProcessor.generateCSVFromExtractedData(includedData, idPrefix);
    console.log('Generated CSV content (first 500 chars):', csvContent.substring(0, 500));
    downloadCSV(csvContent, 'sante_medical_reports.csv');
  } else {
    console.log('Using fallback CSV generation');
    // Fallback to simple CSV
    const csvContent = convertToCSV(includedData);
    downloadCSV(csvContent, 'sante_medical_reports.csv');
  }

  console.log(`✅ Exported ${includedData.length} items (${extractedData.length - includedData.length} excluded)`);
}

function convertToCSV(data) {
  const headers = ['ID', 'Size (bytes)', 'Timestamp', 'Data'];
  const csvRows = [headers.join(',')];

  data.forEach(item => {
    const row = [
      item.id,
      item.size,
      item.timestamp,
      `"${item.data}"`
    ];
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

// Auto-select functionality removed per user request

// Auto-pagination functionality removed per user request

// Navigation functionality removed - simplified to single page processing
