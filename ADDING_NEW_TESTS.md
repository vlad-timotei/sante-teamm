# Adding New Lab Tests to the Extension

This guide explains exactly how to add a new lab test to the Clinica Sante Chrome extension.

## Overview

When adding a new lab test, you need to update **2 files**:
1. `pdf-processor.js` - For extraction and export
2. `content.js` - For table display

## Step-by-Step Guide

### Step 1: Add Test Extraction Pattern (`pdf-processor.js`)

**Location**: Around line 196-235, in the `specificTests` array

**What to add**:
```javascript
{ name: "Test Name", pattern: createTestPattern("Regex Pattern") },
```

**Example**:
```javascript
{ name: "D-Dimeri", pattern: createTestPattern("D[\\s-]?Dimer[i]?") },
{ name: "Sodiu seric", pattern: createTestPattern("Sodiu(\\s+seric)?") },
```

**Tips**:
- `name`: The full Romanian name as it should appear in the UI
- `pattern`: Use `createTestPattern()` which automatically handles the `^` symbol and value extraction
- Make the regex flexible to match variations (e.g., with/without spaces, diacritics)
- Use `\\s` for spaces, `[ăa]` for optional diacritics, `?` for optional parts

**Common patterns**:
- Simple test: `createTestPattern("TestName")`
- With spaces: `createTestPattern("Test\\s+Name")`
- Optional diacritics: `createTestPattern("Bilirubin[ăa]?")`
- Multiple variations: `createTestPattern("(Variation1|Variation2)")`

---

### Step 2: Add Export Slug Mapping (`pdf-processor.js`)

**Location**: Around line 463-498, in the `TEST_KEY_MAP` array

**What to add**:
```javascript
{ key: 'slug-name', re: /\b(pattern|variations)\b/i },
```

**Example**:
```javascript
{ key: 'd-dimeri', re: /\b(d[\s-]?dimer[i]?)\b/i },
{ key: 'na', re: /\b(sodiu(\s+seric)?|natriu)\b/i },
```

**Tips**:
- `key`: The slug that will appear in the CSV export's `AnCode` column
- `re`: A regex pattern to match the test name (case-insensitive with `/i`)
- Include all possible variations of the name (Romanian, English, abbreviations)
- Use `\b` word boundaries to avoid partial matches
- The regex should match the `name` you used in Step 1

---

### Step 3: Add to Display Order (`content.js`)

**Location**: Around line 1654-1688, in the `ORDER` array

**What to add**:
```javascript
"slug-name",
```

**Example**:
```javascript
"d-dimeri",
"na",
```

**Tips**:
- Add the slug exactly as defined in Step 2
- The position in this array determines the display order in the table
- Tests appear top-to-bottom in the order listed

---

### Step 4: Add Display Name (`content.js`)

**Location**: Around line 1688-1724, in the `DISPLAY` object

**What to add**:
```javascript
"slug-name": "Display Name",
```

**Example**:
```javascript
"d-dimeri": "D-Dimeri",
na: "Sodiu seric",
```

**Tips**:
- The key must match the slug from Step 2 (use quotes if it contains special characters like hyphens)
- The value is what users see in the table
- This can be different from the extraction name if you want a nicer display

---

## Complete Example: Adding "Creatinina"

Let's add a new test called "Creatinina" with slug "crea":

### 1. In `pdf-processor.js` (extraction pattern):
```javascript
// Around line 233, add to specificTests array:
{ name: "Creatinina", pattern: createTestPattern("Creatinin[ăa]?") },
```

### 2. In `pdf-processor.js` (slug mapping):
```javascript
// Around line 498, add to TEST_KEY_MAP array:
{ key: 'crea', re: /\b(creatinin[ăa]?|creatinine)\b/i },
```

### 3. In `content.js` (display order):
```javascript
// Around line 1687, add to ORDER array:
"APTT",
"d-dimeri",
"na",
"crea",  // Add here
```

### 4. In `content.js` (display name):
```javascript
// Around line 1723, add to DISPLAY object:
na: "Sodiu seric",
crea: "Creatinina",  // Add here
```

---

## Testing Your Changes

After adding a new test:

1. **Reload the extension** in Chrome:
   - Go to `chrome://extensions/`
   - Click the refresh icon on your extension

2. **Test with a PDF** that contains the test:
   - Navigate to Clinica Sante website
   - Open a patient record with a PDF containing the test
   - Click "Analizează PDF"
   - Verify the test appears in the table with the correct display name

3. **Check the CSV export**:
   - Export the data
   - Open the CSV file
   - Verify the test appears with the correct slug in the `AnCode` column

---

## Quick Reference: Slug Naming Conventions

Looking at existing tests, there are two common patterns:

### Pattern 1: Uppercase abbreviations
- `B12`, `TSH`, `FT4`, `PSA`, `VSH`, `INR`, `APTT`
- Used for: Well-known medical abbreviations

### Pattern 2: Full lowercase/mixed case names
- `FERITINA`, `HOMOCYSTEIN`, `Glu`, `HOMA`, `INS`
- Used for: Full test names or specific requirements

### Pattern 3: Lowercase with hyphens
- `d-dimeri`, `na`
- Used for: Custom requirements or compound names

**Choose the pattern that best fits your needs!**

---

## Common Regex Patterns

Here are some useful regex patterns for matching test names:

| Pattern | Matches | Example |
|---------|---------|---------|
| `Test` | Exact match | "Test" |
| `Test[s]?` | Optional 's' | "Test" or "Tests" |
| `Test[ăa]?` | Optional diacritic | "Testa" or "Testă" |
| `Test\\s+Name` | Space between words | "Test Name" |
| `Test[\\s-]?Name` | Optional space or hyphen | "Test Name", "Test-Name", "TestName" |
| `(Test1\|Test2)` | Either variant | "Test1" or "Test2" |
| `\\b` | Word boundary | Prevents matching inside words |

---

## Files Modified Checklist

When adding a new test, you should modify exactly **2 files**:

- [ ] `pdf-processor.js` - Add to `specificTests` array
- [ ] `pdf-processor.js` - Add to `TEST_KEY_MAP` array
- [ ] `content.js` - Add to `ORDER` array
- [ ] `content.js` - Add to `DISPLAY` object

That's it! 4 small changes across 2 files.
