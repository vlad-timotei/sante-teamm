# Sante PDF Batch Extractor

A Chrome extension for batch processing and extracting data from PDF medical reports on rezultateptmedici.clinica-sante.ro.

## Features

- **Batch Selection**: Add individual PDFs to a batch queue with "+ Batch" buttons next to each download link
- **Select All on Page**: Automatically select all PDFs on the current page
- **Auto-Navigate Pages**: Automatically navigate through all pages and select all PDFs
- **PDF Data Extraction**: Extract text and structured data from medical PDFs using PDF.js
- **CSV Export**: Export all extracted data to CSV format with patient information

## Installation

1. **Load the Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top-right corner
   - Click "Load unpacked" and select the `sante` folder

2. **Verify Installation**:
   - The extension should appear in your extensions list
   - You may need to pin it to your toolbar for easy access

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
   - The button will briefly show "✓ Added" to confirm
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
- **Text Content**: Full text extracted from all pages
- **Structured Data**: Parsed medical values, test results, and dates

## CSV Export Format

The exported CSV includes columns for:
- Nr Doc, Nume, CNP, Data Nasterii
- Unitate Recoltare, Cod Bare, Data Recoltare, Data Rezultate
- Pages, Extraction Date, Full Text, Structured Data (JSON)

## Troubleshooting

- **Extension not appearing**: Make sure you're on the correct domain
- **Batch buttons not showing**: Refresh the page and wait for it to fully load
- **PDF processing fails**: Check browser console for errors, ensure PDF.js loads properly
- **Auto-navigation not working**: Try manual page selection first

## Technical Notes

- Uses PDF.js library for text extraction
- Handles ASPX postback mechanisms for PDF downloads
- Processes PDFs client-side without sending data to external servers
- Supports Chrome Manifest V3

## Customization

You can modify `pdf-processor.js` to:
- Add custom data extraction patterns
- Change the output CSV format
- Add specific medical report parsing logic

## Security

- All processing happens locally in your browser
- No data is sent to external servers
- Only works on the specified medical portal domain