// ==UserScript==
// @name         Sante PDF Batch Extractor
// @namespace    https://github.com/vlad-timotei/sante-teamm
// @version      1.1.0
// @description  Batch extract data from PDFs on rezultateptmedici.clinica-sante.ro
// @author       Vlad T
// @match        *://rezultateptmedici.clinica-sante.ro/*
// @match        *://teamm.work/admin/guests/intake-values-import-dumbrava*
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        unsafeWindow
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/storage-adapter.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/test-config.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/queue-manager.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/pdf-processor.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/ui-components.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/csv-handler.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/export-handler.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/batch-processor.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/content.js
// @require      https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/teamm-uploader.js
// @updateURL    https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/sante-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/vlad-timotei/sante-teamm/main/tampermonkey/sante-extractor.user.js
// @run-at       document-end
// @noframes
// ==/UserScript==

(function() {
  'use strict';

  console.log('🚀 Sante PDF Batch Extractor v1.1.0 loaded');

  // Make pdfjsLib available globally
  if (typeof pdfjsLib !== 'undefined') {
    window.pdfjsLib = pdfjsLib;
  }

  // Determine which page we're on and run appropriate code
  const currentURL = window.location.href;

  if (currentURL.includes('rezultateptmedici.clinica-sante.ro')) {
    console.log('📋 Running on Clinica Sante portal');
    // Initialize the main extension
    if (typeof window.initializeBatchExtension === 'function') {
      window.initializeBatchExtension();
    } else {
      console.error('❌ initializeBatchExtension not found');
    }
  } else if (currentURL.includes('teamm.work/admin/guests/intake-values-import-dumbrava')) {
    console.log('📤 Running on Teamm.work upload page');
    // Start the auto-upload process
    if (typeof window.startUploadWithDelay === 'function') {
      window.startUploadWithDelay();
    } else {
      console.error('❌ startUploadWithDelay not found');
    }
  }
})();
