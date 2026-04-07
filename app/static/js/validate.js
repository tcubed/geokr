// /static/js/validate.js
//import { sendOrQueue } from './offline-sync.js'; // Your unified offline-sync module
//import { offlineDB } from './offline-db.js';  // Your IndexedDB helper
//import { queueOfflineAction } from './localStorage.js'; // fallback queue for localStorage
import { showToast } from './common-ui.js';
import { haversine } from './map.js'; // distance calc helper
//import { showCurrentClue } from './clue-manager.js'; // Show current clue in UI
//import { GAME_DATA } from './globals.js';
import {submitLocationValidation} from './offline-game.js'; // main API wrapper for submitting validation
import { startCamera, stopCamera, captureCurrentSelfieBlob } from './camera.js';
import { startQRScanner, stopQRScanner } from './qr.js';

let activeSelfieContext = null;
let selfieModalHandlersBound = false;
let activeQrContext = null;
let qrModalHandlersBound = false;

const offlineDB = self.offlineDB; // Explicit for clarity
const sendOrQueue = self.sendOrQueue; // Explicit for clarity

// Unified queue function for all validation methods
async function queueLocationValidation(clueId, method, data = {}) {
  const validation = {
    clueId,
    method, // 'button', 'qr', 'image', 'geo', 'selfie', 'direct'
    data,
    timestamp: new Date().toISOString(),
  };

  try {
    await offlineDB.addUpdate(validation); // primary IndexedDB queue
    showFeedback('Validation queued successfully', 'success');
  } catch (err) {
    console.error('IndexedDB queue failed, falling back to localStorage', err);
    // fallback localStorage queue
    queueOfflineAction(validation);
    showFeedback('Validation queued offline', 'warning');
  }
}

// Validation triggers
export function validateByButton(clueId) {
  queueLocationValidation(clueId, 'button');
}

export function validateByQR(clueId, qrData) {
  queueLocationValidation(clueId, 'qr', { qrData });
}

export function validateByImage(clueId, imageMatchResult) {
  queueLocationValidation(clueId, 'image', { match: imageMatchResult });
}

export function validateByGeo(clueId, position) {
  queueLocationValidation(clueId, 'geo', {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy
  });
}

export function validateBySelfie(clueId, selfieBlob) {
  //queueLocationValidation(clueId, 'selfie', { selfieBlob });
  // Assume photoBlob is from <input type="file"> or webcam
  // You might store blob in IndexedDB or as base64 string
  const reader = new FileReader();
  reader.onload = () => {
    queueLocationValidation(clueId, 'selfie', { photo: reader.result });
  };
  reader.readAsDataURL(photoBlob);
}

// Validation result handlers
export function directMark(locationId) {
  return { passed: true, mode: 'direct', locationId, metadata: {}, needsValidation: false };
}

export function handleQrScan(scannedCode, expectedLocationId) {
  return {
    passed: true,
    mode: 'qr',
    locationId: expectedLocationId,
    metadata: { qrToken: scannedCode },
    needsValidation: false,
    requiresServerValidation: true,
  };
}

export function handleImageMatch(matchScore, threshold, locationId) {
  const passed = matchScore >= threshold;
  return passed
    ? { passed: true, mode: 'image', locationId, metadata: { matchScore }, needsValidation: false }
    : { passed: false, mode: 'image', locationId, reason: 'Match too weak' };
}

export function handleGeoProximity(currentLat, currentLon, locationLat, locationLon, thresholdMeters, locationId) {
  const distance = haversine(currentLat, currentLon, locationLat, locationLon);
  const passed = distance <= thresholdMeters;
  return passed
    ? { passed: true, mode: 'geo', locationId, metadata: { distance }, needsValidation: false }
    : { passed: false, mode: 'geo', locationId, reason: `Too far: ${distance.toFixed(1)}m` };
}

export function handleSelfieCapture(selfieBlob, locationId) {
  // Always passes, but needs validation
  return { passed: true, mode: 'selfie', locationId, metadata: { selfieBlob }, needsValidation: true };
}


function showFeedback(message, status) {
  // Replace with Bootstrap alert or your own DOM feedback
  console.log(`[${status.toUpperCase()}] ${message}`);
}

function getSelfieModalElements() {
  return {
    modal: document.getElementById('selfie-modal'),
    closeButton: document.querySelector('#selfie-modal .close-btn'),
    captureButton: document.getElementById('capture-selfie-btn'),
    fallbackButton: document.getElementById('selfie-fallback-btn'),
    retryButton: document.getElementById('selfie-retry-btn'),
    fileInput: document.getElementById('selfie-file-input')
  };
}

