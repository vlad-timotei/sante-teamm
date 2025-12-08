# Adding New Lab Tests to the Extension

## Quick Start

To add a new lab test, edit **one file**: `test-config.js`

Add a new object to the `TEST_DEFINITIONS` array:

```javascript
{ key: "NEWTEST", name: "New Test Name", pattern: "Pattern\\s+To\\s+Match" },
```

That's it! The extension will automatically:
- Extract the test value from PDFs
- Display it in the UI with the correct name
- Export it to CSV with the correct key

## Field Reference

| Field | Description | Example |
|-------|-------------|---------|
| `key` | Export key for CSV (AnCode column) | `"B12"`, `"peptid-c"` |
| `name` | Display name shown in UI | `"Vitamina B12"`, `"Peptid C"` |
| `pattern` | Regex pattern to match in PDF text | `"Vitamina\\s+B12"` |

## Array Order Matters

The position in the array determines:
1. **Extraction order** - More specific patterns should come before general ones
2. **Display order** - Tests appear in the UI in array order

## Example: Adding Creatinina

```javascript
const TEST_DEFINITIONS = [
  // ... existing tests ...
  { key: "CREA", name: "Creatinina", pattern: "Creatinin[ăa]?" },
];
```

## Common Regex Patterns

| Pattern | Matches | Example |
|---------|---------|---------|
| `Test` | Exact match | "Test" |
| `Test[ăa]?` | Optional diacritic | "Testa" or "Testă" |
| `Test\\s+Name` | Space between words | "Test Name" |
| `Test[\\s-]?Name` | Optional space or hyphen | "Test Name", "Test-Name" |
| `(Test1\|Test2)` | Either variant | "Test1" or "Test2" |

## Testing Your Changes

1. Reload the extension in Chrome (`chrome://extensions/` → refresh icon)
2. Navigate to Clinica Sante and open a PDF containing your test
3. Click "Analizează PDF"
4. Verify the test appears in the table
5. Export and check the CSV contains the correct key

## Files Overview

- `test-config.js` - Single source of truth for all test definitions
- `pdf-processor.js` - Uses TEST_DEFINITIONS for extraction
- `content.js` - Uses TEST_DEFINITIONS for display
- `manifest.json` - Loads test-config.js before other scripts
