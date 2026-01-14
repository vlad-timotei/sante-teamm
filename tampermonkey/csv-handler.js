// CSV Handler v1.0.0
// CSV upload, parsing, and patient matching functions

window.csvPatientData = [];

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

  const idPrefixInput = document.getElementById("id-prefix");
  if (idPrefixInput && idPrefixInput.value.trim()) {
    checkForStoredCSVData();
    return;
  }

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

  if (storedPrefixes.length > 0) {
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
    window.csvPatientData = storedData;
    updateCSVButton(idPrefix, storedData.length, true);

    const matchResults = matchCSVToTablePatients(window.csvPatientData);
    displayMatchResults(matchResults);

    console.log(
      `🔄 Auto-loaded stored CSV data for ${idPrefix} and performed matching`
    );

    setTimeout(() => window.updateDownloadCount(), 100);
  } else {
    console.log(`❌ No stored CSV data found for prefix: ${idPrefix}`);
  }
}

function updateCSVButton(idPrefix, patientCount, isStored) {
  const csvLabel = document.querySelector('label[for="csv-upload"]');
  if (!csvLabel) return;

  // Update prefix display
  const prefixDisplay = document.getElementById("id-prefix-display");
  if (prefixDisplay) {
    if (isStored && idPrefix) {
      prefixDisplay.textContent = `Prefix: ${idPrefix}`;
      prefixDisplay.style.display = "inline-block";
    } else {
      prefixDisplay.style.display = "none";
    }
  }

  if (isStored) {
    csvLabel.innerHTML = `Sejur ${idPrefix} (${patientCount} pacienți) <span id="clear-csv-data" style="
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
    csvLabel.style.background = "#17a2b8";
    csvLabel.style.borderColor = "#17a2b8";
    csvLabel.title = `Using stored CSV data for ID prefix ${idPrefix} with ${patientCount} patients. Click to replace with new CSV.`;

    setTimeout(() => {
      const clearButton = document.getElementById("clear-csv-data");
      if (clearButton) {
        clearButton.onclick = async function (e) {
          e.preventDefault();
          e.stopPropagation();

          clearStoredCSVData(idPrefix);
          window.csvPatientData = [];
          updateCSVButton("", 0, false);

          const idPrefixInput = document.getElementById("id-prefix");
          if (idPrefixInput) {
            idPrefixInput.value = "";
          }

          await window.updateExportCount();
          console.log(`🗑️ Cleared stored CSV data and reset interface`);
        };
      }
    }, 10);
  } else {
    csvLabel.innerHTML = "📁 Choose CSV File";
    csvLabel.style.background = "#28a745";
    csvLabel.style.borderColor = "#28a745";
    csvLabel.title = "Click to upload a new CSV file";
  }
}

function autoDetectIdPrefix(csvPatients) {
  if (csvPatients.length === 0) return null;

  // Get first valid ID (minimum 4 chars for format YYSN + NN)
  const firstValidPatient = csvPatients.find((p) => p.fullId && p.fullId.length >= 4);
  if (!firstValidPatient) return null;

  // Prefix is everything except the last 2 digits (patient number)
  const prefix = firstValidPatient.fullId.slice(0, -2);

  console.log(`🔍 Detected prefix: "${prefix}" from ID "${firstValidPatient.fullId}"`);

  if (prefix) {
    const idPrefixInput = document.getElementById("id-prefix");
    if (idPrefixInput) {
      idPrefixInput.value = prefix;
      console.log(
        `✅ Auto-detected ID prefix: ${prefix} (${csvPatients.length} patients)`
      );
    }

    // Update the visible prefix display
    const prefixDisplay = document.getElementById("id-prefix-display");
    if (prefixDisplay) {
      prefixDisplay.textContent = `Prefix: ${prefix}`;
      prefixDisplay.style.display = "inline-block";
    }

    return prefix;
  }
  return null;
}

async function handleCSVUpload(event) {
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
    window.csvPatientData = parseCSV(csvContent);

    if (window.csvPatientData.length === 0) {
      alert("No patient data found in CSV file.");
      return;
    }

    const detectedPrefix = autoDetectIdPrefix(window.csvPatientData);

    if (detectedPrefix) {
      await storeCSVData(detectedPrefix, window.csvPatientData);
      updateCSVButton(detectedPrefix, window.csvPatientData.length, true);
    }

    const matchResults = matchCSVToTablePatients(window.csvPatientData);
    displayMatchResults(matchResults);

    setTimeout(() => window.updateDownloadCount(), 100);
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

  let nameColumnIndex = -1;
  let idColumnIndex = -1;

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
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function matchCSVToTablePatients(csvPatients) {
  const tableRows = document.querySelectorAll("#ctl00_contentMain_dgGrid tr");
  const tablePatients = [];

  tableRows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      const downloadLink = row.querySelector('a[id*="lnkView"]');
      if (downloadLink) {
        const statusIcon = row.querySelector(".glyphicon");
        if (statusIcon) {
          const statusTitle = statusIcon.getAttribute("title");
          console.log(`Row ${rowIndex} status: ${statusTitle}`);

          if (statusTitle !== "Efectuat cu rezultate" && statusTitle !== "In lucru" && statusTitle !== "Rezultate partiale") {
            console.log(
              `⏭️ Skipping patient in row ${rowIndex} - status "${statusTitle}" not allowed`
            );
            return;
          }
        }

        const name = cells[1]?.textContent.trim();
        if (name) {
          const tablePatientId = `${name}_${downloadLink.id}_${rowIndex}`;
          const statusTitle = statusIcon?.getAttribute("title") || "Unknown";
          tablePatients.push({
            name: name,
            rowIndex: rowIndex,
            downloadLink: downloadLink,
            row: row,
            uniqueId: tablePatientId,
            importedStatus: statusTitle,
          });
          console.log(
            `✅ Added patient for processing: ${name} (status: ${statusTitle})`
          );
        }
      }
    }
  });

  console.log(`Found ${tablePatients.length} patients in table`);
  console.log(`Found ${csvPatients.length} patients in CSV`);

  const matches = [];
  const unmatched = [];
  const usedCSVPatients = new Set();
  const processedTablePatients = new Set();

  const sortedTablePatients = [...tablePatients].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  sortedTablePatients.forEach((tablePatient) => {
    const tableName = normalizedName(tablePatient.name);

    if (processedTablePatients.has(tableName)) {
      console.log(
        `⏭️ SKIPPING DUPLICATE: "${tablePatient.name}" (already processed)`
      );
      return;
    }

    processedTablePatients.add(tableName);

    console.log(
      `🔍 Processing table patient: "${tablePatient.name}" → normalized: "${tableName}"`
    );
    let bestMatch = null;
    let bestScore = 0;

    csvPatients.forEach((csvPatient, csvIndex) => {
      const csvName = normalizedName(csvPatient.name);
      const score = calculateNameSimilarity(tableName, csvName);

      const isExactMatch = score >= 0.95;
      const isAlreadyUsed = usedCSVPatients.has(csvIndex);

      if (isAlreadyUsed && !isExactMatch) {
        return;
      }

      if (score > 0.5) {
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
      console.log(
        `✅ MATCH FOUND: "${tablePatient.name}" ↔ "${
          bestMatch.patient.name
        }" (score: ${bestScore.toFixed(3)})`
      );
      usedCSVPatients.add(bestMatch.index);

      // Suffix is the last 2 digits (patient number)
      const idSuffix = bestMatch.patient.fullId.slice(-2);

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
    .replace(/[-_]/g, " ")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateNameSimilarity(name1, name2) {
  if (name1 === name2) return 1.0;

  const words1 = name1.split(" ").filter((w) => w.length > 1);
  const words2 = name2.split(" ").filter((w) => w.length > 1);

  if (words1.length === 0 || words2.length === 0) return 0;

  let matchingWords = 0;
  const totalWords = Math.max(words1.length, words2.length);

  words1.forEach((word1) => {
    const bestWordMatch = Math.max(
      ...words2.map((word2) => calculateLevenshteinSimilarity(word1, word2))
    );
    if (bestWordMatch > 0.8) {
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

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
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

  let autoFilled = 0;
  matches.forEach((match) => {
    const linkId = match.tablePatient.downloadLink.id;
    console.log(
      `Processing match for link ID: ${linkId}, table patient: ${match.tablePatient.name}`
    );

    let patientInput = null;

    console.log(`🔍 Looking for input with data-link-id="${linkId}"`);
    patientInput = document.querySelector(`input[data-link-id="${linkId}"]`);
    if (patientInput) {
      console.log(`✓ Found input by data-link-id: ${patientInput.id}`);
    } else {
      console.log(`❌ No input found with data-link-id="${linkId}"`);
    }

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

    if (!patientInput) {
      console.log(`🔍 Searching for text inputs in table row...`);
      const row = match.tablePatient.row;
      if (!row) {
        console.warn("⚠️ Row element not found for match");
        return;
      }
      const rowInputs = row.querySelectorAll('input[type="text"]');
      console.log(
        `Found ${rowInputs.length} text inputs in row:`,
        Array.from(rowInputs).map((input) => input.id || "no-id")
      );
      if (rowInputs.length > 0) {
        patientInput = rowInputs[0];
        console.log(`✓ Found input in same row: ${patientInput.id || "no-id"}`);
      } else {
        console.log(`❌ No text inputs found in row`);
      }
    }

    if (!patientInput) {
      const linkElement = document.getElementById(linkId);
      if (linkElement) {
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

      const nameCell = match.tablePatient.row.cells[1];
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
    } else {
      console.error(`❌ Input not found for link: ${linkId}`);
      const allInputs = document.querySelectorAll('input[id*="patient-text-"]');
      console.log(
        `Available patient inputs:`,
        Array.from(allInputs).map((inp) => inp.id)
      );
    }
  });

  resultsDiv.style.display = "none";

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
  const container = input.parentElement;
  if (container) {
    const button = container.querySelector("button");
    if (button) {
      console.log(`Found batch button for input ${input.id}`);
      return button;
    }
  }

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

// Export to window (csvPatientData is already on window from line 4)
window.getStoredCSVKey = getStoredCSVKey;
window.storeCSVData = storeCSVData;
window.getStoredCSVData = getStoredCSVData;
window.clearStoredCSVData = clearStoredCSVData;
window.tryLoadAnyStoredData = tryLoadAnyStoredData;
window.checkForStoredCSVData = checkForStoredCSVData;
window.updateCSVButton = updateCSVButton;
window.autoDetectIdPrefix = autoDetectIdPrefix;
window.handleCSVUpload = handleCSVUpload;
window.readFileAsText = readFileAsText;
window.parseCSV = parseCSV;
window.parseCSVLine = parseCSVLine;
window.matchCSVToTablePatients = matchCSVToTablePatients;
window.normalizedName = normalizedName;
window.calculateNameSimilarity = calculateNameSimilarity;
window.calculateLevenshteinSimilarity = calculateLevenshteinSimilarity;
window.displayMatchResults = displayMatchResults;
window.findBatchButtonForInput = findBatchButtonForInput;