function getQrModalElements() {
  return {
    modal: document.getElementById('qr-modal'),
    closeButton: document.querySelector('#qr-modal .close-btn'),
    statusText: document.getElementById('qr-status-text'),
    resultText: document.getElementById('qr-result'),
  };
}

function resetSelfieFileInput() {
  const { fileInput } = getSelfieModalElements();
  if (fileInput) {
    fileInput.value = '';
  }
}

function closeSelfieModal() {
  const { modal } = getSelfieModalElements();
  stopCamera();
  resetSelfieFileInput();
  activeSelfieContext = null;
  if (modal) {
    modal.style.display = 'none';
  }
}

function closeQrModal() {
  const { modal, resultText, statusText } = getQrModalElements();
  stopQRScanner('qr-video');
  activeQrContext = null;
  if (statusText) {
    statusText.textContent = 'Starting back camera…';
  }
  if (resultText) {
    resultText.textContent = 'Awaiting scan…';
  }
  if (modal) {
    modal.style.display = 'none';
  }
}

async function submitSelfieValidation(photoBlob, locationId, gameId, extraMetadata = {}) {
  const result = {
    passed: true,
    mode: 'selfie',
    locationId,
    metadata: {
      selfieSize: photoBlob.size,
      ...extraMetadata
    },
    needsValidation: true,
    photoBlob
  };
  submitLocationValidation(result, gameId);
}

async function restartLiveSelfieCamera() {
  if (!activeSelfieContext) {
    return;
  }

  try {
    await startCamera();
  } catch (err) {
    console.error('[validate.js] Live camera start failed:', err);
    showToast(err.message, { type: 'warning', duration: 5000 });
  }
}

function initializeSelfieModal() {
  if (selfieModalHandlersBound) {
    return;
  }

  const { modal, closeButton, captureButton, fallbackButton, retryButton, fileInput } = getSelfieModalElements();
  if (!modal || !closeButton || !captureButton || !fallbackButton || !retryButton || !fileInput) {
    return;
  }

  closeButton.addEventListener('click', () => {
    closeSelfieModal();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeSelfieModal();
    }
  });

  captureButton.addEventListener('click', async () => {
    if (!activeSelfieContext) {
      return;
    }

    try {
      const { blob, locationId, usedInset } = await captureCurrentSelfieBlob(
        activeSelfieContext.locationId,
        activeSelfieContext.locationImageUrl
      );

      if (activeSelfieContext.locationImageUrl && !usedInset) {
        showToast('Captured without clue inset because the clue image could not be loaded.', {
          type: 'warning',
          duration: 5000
        });
      }

      const gameId = activeSelfieContext.gameId;
      closeSelfieModal();
      await submitSelfieValidation(blob, locationId, gameId, {
        captureSource: 'live_camera',
        usedInset
      });
    } catch (err) {
      console.error('[validate.js] Selfie capture failed:', err);
      showToast('Selfie capture failed: ' + err.message, { type: 'error', duration: 5000 });
      await restartLiveSelfieCamera();
    }
  });

  fallbackButton.addEventListener('click', () => {
    resetSelfieFileInput();
    fileInput.click();
  });

  retryButton.addEventListener('click', async () => {
    await restartLiveSelfieCamera();
  });

  fileInput.addEventListener('change', async (event) => {
    if (!activeSelfieContext) {
      resetSelfieFileInput();
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type || !file.type.startsWith('image/')) {
      showToast('Please choose an image file for alternate capture.', { type: 'error' });
      resetSelfieFileInput();
      return;
    }

    const { locationId, gameId } = activeSelfieContext;
    closeSelfieModal();
    await submitSelfieValidation(file, locationId, gameId, {
      captureSource: 'file_input',
      usedInset: false
    });
    showToast('Alternate capture selected. Uploading photo…', { type: 'success' });
  });

  selfieModalHandlersBound = true;
}

function initializeQrModal() {
  if (qrModalHandlersBound) {
    return;
  }

  const { modal, closeButton } = getQrModalElements();
  if (!modal || !closeButton) {
    return;
  }

  closeButton.addEventListener('click', () => {
    closeQrModal();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeQrModal();
    }
  });

  qrModalHandlersBound = true;
}

