// /static/js/offline-game.js or a new file like camera.js
import { showToast } from './common-ui.js';
import {submitLocationValidation} from './offline-game.js';

let mediaStream = null;

export async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported');
    }
    
    const cameraStreamElement = document.getElementById('camera-stream');
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        cameraStreamElement.srcObject = mediaStream;
        cameraStreamElement.play();
    } catch (err) {
        console.error('Failed to get media stream', err);
        showToast('Camera access denied or failed.', { type: 'error' });
        throw err;
    }
}

// NEW: Main function to handle the entire capture process
export function getSelfieBlob(locationId) {
    return new Promise((resolve, reject) => {
        const cameraStreamElement = document.getElementById('camera-stream');
        const captureButton = document.getElementById('capture-selfie-btn');

        // Capture button click handler
        captureButton.addEventListener('click', () => {
            const canvas = document.createElement('canvas');
            canvas.width = cameraStreamElement.videoWidth;
            canvas.height = cameraStreamElement.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(cameraStreamElement, 0, 0, canvas.width, canvas.height);

            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                cameraStreamElement.srcObject = null;
            }
            
            // Convert the canvas to a Blob and resolve the promise
            canvas.toBlob(blob => {
                if (blob) {
                    resolve({ blob, locationId });
                } else {
                    reject(new Error('Failed to create image blob.'));
                }
            }, 'image/jpeg', 0.8);
        }, { once: true }); // The event listener will automatically remove itself after being triggered.
    });
}


// // Event listener for the modal's capture button
// document.getElementById('capture-selfie-btn').addEventListener('click', async () => {
//     const cameraStreamElement = document.getElementById('camera-stream');
    
//     // Create a canvas element and draw the video frame to it
//     const canvas = document.createElement('canvas');
//     canvas.width = cameraStreamElement.videoWidth;
//     canvas.height = cameraStreamElement.videoHeight;
//     const context = canvas.getContext('2d');
//     context.drawImage(cameraStreamElement, 0, 0, canvas.width, canvas.height);

//     // Stop the video stream immediately after capturing
//     if (mediaStream) {
//         mediaStream.getTracks().forEach(track => track.stop());
//         cameraStreamElement.srcObject = null;
//     }
    
//     // Hide the modal
//     document.getElementById('selfie-modal').style.display = 'none';
    
//     // Convert the canvas to a Blob and submit
//     canvas.toBlob(blob => {
//         if (blob && currentSelfieLocationId) {
//             const result = {
//                 passed: true,
//                 mode: 'selfie',
//                 locationId: currentSelfieLocationId,
//                 metadata: { selfieSize: blob.size },
//                 needsValidation: true,
//                 photoBlob: blob
//             };
//             submitLocationValidation(result);
//         } else {
//             showToast('Failed to create image blob.', { type: 'error' });
//         }
//     }, 'image/jpeg', 0.8);
// });

// // Event listener to close the modal
// document.querySelector('#selfie-modal .close-btn').addEventListener('click', () => {
//     // Stop the camera stream if the user closes the modal
//     if (mediaStream) {
//         mediaStream.getTracks().forEach(track => track.stop());
//         document.getElementById('camera-stream').srcObject = null;
//     }
//     document.getElementById('selfie-modal').style.display = 'none';
// });