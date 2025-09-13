// /static/js/validate.js
//import { sendOrQueue } from './offline-sync.js'; // Your unified offline-sync module
//import { offlineDB } from './offline-db.js';  // Your IndexedDB helper
//import { queueOfflineAction } from './localStorage.js'; // fallback queue for localStorage
import { showToast } from './common-ui.js';
import { haversine } from './map.js'; // distance calc helper
import {gameState,gameId,loadState,saveState} from './localStorage.js'; // Load game state
//import { showCurrentClue } from './clue-manager.js'; // Show current clue in UI
//import { GAME_DATA } from './globals.js';
import {submitLocationValidation} from './offline-game.js'; // main API wrapper for submitting validation
import { captureSelfieBlob } from '/static/js/validate-selfie.js';
import { startCamera, getSelfieBlob} from './camera.js';

// Declare the variable in the global scope of the module
let currentSelfieLocationId = null;

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
  const passed = scannedCode === expectedLocationId;
  return passed
    ? { passed: true, mode: 'qr', locationId: expectedLocationId, metadata: { scannedCode }, needsValidation: false }
    : { passed: false, mode: 'qr', locationId: expectedLocationId, reason: 'QR mismatch' };
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

// A single function to set up all validation buttons using event delegation
export function setupValidationButtons() {
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

            // // Disable the button to prevent multiple captures
            // button.disabled = true;

            // try {
            //     const photoBlob = await captureSelfieBlob();
            //     // After a successful capture, the camera stream will be stopped.
            //     // Re-enable the button if needed, or handle as part of the next step.
            //     button.disabled = false;

            //     const result = {
            //         passed: true, // Assuming local capture is a "pass" for now
            //         mode: 'selfie',
            //         locationId: locationId,
            //         metadata: { selfieSize: photoBlob.size },
            //         needsValidation: true, // The selfie still needs server validation
            //         photoBlob
            //     };
            //     // Log the result object to verify the locationId is present
            //     console.log('[validate.js] Result object:', result);
            //     submitLocationValidation(result, gameId);
            // } catch (err) {
            //     console.log('[validate.js] '+err.message)
            //     showToast('Selfie capture failed: ' + err.message, { type: 'error' });
            //     button.disabled = false; // Re-enable button on failure
            // }
            // currentSelfieLocationId = button.closest('.clue-card').dataset.locationId;

            // const modal = document.getElementById('selfie-modal');
            // modal.style.display = 'block';

            // // Now, start the camera feed
            // try {
            //     await startCamera();
            // } catch (err) {
            //     // Handle camera failure
            //     modal.style.display = 'none';
            // }
            console.log(`[validate.js] Selfie validation for locationId: ${locationId}`);
            
            const modal = document.getElementById('selfie-modal');
            modal.style.display = 'block';

            try {
                // 1. Start the camera and show the modal
                await startCamera();

                // 2. Wait for the user to capture the selfie
                const { blob: photoBlob, locationId: capturedLocationId } = await getSelfieBlob(locationId);

                // 3. Hide the modal and submit the validation
                modal.style.display = 'none';

                const result = {
                    passed: true,
                    mode: 'selfie',
                    locationId: capturedLocationId,
                    metadata: { selfieSize: photoBlob.size },
                    needsValidation: true,
                    photoBlob
                };
                submitLocationValidation(result, gameId);

            } catch (err) {
                console.error('[validate.js] Selfie capture failed:', err);
                showToast('Selfie capture failed: ' + err.message, { type: 'error' });
                modal.style.display = 'none';
            }



        }
        
        // --- QR SCANNER VALIDATION ---
        else if (button.matches('#btn-validate-qr')) {
            const scanned = prompt('Simulate QR scan: enter code');
            // IMPORTANT: Replace with the actual expected code for the current clue
            const expected = 'some-expected-code';
            const passed = validateQr(scanned, expected);
            
            const result = {
                passed,
                mode: 'qr',
                locationId,
                metadata: { scanned },
                needsValidation: false,
                reason: !passed ? 'QR mismatch' : null
            };
            submitLocationValidation(result, gameId);
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