// A single function to set up all validation buttons using event delegation
export function setupValidationButtons() {
  initializeSelfieModal();
  initializeQrModal();

    // The container that holds all the dynamically generated location cards
    const container = document.querySelector('#locationAccordion');
    if (!container) return;

    // Use a single event listener on the parent container
    container.addEventListener('click', async (e) => {
        const button = e.target.closest('button');

        // Exit if the clicked element is not a button or is not a validation button
        if (!button || !button.matches('[class*="btn-validate-"]')) {
            return;
        }

        const parentCard = button.closest('.clue-card');
        if (!parentCard) {
            console.error('Error: Could not find parent clue-card element.', button);
            showToast('Validation failed: Missing location data.', { type: 'error' });
            return;
        }

        const locationId = parentCard.dataset.locationId;
        const locationImageUrl = button.dataset.locationImage; 
        

        const gameId = window.GAME_DATA.gameId;
        if (!locationId) {
            console.error('Error: Parent card is missing data-location-id attribute.', parentCard);
            showToast('Validation failed: Missing location data.', { type: 'error' });
            return;
        }
        
        // This is a common location to display a loading state or spinner
        // showToast('Processing...', { type: 'info' });

        // --- DIRECT VALIDATION ---
        if (button.matches('.btn-validate-direct')) {
            const index = parseInt(button.dataset.clueIndex, 10);
            console.log(`validate: clue ${index} (locationId ${locationId}) clicked`);
            
            const result = {
                passed: true,
                mode: 'direct',
                locationId,
                metadata: {},
                needsValidation: false
            };
            submitLocationValidation(result, gameId);
        }
        
        // --- GEOLOCATION VALIDATION ---
        else if (button.matches('#btn-validate-geo')) {
            try {
                const { lat: userLat, lon: userLon } = await getCurrentGeo();
                // IMPORTANT: Replace with actual target location coordinates for the current clue
                const targetLat = 0; // Replace with clue's latitude
                const targetLon = 0; // Replace with clue's longitude
                
                const distance = haversine(userLat, userLon, targetLat, targetLon);
                const threshold = 30; // meters
                
                const passed = distance <= threshold;
                const result = {
                    passed,
                    mode: 'geo',
                    locationId,
                    metadata: { distance },
                    needsValidation: false,
                    reason: !passed ? `Too far (${distance.toFixed(1)}m)` : null
                };
                submitLocationValidation(result, gameId);
            } catch (err) {
                showToast('Geolocation failed: ' + err.message, { type: 'error' });
            }
        }
        
        // --- SELFIE VALIDATION ---
        else if (button.matches('.btn-validate-selfie')) {
            console.log(`[validate.js] Selfie validation for locationId: ${locationId}`);

          const { modal } = getSelfieModalElements();
          activeSelfieContext = {
            locationId,
            locationImageUrl,
            gameId
          };

            modal.style.display = 'block';

            try {
                await startCamera();
            } catch (err) {
                console.error('[validate.js] Selfie capture failed:', err);
            showToast(err.message, { type: 'warning', duration: 5000 });
            }
        }
        
        // --- QR SCANNER VALIDATION ---
        else if (button.matches('.btn-validate-qr')) {
          const { modal, statusText, resultText } = getQrModalElements();
          if (!modal || !statusText || !resultText) {
            showToast('QR scanner UI is unavailable on this page.', { type: 'error' });
            return;
          }

          activeQrContext = { locationId, gameId };
          statusText.textContent = 'Starting back camera…';
          resultText.textContent = 'Awaiting scan…';
          modal.style.display = 'block';

          try {
            await startQRScanner({
              videoElementId: 'qr-video',
              canvasElementId: 'qr-canvas',
              onStatus: (message) => {
                statusText.textContent = message;
              },
              onResult: async (scannedCode) => {
                if (!activeQrContext) {
                  return;
                }

                resultText.textContent = `Scanned: ${scannedCode}`;
                const qrContext = activeQrContext;
                closeQrModal();

                const result = handleQrScan(scannedCode, qrContext.locationId);
                await submitLocationValidation(result, qrContext.gameId);
              },
              onError: (err) => {
                console.error('[validate.js] QR scanner failed:', err);
              }
            });
          } catch (err) {
            console.error('[validate.js] QR start failed:', err);
            showToast('QR scanning failed to start: ' + err.message, { type: 'warning', duration: 5000 });
          }
        }
        
        // --- IMAGE VALIDATION ---
        else if (button.matches('#btn-validate-image')) {
            // IMPORTANT: The imageMatchScore() function needs to be implemented
            const score = imageMatchScore();
            const threshold = 0.7;
            const passed = score >= threshold;
            
            const result = {
                passed,
                mode: 'image',
                locationId,
                metadata: { matchScore: score },
                needsValidation: false,
                reason: !passed ? `Score ${score.toFixed(2)} < ${threshold}` : null
            };
            submitLocationValidation(result, gameId);
        }
    });
}
   
