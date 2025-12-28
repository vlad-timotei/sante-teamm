// PDF Processor v1.0.0
// Modified for Tampermonkey - uses StorageAdapter for worker URL

class PDFProcessor {
  constructor() {
    this.loadPDFJS();
  }

  async loadPDFJS() {
    // PDF.js should already be loaded via @require
    if (typeof pdfjsLib !== "undefined") {
      // Set worker source via StorageAdapter (CDN URL)
      pdfjsLib.GlobalWorkerOptions.workerSrc = StorageAdapter.getWorkerURL();
      return;
    }

    // Fallback: wait a bit and try again
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (typeof pdfjsLib !== "undefined") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = StorageAdapter.getWorkerURL();
    } else {
      console.error("PDF.js library not loaded");
      throw new Error("PDF.js library not available");
    }
  }

  async extractTextFromPDF(arrayBuffer, patientData) {
    try {
      console.log("Starting PDF text extraction...");
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

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log("Processing page", pageNum);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        let pageText = "";
        let lastY = null;

        textContent.items.forEach((item) => {
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

      extractedData.structuredData = this.extractMedicalData(fullText, patientData);
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
    const structuredData = {
      reportInfo: {},
      patientInfo: {},
      testResults: {},
    };

    const reportNumberMatch = text.match(/Buletin de analize medicale nr\.\s*(\d+)/);
    if (reportNumberMatch) {
      structuredData.reportInfo.bulletinNumber = reportNumberMatch[1];
    }

    const reportDateMatch = text.match(/Data raportului:\s*([0-9.]+\s+[0-9:]+)/);
    if (reportDateMatch) {
      structuredData.reportInfo.reportDate = reportDateMatch[1];
    }

    const patientNameMatch = text.match(/Nume\/Prenume:\s*([^]*?)(?=Data cerere|$)/);
    if (patientNameMatch) {
      const cleanName = patientNameMatch[1].replace(/\s+/g, " ").trim();
      structuredData.patientInfo.name = cleanName;
      console.log(`📝 Extracted patient name: "${cleanName}"`);
    } else {
      const fallbackMatch = text.match(/Nume\/Prenume:\s*([^\n]+)/);
      if (fallbackMatch) {
        structuredData.patientInfo.name = fallbackMatch[1].trim();
        console.log(`📝 Extracted patient name (fallback): "${fallbackMatch[1].trim()}"`);
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

    const collectionDateMatch = text.match(/Data si ora recoltare:\s*([0-9.\s:]+)/);
    if (collectionDateMatch) {
      structuredData.patientInfo.collectionDate = collectionDateMatch[1].trim();
    }

    this.extractAllTestValues(text, structuredData);

    return structuredData;
  }

  extractAllTestValues(text, structuredData) {
    console.log("Extracting test values from Clinica Sante format...");
    console.log("Looking in text:", text.substring(0, 2000));

    const testPatterns = [
      /([<>]?\s*[0-9.,]+)\s+([A-Za-z0-9\s\-()]{5,50}?)\s+\[([0-9.,\s\-<>]+)\]/g,
      /([<>]?\s*[0-9.,]+)\s+Feritina\s+\[([0-9.,\s\-<>]+)\]\s+([a-zA-Z\/]+)/g,
      /([<>]?\s*[0-9.,]+)\s+\^?\s*Vitamina\s+B12\s+\[([0-9.,\s\-<>]+)\]\s+([a-zA-Z\/]+)/g,
      /([<>]?\s*[0-9.,]+)\s+\^?\s*25-OH\s+Vitamina\s+D\s+\[([0-9.,\s\-<>]+)\]/g,
      /([<>]?\s*[0-9.,]+)\s+\^?\s*([A-Za-z0-9\s\-]{3,25}?)\s+\[([0-9.,\s\-<>]+)\]\s*([a-zA-Z\/]*)/g,
      /([<>]?\s*[0-9.,]+)\s+([A-Za-z0-9\s\-]{3,25}?)\s+\[([0-9.,\s\-<>]+)\]\s*([a-zA-Z\/]*)/g,
    ];

    let totalMatches = 0;

    const createTestPattern = (testName) => {
      const pattern = new RegExp(`([<>]?\\s*[0-9.,]+)\\s+\\^?\\s*${testName}`, 'g');
      console.log(`Created pattern for "${testName}": ${pattern.source}`);
      return pattern;
    };

    // Use TEST_DEFINITIONS from test-config.js (single source of truth)
    window.TEST_DEFINITIONS.forEach((test) => {
      const pattern = createTestPattern(test.pattern);
      console.log(`Looking for ${test.name} with pattern: ${pattern.source}`);
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rawValue = match[1];
        const cleanValue = rawValue.replace(/[<>]/g, '').trim();
        const hasComparisonSymbol = /[<>]/.test(rawValue);

        if (!this.isValidTestValue(cleanValue, hasComparisonSymbol)) {
          console.log(`❌ Rejected invalid value for ${test.name}: "${cleanValue}"`);
          continue;
        }

        structuredData.testResults[test.key] = {
          value: cleanValue,
        };
        totalMatches++;
        console.log(`✅ Found ${test.key}: ${cleanValue} (raw: ${rawValue})`);
      }
    });

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
          value = rawValue.replace(/[<>]/g, '').trim();
          testName = match[2] ? match[2].trim() : "Unknown";
          testName = this.cleanTestName(testName);

          console.log(`Found potential test: "${testName}" = ${value} (raw: ${rawValue})`);

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
    if (["UM", "ANALIZE", "IMUNOLOGIE"].includes(name.toUpperCase())) return false;

    const validMedicalTerms = [
      "Hemoglobina", "HbA1c", "glicozilata", "Feritina", "Vitamina", "Colesterol",
      "Trigliceride", "Glicemie", "TSH", "T3", "T4", "FT3", "FT4", "Anti-TPO",
      "tiroidperoxidaza", "Cortizol", "PSA", "CEA", "AFP", "CA", "antigen",
      "prostatic", "Magneziu", "Calciu", "Potasiu", "seric", "Sideremie",
      "Homocistein", "Proteina", "Reactiva", "CRP", "Insulina", "HOMA", "Indice",
      "Fosfor", "Albumina", "Creatinina", "Uree", "Bilirubina", "VSH", "INR",
      "APTT", "Calcitonina", "PTH", "Parathormon", "Anticorpi", "HCV", "HBs",
      "Estradiol", "Prolactina"
    ];

    const hasValidTerm = validMedicalTerms.some(term =>
      name.toLowerCase().includes(term.toLowerCase())
    );

    return hasValidTerm || /^[A-Za-z0-9\s\-()]+$/.test(name);
  }

  cleanTestName(name) {
    return name
      .replace(/^\^?\s*/, "")
      .replace(/\s+$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  isValidTestValue(value, hasComparisonSymbol = false) {
    if (!value || value.length === 0) return false;
    if (value.length > 50) return false;
    if (!/[0-9]/.test(value)) return false;
    return true;
  }

  generateCSVFromExtractedData(extractedDataArray, idPrefix = '', filterExported = false) {
    const headers = ["RequestID", "ProcDate", "AnCode", "StringValue"];
    const csvRows = [headers.join(",")];
    const procDate = this.formatProcDate(new Date());

    extractedDataArray.forEach((data) => {
      const patientName = data.structuredData?.patientInfo?.name || data.patientInfo?.nume || "Unknown";
      const patientText = data.patientInfo?.patientText || '';
      const fullId = idPrefix + patientText;
      const exportedTests = data.exportedTests || {};

      if (data.structuredData?.testResults) {
        const seenKeys = new Set();
        Object.entries(data.structuredData.testResults).forEach(([key, testData]) => {
          if (seenKeys.has(key)) return;
          seenKeys.add(key);

          if (filterExported && exportedTests[key]) {
            return;
          }

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
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      value = '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  formatProcDate(date) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const yyyy = date.getFullYear();
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${m}/${d}/${yyyy} ${hh}:${mm}:${ss}`;
  }

  validateExportCompleteness(extractedDataArray, generatedCSV) {
    const issues = [];

    extractedDataArray.forEach((data) => {
      const patientName = data.structuredData?.patientInfo?.name || data.patientInfo?.nume || "Unknown";
      const testResults = data.structuredData?.testResults || {};
      const testCount = Object.keys(testResults).length;
      const patientText = data.patientInfo?.patientText || '';

      const csvRows = generatedCSV.split('\n').filter(row =>
        row.includes(patientText) && row.includes(patientName)
      ).length;

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

window.PDFProcessor = PDFProcessor;
