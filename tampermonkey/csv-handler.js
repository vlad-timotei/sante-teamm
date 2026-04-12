// Patient ID matching and API data handling
// Replaces CSV upload with Teamm API integration

window.csvPatientData = [];

function clearPatientInputs() {
  document.querySelectorAll('input[id^="patient-text-"]').forEach((input) => {
    input.value = "";
    input.style.backgroundColor = "";
  });
  document.querySelectorAll(".csv-match").forEach((el) => el.remove());
}

// Always fetch fresh patient IDs from Teamm API and apply matching
async function fetchAndApplyPatientIds(prefix) {
  if (!prefix) return;

  console.log(`🔄 Fetching patient IDs from API for ${prefix}...`);
  const result = await window.SyncManager.fetchGuests(prefix);

  if (!result?.success || !result.patients) {
    console.warn(`❌ Failed to fetch patients for ${prefix}`);
    return;
  }

  window.csvPatientData = result.patients;

  clearPatientInputs();
  const matchResults = matchCSVToTablePatients(window.csvPatientData);
  displayMatchResults(matchResults);

  const withId = result.patients.filter((p) => p.fullId).length;
  const withoutId = result.patients.length - withId;
  window.showSuccessToast?.(
    "Pacienți încărcați",
    `${result.patients.length} pacienți (${withId} cu ID, ${withoutId} fără ID)`,
  );

  setTimeout(() => window.updateDownloadCount?.(), 100);
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

          if (
            statusTitle !== "Efectuat cu rezultate" &&
            statusTitle !== "In lucru" &&
            statusTitle !== "Rezultate partiale"
          ) {
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
        }
      }
    }
  });

  console.log(`Found ${tablePatients.length} patients in table`);
  console.log(`Found ${csvPatients.length} patients in data`);

  const matches = [];
  const unmatched = [];
  const usedCSVPatients = new Set();
  const processedTablePatients = new Set();

  const sortedTablePatients = [...tablePatients].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  sortedTablePatients.forEach((tablePatient) => {
    const tableName = normalizedName(tablePatient.name);

    if (processedTablePatients.has(tableName)) {
      return;
    }

    processedTablePatients.add(tableName);

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

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { patient: csvPatient, index: csvIndex };
      }
    });

    if (bestMatch && bestScore >= 0.666) {
      usedCSVPatients.add(bestMatch.index);

      // Only extract suffix if patient has a bookingId
      const fullId = bestMatch.patient.fullId || "";
      const idSuffix = fullId ? fullId.slice(-2) : "";

      matches.push({
        tablePatient: tablePatient,
        csvPatient: bestMatch.patient,
        similarity: bestScore,
        idSuffix: idSuffix,
        matchQuality:
          bestScore >= 0.95 ? "exact" : bestScore >= 0.85 ? "good" : "partial",
      });
    } else {
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
    .replace(/[ăâîșțşţ]/g, (match) => {
      const map = { ă: "a", â: "a", î: "i", ș: "s", ț: "t", ş: "s", ţ: "t" };
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
      ...words2.map((word2) => calculateLevenshteinSimilarity(word1, word2)),
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
        matrix[i - 1][j - 1] + cost,
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

  let autoFilled = 0;
  matches.forEach((match) => {
    const linkId = match.tablePatient.downloadLink.id;

    let patientInput = null;

    patientInput = document.querySelector(`input[data-link-id="${linkId}"]`);

    if (!patientInput) {
      let inputId = linkId.replace("lnkView", "patient-text-");
      patientInput = document.getElementById(inputId);
    }

    if (!patientInput) {
      const linkMatch = linkId.match(/\d+/);
      if (linkMatch) {
        const numericPart = linkMatch[0];
        const inputId = `patient-text-${numericPart}`;
        patientInput = document.getElementById(inputId);
      }
    }

    if (!patientInput) {
      const row = match.tablePatient.row;
      if (!row) return;
      const rowInputs = row.querySelectorAll('input[type="text"]');
      if (rowInputs.length > 0) {
        patientInput = rowInputs[0];
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
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    if (patientInput) {
      // Fill with suffix if available, leave empty if no bookingId
      patientInput.value = match.idSuffix;
      if (match.idSuffix) {
        patientInput.style.backgroundColor =
          match.matchQuality === "exact"
            ? "#d4edda"
            : match.matchQuality === "good"
              ? "#fff3cd"
              : "#f8d7da";
      } else {
        // Matched by name but no bookingId yet
        patientInput.style.backgroundColor = "#e2e3e5";
      }
      autoFilled++;

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
            ? `(${match.csvPatient.name})`
            : `(${match.csvPatient.name} | ${match.csvPatient.fullId || "fără ID"})`;
        matchIndicator.textContent = csvInfo;
        nameCell.appendChild(matchIndicator);
      }
    } else {
      console.error(`❌ Input not found for link: ${linkId}`);
    }
  });

  resultsDiv.style.display = "none";

  console.log(
    `✅ Matching complete: ${matches.length} matched, ${unmatched.length} require manual attention`,
  );
}

function findBatchButtonForInput(input) {
  const container = input.parentElement;
  if (container) {
    const button = container.querySelector("button");
    if (button) return button;
  }

  const cell = input.closest("td");
  if (cell) {
    const button = cell.querySelector("button");
    if (button) return button;
  }

  return null;
}

// Export to window
window.clearPatientInputs = clearPatientInputs;
window.fetchAndApplyPatientIds = fetchAndApplyPatientIds;
window.matchCSVToTablePatients = matchCSVToTablePatients;
window.normalizedName = normalizedName;
window.calculateNameSimilarity = calculateNameSimilarity;
window.calculateLevenshteinSimilarity = calculateLevenshteinSimilarity;
window.displayMatchResults = displayMatchResults;
window.findBatchButtonForInput = findBatchButtonForInput;
