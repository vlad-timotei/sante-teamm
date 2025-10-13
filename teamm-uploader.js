// teamm-uploader.js - Auto-upload file to teamm.work
// This content script runs on teamm.work/admin/guests/intake-values-import-dumbrava

console.log('🚀 Teamm uploader initialized');

// Wait for file input to appear (handles dynamic loading)
async function waitForFileInput(timeout = 10000) {
  const selectors = [
    'input[type="file"][accept=".txt"]',
    'input[type="file"][style*="display: none"]',
    'input.ng-untouched[type="file"]',
    'input[type="file"][accept*="txt"]'
  ];

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) {
        console.log(`✅ Found file input with selector: ${selector}`);
        return input;
      }
    }
    // Wait 100ms before trying again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error('File input not found within timeout');
}

// Create File object from content
function createFileFromContent(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  return new File([blob], filename, { type: 'text/plain' });
}

// Set file on input using DataTransfer API
function setFileOnInput(fileInput, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;

  // Trigger all events that Angular might listen to
  const events = [
    new Event('change', { bubbles: true, composed: true }),
    new Event('input', { bubbles: true, composed: true }),
    new Event('blur', { bubbles: true }),
    new InputEvent('input', { bubbles: true, composed: true }),
    new InputEvent('change', { bubbles: true, composed: true })
  ];

  events.forEach(event => {
    fileInput.dispatchEvent(event);
  });

  console.log('✅ File set on input, events triggered');
}

// Show notification on page
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#28a745' : '#dc3545'};
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10000;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    animation: slideIn 0.3s ease-out;
  `;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease-in reverse';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Main upload logic
async function autoUploadFile() {
  try {
    console.log('🔍 Checking for pending upload...');

    // Get stored file data
    const result = await chrome.storage.local.get(['pendingUpload']);

    if (!result.pendingUpload) {
      console.log('ℹ️ No pending upload found');
      return;
    }

    const { content, filename, expiresAt } = result.pendingUpload;

    // Check if data is expired
    if (Date.now() > expiresAt) {
      console.warn('⚠️ Upload data expired (>5 minutes old), cleaning up');
      await chrome.storage.local.remove('pendingUpload');
      showNotification('⚠️ Upload data expired. Please export again.', 'error');
      return;
    }

    console.log(`📤 Starting upload for file: ${filename}`);
    console.log(`📊 Content length: ${content.length} characters`);

    // Show progress notification
    showNotification('⏳ Searching for file input...', 'success');

    // Wait for file input to be available
    const fileInput = await waitForFileInput();
    console.log(`📍 File input element:`, fileInput);

    // Create File object
    const file = createFileFromContent(content, filename);
    console.log(`📄 Created File object:`, {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Set file on input
    setFileOnInput(fileInput, file);

    // Verify file was set
    if (fileInput.files.length > 0) {
      console.log(`✅ File successfully set on input:`, fileInput.files[0].name);
      showNotification(`✅ File uploaded: ${filename}`, 'success');
    } else {
      throw new Error('File was not set on input (verification failed)');
    }

    // Clean up storage
    await chrome.storage.local.remove('pendingUpload');
    console.log('🧹 Storage cleaned up');

    console.log('🎉 Upload complete!');

  } catch (error) {
    console.error('❌ Upload failed:', error);
    showNotification(`❌ Upload failed: ${error.message}`, 'error');

    // Log additional debug info
    console.error('Debug info:', {
      url: window.location.href,
      readyState: document.readyState,
      bodyChildren: document.body?.children.length
    });
  }
}

// Run when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoUploadFile);
} else {
  // If document is already loaded, run immediately
  autoUploadFile();
}

// Also try after a short delay in case Angular needs time to initialize
setTimeout(() => {
  // Check if we haven't processed yet
  chrome.storage.local.get(['pendingUpload'], (result) => {
    if (result.pendingUpload) {
      console.log('🔄 Retrying upload after delay...');
      autoUploadFile();
    }
  });
}, 2000);
