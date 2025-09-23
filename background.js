// Simplified background script
let batchQueue = [];
let processedPDFs = [];

console.log('Background script loaded');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action);

  try {
    switch(message.action) {
      case 'addToBatch':
        batchQueue.push({
          id: message.id,
          elementId: message.elementId,
          patientData: message.patientData,
          elementIndex: message.elementIndex,
          timestamp: Date.now()
        });
        sendResponse({success: true, queueLength: batchQueue.length});
        break;

      case 'processBatch':
        sendResponse({success: true});
        break;

      case 'getBatchStatus':
        sendResponse({
          queueLength: batchQueue.length,
          processedCount: processedPDFs.length
        });
        break;

      case 'getBatchItems':
        sendResponse({
          items: batchQueue
        });
        break;

      case 'clearBatch':
        batchQueue = [];
        processedPDFs = [];
        sendResponse({success: true});
        break;

      default:
        sendResponse({error: 'Unknown action'});
    }
  } catch (error) {
    console.error('Background script error:', error);
    sendResponse({error: error.message});
  }

  return true; // Keep message channel open for async response
});

// Background script is now simplified - complex functionality moved to content script