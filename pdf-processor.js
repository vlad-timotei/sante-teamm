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

    // Try specific named tests first - using universal pattern approach
    const specificTests = [
      { name: "Feritina", pattern: createTestPattern("Feritina") },
      { name: "Vitamina B12", pattern: createTestPattern("Vitamina\\s+B12") },
      { name: "25-OH Vitamina D", pattern: createTestPattern("25-OH\\s+Vitamina\\s+D") },
      { name: "Hemoglobina glicozilata (HbA1c)", pattern: createTestPattern("Hemoglobina glicozilata\\s*\\(HbA1c\\)") },
      { name: "Cortizol", pattern: createTestPattern("Cortizol") },
      { name: "Magneziu seric", pattern: createTestPattern("Magneziu seric") },
      { name: "Sideremie", pattern: createTestPattern("Sideremie") },
      { name: "Colesterol total", pattern: createTestPattern("Colesterol total") },
      { name: "Trigliceride", pattern: createTestPattern("Trigliceride") },
      { name: "Glicemie", pattern: createTestPattern("Glicemie") },
      { name: "TSH", pattern: createTestPattern("TSH") },
      { name: "FT4", pattern: createTestPattern("FT4") },
      { name: "FT3", pattern: createTestPattern("FT3") },
      { name: "Anti-TPO (Anti-tiroidperoxidaza)", pattern: createTestPattern("Anti-TPO\\s*\\(Anti-tiroidperoxidaza\\)") },
      { name: "PSA", pattern: createTestPattern("PSA") },
      { name: "CEA", pattern: createTestPattern("CEA") },
      { name: "AFP", pattern: createTestPattern("AFP") },
    ];

    specificTests.forEach((test) => {
      console.log(`Looking for ${test.name} with pattern: ${test.pattern.source}`);
      let match;
      while ((match = test.pattern.exec(text)) !== null) {
        const rawValue = match[1];
        // Clean the value by removing < > symbols and extra spaces
        const cleanValue = rawValue.replace(/[<>]/g, '').trim();

        structuredData.testResults[test.name] = {
          value: cleanValue,
        };
        totalMatches++;
        console.log(`✅ Found ${test.name}: ${cleanValue} (raw: ${rawValue})`);
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
      "antigen",
      "prostatic",
      "Magneziu",
      "seric",
      "Sideremie",
      "Calciu",
      "Fosfor",
      "Albumina",
      "Creatinina",
      "Uree"
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

      // Extract all test results
      if (data.structuredData?.testResults) {
        const seenKeys = new Set();
        Object.entries(data.structuredData.testResults).forEach(([testName, testData]) => {
          const mappedKey = this.mapTestNameToKey(testName);
          // Only include mapped target keys and avoid duplicates per patient
          if (!mappedKey) return;
          if (seenKeys.has(mappedKey)) return;
          seenKeys.add(mappedKey);

          const requestId = `${fullId}-${patientName}`;
          const row = [
            this.escapeCsvValue(requestId),
            this.escapeCsvValue(procDate),
            this.escapeCsvValue(mappedKey),
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

  // Map raw test labels to target keys required for final docs
  // Target keys: B12, 25OHD, TSH, FT4, ATPO, HBA1C, FERITINA, IRON, PSA, VSH, HOMOCYSTEIN, TSB, CRP
  mapTestNameToKey(rawName) {
    const name = String(rawName || '').trim();
    if (!name) return null;

    // Common Romanian/English variants mapped to your exact keys
    const TEST_KEY_MAP = [
      { key: 'B12',          re: /\b(vitamina\s*b\s*12|vitamina\s*b12|b12|cobalamin)\b/i },
      { key: '25OHD',        re: /\b(25\s*[-\s\(]?oh[)\s]*\s*vitamina\s*d|25\s*[-\s]?oh\s*vitamin\s*d|vitamin\s*d.*25\s*[-\s]?oh|25[-\s]?hydroxy.*vitamin\s*d|25ohd)\b/i },
      { key: 'TSH',          re: /\b(tsh|thyroid\s*stimulating\s*hormone)\b/i },
      { key: 'FT4',          re: /\b(ft4|free\s*t4|thyroxine\s*liber[ăa]?|t4\s*liber)\b/i },
      { key: 'ATPO',         re: /\b(anti[-\s]?tpo|anti[-\s]?tiroidperoxidaz[ăa]|anti[-\s]?thyroid[-\s]?peroxidase|tpo\s*ab|tpoab)\b/i },
      { key: 'HBA1C',        re: /\b(hba1c|hemoglobin[ăa]?\s*glicozilat[ăa]?|hemoglobina\s*glicozilat[ăa]?|glycated\s*ha?emoglobin|a1c)\b/i },
      { key: 'FERITINA',     re: /\b(feritin[ăa]?|ferritin)\b/i },
      { key: 'IRON',         re: /\b(sideremie|serum\s*iron|\bfe\b|iron)\b/i },
      { key: 'PSA',          re: /\b(psa|prostate[-\s]?specific\s*antigen)\b/i },
      { key: 'VSH',          re: /\b(vsh|viteza\s*de\s*sedimentare|esr|sed[-\s]?rate)\b/i },
      { key: 'HOMOCYSTEIN',  re: /\b(homocistein[ăa]?|homocystein[e]?|hcy)\b/i },
      { key: 'TSB',          re: /\b(bilirubin[ăa]?\s*total[ăa]?|total\s*bilirubin|tsb)\b/i },
      { key: 'CRP',          re: /\b(protein[ăa]?\s*c\s*reactiv[ăa]?|crp|hs[-\s]?crp|c[-\s]?reactive\s*protein)\b/i },
    ];

    for (const { key, re } of TEST_KEY_MAP) {
      if (re.test(name)) return key;
    }
    return null;
  }

  // Removed code ID mapping per request; AnCode uses canonical key
}

// Export for use in content script
if (typeof module !== "undefined" && module.exports) {
  module.exports = PDFProcessor;
} else {
  window.PDFProcessor = PDFProcessor;
}
