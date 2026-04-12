// Test Definitions v2.0.0
// Fetches from DB via API, falls back to hardcoded defaults

const DEFAULT_TEST_DEFINITIONS = [
  { key: "FERITINA", name: "Feritina", pattern: "Feritina" },
  { key: "TSB", name: "Bilirubina totală", pattern: "Bilirubin[ăa]?\\s+total[ăa]?" },
  { key: "DBIL", name: "Bilirubina directă", pattern: "Bilirubin[ăa]?\\s+direct[ăa]?" },
  { key: "IBIL", name: "Bilirubina indirectă", pattern: "Bilirubin[ăa]?\\s+indirect[ăa]?" },
  { key: "B12", name: "Vitamina B12", pattern: "Vitamina\\s+B12" },
  { key: "25OHD", name: "25-OH Vitamina D", pattern: "25-OH\\s+Vitamina\\s+D" },
  { key: "serum-folate", name: "Acid folic (folat) seric", pattern: "Acid\\s+folic(\\s*\\(folat\\))?\\s+seric" },
  { key: "lipase", name: "Lipaza", pattern: "Lipaz[ăa]?" },
  { key: "serum-amylase", name: "Amilaza serica", pattern: "Amilaz[ăa]?\\s+seric[ăa]?" },
  { key: "carcinoembryonic-antigen", name: "CEA (antigen carcinoembrionar)", pattern: "CEA(\\s*\\(antigen\\s+carcinoembrio[nt]ar\\))?" },
  { key: "hiv-agab-combo", name: "Testare HIV: anti HIV 1+2/Ag. p24 HIV-1", pattern: "Testare\\s+HIV" },
  { key: "HBA1C", name: "Hemoglobina glicozilată (HbA1c)", pattern: "Hemoglobina glicozilata\\s*\\(HbA1c\\)" },
  { key: "MG", name: "Magneziu seric", pattern: "Magneziu seric" },
  { key: "CA", name: "Calciu seric total", pattern: "Calciu seric total" },
  { key: "K", name: "Potasiu seric", pattern: "Potasiu seric" },
  { key: "IRON", name: "Sideremie", pattern: "Sideremie" },
  { key: "TSH", name: "TSH", pattern: "TSH" },
  { key: "FT4", name: "FT4", pattern: "FT4" },
  { key: "FT3", name: "FT3", pattern: "FT3" },
  { key: "CALCITONIN", name: "Calcitonina", pattern: "Calcitonin[ăa]?" },
  { key: "PTH", name: "Intact PTH (Parathormon)", pattern: "Intact\\s+PTH(\\s*\\(Parathormon\\))?" },
  { key: "ATPO", name: "Anti-TPO (Anti-tiroidperoxidaza)", pattern: "Anti[-\\s]?TPO(\\s*\\(Anti[-\\s]?tiroidperoxidaz[ăa]\\))?" },
  { key: "ACHCV", name: "Anticorpi anti-HCV", pattern: "Anticorpi\\s+anti[-\\s]?HCV" },
  { key: "AGHBS", name: "Antigen HBs", pattern: "Antigen\\s+HBs" },
  { key: "PSA", name: "PSA", pattern: "PSA" },
  { key: "VSH", name: "VSH", pattern: "VSH" },
  { key: "CA199", name: "CA 19-9", pattern: "CA\\s*19[-\\s]?9" },
  { key: "CA125", name: "CA 125", pattern: "CA\\s*125" },
  { key: "HOMOCYSTEIN", name: "Homocisteina", pattern: "Homocistein[ăa]?" },
  { key: "hsCRP", name: "Proteina C Reactivă HS", pattern: "Protein[ăa]?\\s+C\\s+[Rr]eactiv[ăa]?\\s+HS" },
  { key: "CRP", name: "Proteina C reactivă (CRP)", pattern: "Protein[ăa]?\\s+C\\s+[Rr]eactiv[ăa]?,?\\s+cantitativ\\s*\\(CRP\\)" },
  { key: "INR", name: "INR", pattern: "INR" },
  { key: "APTT", name: "APTT", pattern: "APTT" },
  { key: "HOMA", name: "Indice HOMA", pattern: "((Calcul\\s+)?Indice\\s+HOMA|HOMA)" },
  { key: "INS", name: "Insulina", pattern: "Insulin[ăa]?" },
  { key: "d-dimeri", name: "D-Dimeri", pattern: "D[\\s-]?Dimer[i]?" },
  { key: "na", name: "Sodiu seric", pattern: "Sodiu(\\s+seric)?" },
  { key: "estradiol", name: "Estradiol", pattern: "Estradiol" },
  { key: "prolactin", name: "Prolactina", pattern: "Prolactin[ăa]?" },
  { key: "peptid-c", name: "Peptid C", pattern: "Peptid(ul)?\\s*C" },
  { key: "serum-ionized-calcium", name: "Calciu ionic seric", pattern: "Calciu\\s+ionic(\\s+seric)?" },
  { key: "apolipoprotein-b", name: "Apolipoproteina B", pattern: "Apolipoproteina\\s+B" },
];

// Will be populated from API or defaults
window.TEST_DEFINITIONS = DEFAULT_TEST_DEFINITIONS;

// Called by content.js after SyncManager is initialized
async function loadTestDefinitions() {
  try {
    const result = await window.SyncManager.fetchTestDefinitions();
    if (result?.success && result.tests && result.tests.length > 0) {
      window.TEST_DEFINITIONS = result.tests;
      console.log(`[Tests] Loaded ${result.tests.length} test definitions from DB`);
    } else {
      console.log(`[Tests] Using ${DEFAULT_TEST_DEFINITIONS.length} default test definitions`);
    }
  } catch (e) {
    console.warn('[Tests] Failed to fetch from API, using defaults:', e);
  }
}

window.loadTestDefinitions = loadTestDefinitions;