// export function setupValidationButtons_OLD() {
//   const gameDataDiv = document.getElementById('game-data');
//   const gameId = gameDataDiv.dataset.gameId;

//   // direct validation button
//   const buttons = document.querySelectorAll('.btn-validate-direct');
//   if (!buttons.length) {
//     console.warn('No validation buttons found.');
//     return;
//   }

//   buttons.forEach(btn => {
//     btn.addEventListener('click', () => {
//       const locationId = btn.dataset.locationId;
//       const index = parseInt(btn.dataset.clueIndex, 10);

//       console.log(`validate: clue ${index} (locationId ${locationId}) clicked`);

//       const result = {
//         passed: true,
//         mode: 'direct',
//         locationId,
//         metadata: {},
//         needsValidation: false
//       };

//       submitLocationValidation(result, gameId);
//     });
//   });

//   // Geo validation button
//   const btnGeo = document.getElementById('btn-validate-geo');
//   if (btnGeo) {
//     btnGeo.addEventListener('click', async () => {
//       const locationId = document.getElementById('location-id').value;
//       const gameId = document.getElementById('game-id').value;
//       try {
//         const { lat: userLat, lon: userLon } = await getCurrentGeo();
//         // placeholder target coordinates; replace with real clue coords
//         const targetLat = userLat + 0.0001;
//         const targetLon = userLon + 0.0001;
//         const distance = haversine(userLat, userLon, targetLat, targetLon);
//         const threshold = 30; // meters
//         if (distance <= threshold) {
//           submitLocationValidation({ passed: true, mode: 'geo', locationId, metadata: { distance }, needsValidation: false }, gameId);
//         } else {
//           submitLocationValidation({ passed: false, mode: 'geo', locationId, reason: `Too far (${distance.toFixed(1)}m)` }, gameId);
//         }
//       } catch (err) {
//         showToast('Geolocation failed: ' + err, { type: 'error' });
//       }
//     });
//   }
//   //  document.querySelectorAll('.btn-validate-geo').forEach(btn => {
//   //       btn.addEventListener('click', () => {
//   //         const clueId = btn.dataset.clueId;
//   //         navigator.geolocation.getCurrentPosition(
//   //           pos => validateByGeo(clueId, pos),
//   //           err => console.error('Geo error', err)
//   //         );
//   //       });
//   //     });

//   // Repeat for QR, Image, Selfie if implemented
//   // QR: You’ll need to integrate a scanner and pass the result
//   const btnQR = document.getElementById('btn-validate-qr');
//   if (btnQR) {
//     btnQR.addEventListener('click', () => {
//       const locationId = document.getElementById('location-id').value;
//       const gameId = document.getElementById('game-id').value;
//       const scanned = prompt('Simulate QR scan: enter code');
//       const expected = locationId; // example expectation
//       if (validateQr(scanned, expected)) {
//         submitLocationValidation({ passed: true, mode: 'qr', locationId, metadata: { scanned }, needsValidation: false }, gameId);
//       } else {
//         submitLocationValidation({ passed: false, mode: 'qr', locationId, reason: 'QR mismatch' }, gameId);
//       }
//     });
//   }
      
//   const btnImage = document.getElementById('btn-validate-image');
//   if(btnImage){
//     btnImage.addEventListener('click', () => {
//       const locationId = document.getElementById('location-id').value;
//       const gameId = document.getElementById('game-id').value;
//       const score = imageMatchScore();
//       const threshold = 0.7;
//       if (score >= threshold) {
//         submitLocationValidation({ passed: true, mode: 'image', locationId, metadata: { matchScore: score }, needsValidation: false }, gameId);
//       } else {
//         submitLocationValidation({ passed: false, mode: 'image', locationId, reason: `Score ${score.toFixed(2)} < ${threshold}` }, gameId);
//       }
//     });
//   }

//   // Selfie: Hook into a file input or webcam capture  
//   const btnSelfie = document.getElementById('btn-validate-selfie');
//   if (btnSelfie) {
//     btnSelfie.addEventListener('click', async () => {
//       const locationId = document.getElementById('location-id').value;
//       const gameId = document.getElementById('game-id').value;
//       try {
//         const blob = await captureSelfieBlob();
//         // In real app you’d upload the blob or store reference; here we inline metadata
//         submitLocationValidation({ passed: true, mode: 'selfie', locationId, metadata: { selfieSize: blob.size }, needsValidation: true }, gameId);
//       } catch (err) {
//         showToast('Selfie capture failed: ' + err.message, { type: 'error' });
//       }
//     });
//   }
// }

// // Export setup function
// export { setupValidationButtons };