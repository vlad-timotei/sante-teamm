// Test Definitions - Single Source of Truth
// Array order = extraction order = display order
// To add a new test: add one object with { key, name, pattern }

const TEST_DEFINITIONS = [
  { key: "FERITINA", name: "Feritina", pattern: "Feritina" },
  { key: "TSB", name: "Bilirubina totală", pattern: "Bilirubin[ăa]?\\s+total[ăa]?" },
  { key: "DBIL", name: "Bilirubina directă", pattern: "Bilirubin[ăa]?\\s+direct[ăa]?" },
  { key: "IBIL", name: "Bilirubina indirectă", pattern: "Bilirubin[ăa]?\\s+indirect[ăa]?" },
  { key: "B12", name: "Vitamina B12", pattern: "Vitamina\\s+B12" },
  { key: "25OHD", name: "25-OH Vitamina D", pattern: "25-OH\\s+Vitamina\\s+D" },
  { key: "HBA1C", name: "Hemoglobina glicozilată (HbA1c)", pattern: "Hemoglobina glicozilata\\s*\\(HbA1c\\)" },
  { key: "MG", name: "Magneziu seric", pattern: "Magneziu seric" },
  { key: "CA", name: "Calciu seric total", pattern: "Calciu seric total" },
  { key: "K", name: "Potasiu seric", pattern: "Potasiu seric" },
  { key: "IRON", name: "Sideremie", pattern: "Sideremie" },
  { key: "Glu", name: "Glicemie", pattern: "(Glicemie|Glucoz[ăa]\\s+seric[ăa]?)" },
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
  { key: "HOMA", name: "Indice HOMA", pattern: "(Indice\\s+HOMA|HOMA)" },
  { key: "INS", name: "Insulina", pattern: "Insulin[ăa]?" },
  { key: "d-dimeri", name: "D-Dimeri", pattern: "D[\\s-]?Dimer[i]?" },
  { key: "na", name: "Sodiu seric", pattern: "Sodiu(\\s+seric)?" },
  { key: "estradiol", name: "Estradiol", pattern: "Estradiol" },
  { key: "prolactin", name: "Prolactina", pattern: "Prolactin[ăa]?" },
  { key: "peptid-c", name: "Peptid C", pattern: "Peptid(ul)?\\s*C" },
];

// Export for use in other scripts
if (typeof window !== "undefined") {
  window.TEST_DEFINITIONS = TEST_DEFINITIONS;
}
