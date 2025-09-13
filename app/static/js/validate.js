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
  queueLocationValidation(clueId, 'selfie', { selfieBlob });
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


   
export function setupValidationButtons() {
  const gameDataDiv = document.getElementById('game-data');
  const gameId = gameDataDiv.dataset.gameId;

  // direct validation button
  const buttons = document.querySelectorAll('.btn-validate-direct');
  if (!buttons.length) {
    console.warn('No validation buttons found.');
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const locationId = btn.dataset.locationId;
      const index = parseInt(btn.dataset.clueIndex, 10);

      console.log(`validate: clue ${index} (locationId ${locationId}) clicked`);

      const result = {
        passed: true,
        mode: 'direct',
        locationId,
        metadata: {},
        needsValidation: false
      };

      submitLocationValidation(result, gameId);
    });
  });

  // Geo validation button
  const btnGeo = document.getElementById('btn-validate-geo');
  if (btnGeo) {
    btnGeo.addEventListener('click', async () => {
      const locationId = document.getElementById('location-id').value;
      const gameId = document.getElementById('game-id').value;
      try {
        const { lat: userLat, lon: userLon } = await getCurrentGeo();
        // placeholder target coordinates; replace with real clue coords
        const targetLat = userLat + 0.0001;
        const targetLon = userLon + 0.0001;
        const distance = haversine(userLat, userLon, targetLat, targetLon);
        const threshold = 30; // meters
        if (distance <= threshold) {
          submitLocationValidation({ passed: true, mode: 'geo', locationId, metadata: { distance }, needsValidation: false }, gameId);
        } else {
          submitLocationValidation({ passed: false, mode: 'geo', locationId, reason: `Too far (${distance.toFixed(1)}m)` }, gameId);
        }
      } catch (err) {
        showToast('Geolocation failed: ' + err, { type: 'error' });
      }
    });
  }
  //  document.querySelectorAll('.btn-validate-geo').forEach(btn => {
  //       btn.addEventListener('click', () => {
  //         const clueId = btn.dataset.clueId;
  //         navigator.geolocation.getCurrentPosition(
  //           pos => validateByGeo(clueId, pos),
  //           err => console.error('Geo error', err)
  //         );
  //       });
  //     });

  // Repeat for QR, Image, Selfie if implemented
  // QR: You’ll need to integrate a scanner and pass the result
  const btnQR = document.getElementById('btn-validate-qr');
  if (btnQR) {
    btnQR.addEventListener('click', () => {
      const locationId = document.getElementById('location-id').value;
      const gameId = document.getElementById('game-id').value;
      const scanned = prompt('Simulate QR scan: enter code');
      const expected = locationId; // example expectation
      if (validateQr(scanned, expected)) {
        submitLocationValidation({ passed: true, mode: 'qr', locationId, metadata: { scanned }, needsValidation: false }, gameId);
      } else {
        submitLocationValidation({ passed: false, mode: 'qr', locationId, reason: 'QR mismatch' }, gameId);
      }
    });
  }
      
  const btnImage = document.getElementById('btn-validate-image');
  if(btnImage){
    btnImage.addEventListener('click', () => {
      const locationId = document.getElementById('location-id').value;
      const gameId = document.getElementById('game-id').value;
      const score = imageMatchScore();
      const threshold = 0.7;
      if (score >= threshold) {
        submitLocationValidation({ passed: true, mode: 'image', locationId, metadata: { matchScore: score }, needsValidation: false }, gameId);
      } else {
        submitLocationValidation({ passed: false, mode: 'image', locationId, reason: `Score ${score.toFixed(2)} < ${threshold}` }, gameId);
      }
    });
  }

  // Selfie: Hook into a file input or webcam capture  
  const btnSelfie = document.getElementById('btn-validate-selfie');
  if (btnSelfie) {
    btnSelfie.addEventListener('click', async () => {
      const locationId = document.getElementById('location-id').value;
      const gameId = document.getElementById('game-id').value;
      try {
        const blob = await captureSelfieBlob();
        // In real app you’d upload the blob or store reference; here we inline metadata
        submitLocationValidation({ passed: true, mode: 'selfie', locationId, metadata: { selfieSize: blob.size }, needsValidation: true }, gameId);
      } catch (err) {
        showToast('Selfie capture failed: ' + err.message, { type: 'error' });
      }
    });
  }
}

// // Export setup function
// export { setupValidationButtons };