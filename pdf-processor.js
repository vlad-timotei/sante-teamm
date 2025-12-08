// PDF Processing Module
// This is a basic implementation - you'll need to include PDF.js library for full functionality

class PDFProcessor {
  constructor() {
    this.loadPDFJS();
  }

  async loadPDFJS() {
    // PDF.js should already be loaded via content script
    if (typeof pdfjsLib !== "undefined") {
      // Set worker source to local file
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        chrome.runtime.getURL("pdf.worker.min.js");
      return;
    }

    // Fallback: wait a bit and try again
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (typeof pdfjsLib !== "undefined") {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        chrome.runtime.getURL("pdf.worker.min.js");
    } else {
      console.error("PDF.js library not loaded");
      throw new Error("PDF.js library not available");
    }
  }

  async extractTextFromPDF(arrayBuffer, patientData) {
    try {
      console.log("Starting PDF text extraction...");
      // Load the PDF document
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      console.log("PDF loaded, pages:", pdf.numPages);

      let fullText = "";
      const extractedData = {
        patientInfo: patientData,
        pageCount: pdf.numPages,
        extractedText: "",
        structuredData: {},
        extractionDate: new Date().toISOString(),
      };

      // Extract text from each page with better spacing
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log("Processing page", pageNum);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Better text extraction - preserve line breaks and spacing
        let pageText = "";
        let lastY = null;

        textContent.items.forEach((item) => {
          // If Y position changed significantly, add line break
          if (lastY !== null && Math.abs(lastY - item.transform[5]) > 5) {
            pageText += "\n";
          }
          pageText += item.str + " ";
          lastY = item.transform[5];
        });

        fullText += pageText + "\n";
        console.log("Page", pageNum, "text length:", pageText.length);
      }

      extractedData.extractedText = fullText;
      console.log("Full extracted text length:", fullText.length);
      console.log("First 500 chars:", fullText.substring(0, 500));

      // Basic data extraction patterns (you can customize these)
      extractedData.structuredData = this.extractMedicalData(
        fullText,
        patientData
      );
      console.log("Structured data:", extractedData.structuredData);

      return extractedData;
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      return {
        patientInfo: patientData,
        error: error.message,
        extractionDate: new Date().toISOString(),
      };
    }
  }

  extractMedicalData(text, patientData) {
    // Extract all test values from Clinica Sante medical reports
    const structuredData = {
      reportInfo: {},
      patientInfo: {},
      testResults: {},
    };

    // Extract report header information
    const reportNumberMatch = text.match(
      /Buletin de analize medicale nr\.\s*(\d+)/
    );
    if (reportNumberMatch) {
      structuredData.reportInfo.bulletinNumber = reportNumberMatch[1];
    }

    const reportDateMatch = text.match(
      /Data raportului:\s*([0-9.]+\s+[0-9:]+)/
    );
    if (reportDateMatch) {
      structuredData.reportInfo.reportDate = reportDateMatch[1];
    }

    // Extract patient information from PDF - get everything until "Data cerere"
    const patientNameMatch = text.match(
      /Nume\/Prenume:\s*([^]*?)(?=Data cerere|$)/
    );
    if (patientNameMatch) {
      // Clean up the extracted name - remove extra whitespace and newlines
      const cleanName = patientNameMatch[1]
        .replace(/\s+/g, " ") // Replace multiple spaces/newlines with single space
        .trim();
      structuredData.patientInfo.name = cleanName;
      console.log(`📝 Extracted patient name: "${cleanName}"`);
    } else {
      // Fallback to original pattern if "Data cerere" approach fails
      const fallbackMatch = text.match(/Nume\/Prenume:\s*([^\n]+)/);
      if (fallbackMatch) {
        structuredData.patientInfo.name = fallbackMatch[1].trim();
        console.log(
          `📝 Extracted patient name (fallback): "${fallbackMatch[1].trim()}"`
        );
      }
    }

    const cnpMatch = text.match(/CNP:\s*(\d+)/);
    if (cnpMatch) {
      structuredData.patientInfo.cnp = cnpMatch[1];
    }

    const doctorMatch = text.match(/Medic trimitator:\s*([^\n]+)/);
    if (doctorMatch) {
      structuredData.patientInfo.referringDoctor = doctorMatch[1].trim();
    }

    // Extract collection information
    const collectionDateMatch = text.match(
      /Data si ora recoltare:\s*([0-9.\s:]+)/
    );
    if (collectionDateMatch) {
      structuredData.patientInfo.collectionDate = collectionDateMatch[1].trim();
    }

    // Extract ALL test results with values
    this.extractAllTestValues(text, structuredData);

    return structuredData;
  }

  extractAllTestValues(text, structuredData) {
    console.log("Extracting test values from Clinica Sante format...");
    console.log("Looking in text:", text.substring(0, 2000));

    // More robust patterns for Clinica Sante - handle line breaks and spacing issues
    const testPatterns = [
      // Pattern 1: Value TestName [range] format - more flexible for medical tests (with < > support)
      /([<>]?\s*[0-9.,]+)\s+([A-Za-z0-9\s\-()]{5,50}?)\s+\[([0-9.,\s\-<>]+)\]/g,

      // Pattern 2: Find specific known tests by name, then get values before them (with < > support)
      /([<>]?\s*[0-9.,]+)\s+Feritina\s+\[([0-9.,\s\-<>]+)\]\s+([a-zA-Z\/]+)/g,
      /([<>]?\s*[0-9.,]+)\s+\^?\s*Vitamina\s+B12\s+\[([0-9.,\s\-<>]+)\]\s+([a-zA-Z\/]+)/g,
      /([<>]?\s*[0-9.,]+)\s+\^?\s*25-OH\s+Vitamina\s+D\s+\[([0-9.,\s\-<>]+)\]/g,

      // Pattern 3: General patterns with more flexible spacing (with < > support)
      /([<>]?\s*[0-9.,]+)\s+\^?\s*([A-Za-z0-9\s\-]{3,25}?)\s+\[([0-9.,\s\-<>]+)\]\s*([a-zA-Z\/]*)/g,
      /([<>]?\s*[0-9.,]+)\s+([A-Za-z0-9\s\-]{3,25}?)\s+\[([0-9.,\s\-<>]+)\]\s*([a-zA-Z\/]*)/g,
    ];

    let totalMatches = 0;

    // Universal pattern that handles ^ symbol for all tests
    const createTestPattern = (testName) => {
      // Create pattern and log it for debugging
      const pattern = new RegExp(`([<>]?\\s*[0-9.,]+)\\s+\\^?\\s*${testName}`, 'g');
      console.log(`Created pattern for "${testName}": ${pattern.source}`);
      return pattern;
    };

    // Pattern for tests where value comes AFTER test name
    const createReversedTestPattern = (testName) => {
      const pattern = new RegExp(`${testName}\\s+([<>]?\\s*[0-9.,]+)`, 'g');
      console.log(`Created REVERSED pattern for "${testName}": ${pattern.source}`);
      return pattern;
    };

    // Use TEST_DEFINITIONS from test-config.js (single source of truth)
    TEST_DEFINITIONS.forEach((test) => {
      const pattern = createTestPattern(test.pattern);
      console.log(`Looking for ${test.name} with pattern: ${pattern.source}`);
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rawValue = match[1];
        // Clean the value by removing < > symbols and extra spaces
        const cleanValue = rawValue.replace(/[<>]/g, '').trim();

        // Check if raw value had < or > symbols (indicates comparison, like "< 3")
        const hasComparisonSymbol = /[<>]/.test(rawValue);

        // Validate value before adding to results
        if (!this.isValidTestValue(cleanValue, hasComparisonSymbol)) {
          console.log(`❌ Rejected invalid value for ${test.name}: "${cleanValue}"`);
          continue;
        }

        // Store by key directly (no mapping needed later)
        structuredData.testResults[test.key] = {
          value: cleanValue,
        };
        totalMatches++;
        console.log(`✅ Found ${test.key}: ${cleanValue} (raw: ${rawValue})`);
      }
    });

    // If no specific tests found, try general patterns
    if (totalMatches === 0) {
      console.log("No specific tests found, trying general patterns...");

      testPatterns.forEach((pattern, index) => {
        console.log(`Trying general pattern ${index + 1}...`);
        let match;
        let patternMatches = 0;

        while ((match = pattern.exec(text)) !== null) {
          patternMatches++;
          let testName, value;

          const rawValue = match[1];
          // Clean the value by removing < > symbols and extra spaces
          value = rawValue.replace(/[<>]/g, '').trim();
          testName = match[2] ? match[2].trim() : "Unknown";

          // Clean up test name
          testName = this.cleanTestName(testName);

          console.log(`Found potential test: "${testName}" = ${value} (raw: ${rawValue})`);

          // Only add if it looks like a valid test name
          if (this.isValidTestName(testName)) {
            structuredData.testResults[testName] = {
              value: value,
            };
            totalMatches++;
            console.log(`✅ Added test: ${testName}`);
          } else {
            console.log(`❌ Rejected test: "${testName}"`);
          }
        }
        console.log(`Pattern ${index + 1} found ${patternMatches} matches`);
      });
    }

    console.log(`🎯 Total tests extracted: ${totalMatches}`);
    console.log("Final test results:", structuredData.testResults);
  }

  isValidTestName(name) {
    if (name.length < 3 || name.length > 60) return false;
    if (name.includes("REZULTATE")) return false;
    if (name.includes("INTERVAL")) return false;
    if (name.includes("BIOLOGIC")) return false;
    if (name.includes("REFERINTA")) return false;
    if (name.includes("DE REFERINTA")) return false;
    if (["UM", "ANALIZE", "IMUNOLOGIE"].includes(name.toUpperCase()))
      return false;

    // Allow common medical test names
    const validMedicalTerms = [
      "Hemoglobina",
      "HbA1c",
      "glicozilata",
      "Feritina",
      "Vitamina",
      "Colesterol",
      "Trigliceride",
      "Glicemie",
      "TSH",
      "T3",
      "T4",
      "FT3",
      "FT4",
      "Anti-TPO",
      "tiroidperoxidaza",
      "Cortizol",
      "PSA",
      "CEA",
      "AFP",
      "CA",
      "antigen",
      "prostatic",
      "Magneziu",
      "Calciu",
      "Potasiu",
      "seric",
      "Sideremie",
      "Homocistein",
      "Proteina",
      "Reactiva",
      "CRP",
      "Insulina",
      "HOMA",
      "Indice",
      "Fosfor",
      "Albumina",
      "Creatinina",
      "Uree",
      "Bilirubina",
      "VSH",
      "INR",
      "APTT",
      "Calcitonina",
      "PTH",
      "Parathormon",
      "Anticorpi",
      "HCV",
      "HBs",
      "Estradiol",
      "Prolactina"
    ];

    const hasValidTerm = validMedicalTerms.some(term =>
      name.toLowerCase().includes(term.toLowerCase())
    );

    // If it contains medical terms or looks like a test name, accept it
    return hasValidTerm || /^[A-Za-z0-9\s\-()]+$/.test(name);
  }

  cleanTestName(name) {
    // Clean up test names
    return name
      .replace(/^\^?\s*/, "") // Remove ^ and leading spaces
      .replace(/\s+$/, "") // Remove trailing spaces
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim();
  }

  isValidTestValue(value, hasComparisonSymbol = false) {
    if (!value || value.length === 0) return false;
    if (value.length > 50) return false; // Too long to be a test value

    // Must contain at least one digit (test values are numeric)
    if (!/[0-9]/.test(value)) return false;

    return true;
  }

  generateCSVFromExtractedData(extractedDataArray, idPrefix = '') {
    const headers = ["RequestID", "ProcDate", "AnCode", "StringValue"];
    const csvRows = [headers.join(",")];
    const procDate = this.formatProcDate(new Date());

    extractedDataArray.forEach((data) => {
      // Get patient name from PDF or table data
      const patientName =
        data.structuredData?.patientInfo?.name ||
        data.patientInfo?.nume ||
        "Unknown";

      // Get patient text (ID suffix)
      const patientText = data.patientInfo?.patientText || '';

      // Concatenate ID prefix with patient text
      const fullId = idPrefix + patientText;

      // Extract all test results (already stored by key)
      if (data.structuredData?.testResults) {
        const seenKeys = new Set();
        Object.entries(data.structuredData.testResults).forEach(([key, testData]) => {
          // Avoid duplicates per patient
          if (seenKeys.has(key)) return;
          seenKeys.add(key);

          const requestId = `${fullId}-${patientName}`;
          const row = [
            this.escapeCsvValue(requestId),
            this.escapeCsvValue(procDate),
            this.escapeCsvValue(key),
            this.escapeCsvValue(testData.value || ""),
          ];
          csvRows.push(row.join(","));
        });
      }
    });

    return csvRows.join("\n");
  }

  escapeCsvValue(value) {
    if (typeof value !== "string") value = String(value);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      value = '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  // Format date as M/D/YYYY HH:mm:ss with zero-padded time
  formatProcDate(date) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const m = date.getMonth() + 1; // 1-12 (no zero pad per example)
    const d = date.getDate();      // 1-31 (no zero pad per example)
    const yyyy = date.getFullYear();
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${m}/${d}/${yyyy} ${hh}:${mm}:${ss}`;
  }

  validateExportCompleteness(extractedDataArray, generatedCSV) {
    // Returns array of patients with missing data
    const issues = [];

    extractedDataArray.forEach((data) => {
      const patientName = data.structuredData?.patientInfo?.name ||
                         data.patientInfo?.nume || "Unknown";
      const testResults = data.structuredData?.testResults || {};

      // All tests in testResults are already keyed (no mapping needed)
      const testCount = Object.keys(testResults).length;

      const patientText = data.patientInfo?.patientText || '';

      // Count how many rows for this patient in CSV
      const csvRows = generatedCSV.split('\n').filter(row =>
        row.includes(patientText) && row.includes(patientName)
      ).length;

      // Warn if patient has tests that are missing from export
      if (testCount > 0 && csvRows === 0) {
        issues.push({
          patient: patientName,
          extractedTests: testCount,
          exportedRows: csvRows
        });
      }
    });

    return issues;
  }
}

// Export for use in content script
if (typeof module !== "undefined" && module.exports) {
  module.exports = PDFProcessor;
} else {
  window.PDFProcessor = PDFProcessor;
}
