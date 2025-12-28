# Adding New Lab Tests

## Quick Start

To add a new lab test, edit **one file**: `tampermonkey/test-config.js`

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
| `Test[ăa]?` | Optional diacritic | "Testa" or "Testa" |
| `Test\\s+Name` | Space between words | "Test Name" |
| `Test[\\s-]?Name` | Optional space or hyphen | "Test Name", "Test-Name" |
| `(Test1\|Test2)` | Either variant | "Test1" or "Test2" |

## Testing Your Changes

### Production (GitHub)
1. Push your changes to the `main` branch
2. Wait a few minutes for GitHub's raw file cache to update
3. Refresh the target page - Tampermonkey will fetch the updated script

### Local Development
1. Start the local server: `cd tampermonkey && python3 -m http.server 8080`
2. Install `sante-extractor.dev.user.js` in Tampermonkey
3. After making changes, run `./bump.sh` to invalidate cache
4. Refresh the target page

## Files Overview

| File | Purpose |
|------|---------|
| `tampermonkey/test-config.js` | Single source of truth for test definitions |
| `tampermonkey/pdf-processor.js` | Uses TEST_DEFINITIONS for extraction |
| `tampermonkey/ui-components.js` | Uses TEST_DEFINITIONS for display |
| `tampermonkey/csv-handler.js` | Uses TEST_DEFINITIONS for export columns |
