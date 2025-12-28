// Teamm Uploader v1.0.0
// Modified for Tampermonkey - uses StorageAdapter

console.log("🚀 Teamm uploader initialized");

async function waitForFileInput(timeout = 10000) {
  const selectors = [
    'input[type="file"][accept=".txt"]',
    'input[type="file"][style*="display: none"]',
    'input.ng-untouched[type="file"]',
    'input[type="file"][accept*="txt"]',
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("File input not found within timeout");
}

function createFileFromContent(content, filename) {
  const blob = new Blob([content], { type: "text/plain" });
  return new File([blob], filename, { type: "text/plain" });
}

function setFileOnInput(fileInput, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;

  const events = [
    new Event("change", { bubbles: true, composed: true }),
    new Event("input", { bubbles: true, composed: true }),
    new Event("blur", { bubbles: true }),
    new InputEvent("input", { bubbles: true, composed: true }),
    new InputEvent("change", { bubbles: true, composed: true }),
  ];

  events.forEach((event) => {
    fileInput.dispatchEvent(event);
  });

  console.log("✅ File set on input, events triggered");
}

function showTeammNotification(message, type = "success") {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "success" ? "#28a745" : "#dc3545"};
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10000;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    animation: slideIn 0.3s ease-out;
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideIn 0.3s ease-in reverse";
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

async function autoUploadFile() {
  try {
    console.log("🔍 Checking for pending upload...");

    // Use StorageAdapter instead of chrome.storage.local
    const result = await StorageAdapter.get(["pendingUpload"]);

    if (!result.pendingUpload) {
      console.log("ℹ️ No pending upload found");
      return;
    }

    const { content, filename, expiresAt } = result.pendingUpload;

    if (Date.now() > expiresAt) {
      console.warn("⚠️ Upload data expired (>5 minutes old), cleaning up");
      await StorageAdapter.remove("pendingUpload");
      showTeammNotification("⚠️ Upload data expired. Please export again.", "error");
      return;
    }

    console.log(`📤 Starting upload for file: ${filename}`);
    console.log(`📊 Content length: ${content.length} characters`);

    showTeammNotification("⏳ Searching for file input...", "success");

    const fileInput = await waitForFileInput();
    console.log(`📍 File input element:`, fileInput);

    const file = createFileFromContent(content, filename);
    console.log(`📄 Created File object:`, { name: file.name, size: file.size, type: file.type });

    setFileOnInput(fileInput, file);

    if (fileInput.files.length > 0) {
      console.log(`✅ File successfully set on input:`, fileInput.files[0].name);
      showTeammNotification(`✅ File uploaded: ${filename}`, "success");
    } else {
      throw new Error("File was not set on input (verification failed)");
    }

    await StorageAdapter.remove("pendingUpload");
    console.log("🧹 Storage cleaned up");
    console.log("🎉 Upload complete!");
  } catch (error) {
    console.error("❌ Upload failed:", error);
    showTeammNotification(`❌ Upload failed: ${error.message}`, "error");
    console.error("Debug info:", {
      url: window.location.href,
      readyState: document.readyState,
      bodyChildren: document.body?.children.length,
    });
  }
}

function showLoadingOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "sante-loading-overlay";
  overlay.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 20px;">
      <div style="width: 50px; height: 50px; border: 4px solid #e0e0e0; border-top: 4px solid #007cba; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="font-size: 18px; font-weight: bold; color: #333;">Se încarcă datele...</div>
    </div>
  `;
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(255, 255, 255, 0.9);
    display: flex; justify-content: center; align-items: center; z-index: 99999;
  `;

  const style = document.createElement("style");
  style.id = "sante-loading-style";
  style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("sante-loading-overlay");
  const style = document.getElementById("sante-loading-style");
  if (overlay) overlay.remove();
  if (style) style.remove();
}

function startUploadWithDelay() {
  console.log("⏳ Waiting 5 seconds for Angular to initialize...");
  showLoadingOverlay();
  setTimeout(() => {
    hideLoadingOverlay();
    console.log("🚀 Starting upload attempt...");
    autoUploadFile();
  }, 5000);
}

// Export for main entry point
window.startUploadWithDelay = startUploadWithDelay;
