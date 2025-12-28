# Sante PDF Batch Extractor

A Tampermonkey userscript for batch processing and extracting data from PDF medical reports on rezultateptmedici.clinica-sante.ro.

## Features

- **Batch Selection**: Add individual PDFs to a batch queue with "+ Batch" buttons next to each download link
- **Select All on Page**: Automatically select all PDFs on the current page
- **Auto-Navigate Pages**: Automatically navigate through all pages and select all PDFs
- **PDF Data Extraction**: Extract text and structured data from medical PDFs using PDF.js
- **CSV Export**: Export all extracted data to CSV format with patient information
- **Auto-Upload**: Automatically upload extracted data to teamm.work

## Installation

1. **Install Tampermonkey** in your browser:
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. **Install the userscript**:
   - Click the raw link: [sante-extractor.user.js](https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/sante-extractor.user.js)
   - Tampermonkey will open and ask to install
   - Click "Install"

## Usage

1. **Login to the Medical Portal**:
   - Navigate to `rezultateptmedici.clinica-sante.ro`
   - Login with your credentials

2. **Navigate to Results Page**:
   - Go to the page with the table of medical results
   - You should see download buttons (glyphicon-download icons) in the last column

3. **Using the Extension**:

   ### Individual PDF Selection
   - Click the blue **"+ Batch"** button next to any download link
   - The button will briefly show "Added" to confirm
   - The batch counter in the top-right panel will update

   ### Bulk Selection Options
   - **"Select All PDFs on Page"**: Adds all PDFs from current page to batch
   - **"Auto-Select All Pages"**: Automatically navigates through all pages and adds all PDFs

   ### Processing and Export
   - Click **"Process All PDFs"** in the top-right panel
   - The extension will download and process each PDF
   - Status display shows queue and processed counts
   - When complete, the button changes to **"Export Data"**
   - Click to download a CSV file with all extracted data

## What Gets Extracted

For each PDF, the extension extracts:

- **Patient Information**: Name, CNP, birth date, collection unit, barcode, dates
- **PDF Metadata**: Number of pages, file size, extraction timestamp
- **Structured Data**: Parsed medical values and test results

## Local Development

For testing changes locally without pushing to GitHub:

1. **Start a local server**:
   ```bash
   cd tampermonkey
   python3 -m http.server 8080
   ```

2. **Install the dev script** in Tampermonkey:
   - Open `sante-extractor.dev.user.js` and install it

3. **After making changes**, bump the cache version:
   ```bash
   ./bump.sh
   ```

4. **Refresh** the target page to load updated scripts

## Technical Notes

- Uses PDF.js library for text extraction (loaded via CDN)
- Uses GM.* APIs for cross-tab storage between domains
- Modular architecture with separate files for each component
- Processes PDFs client-side without sending data to external servers

## Customization

Edit files in the `tampermonkey/` folder:
- `test-config.js` - Add/modify medical test patterns (see ADDING_NEW_TESTS.md)
- `pdf-processor.js` - PDF text extraction logic
- `csv-handler.js` - CSV export format
- `ui-components.js` - User interface components

## Security

- All processing happens locally in your browser
- No data is sent to external servers (except teamm.work upload if used)
- Only works on the specified domains
