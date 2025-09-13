//static/js/validate-selfie.js

// A global variable to hold the video stream object so we can stop it later
let mediaStream = null;

export async function captureSelfieBlob() {
    // Check for browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera access not supported on this device.', { type: 'error' });
        throw new Error('Camera not supported');
    }

    const cameraStreamElement = document.getElementById('camera-stream');
    const captureButton = document.getElementById('capture-selfie-btn');

    // 1. Get the camera stream
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        cameraStreamElement.srcObject = mediaStream;
        cameraStreamElement.play();
        
        // Show the camera view and hide the capture button initially
        document.querySelector('.camera-container').classList.remove('d-none');
        captureButton.textContent = 'Capture Selfie';

    } catch (err) {
        console.error('Failed to get media stream', err);
        showToast('Camera access denied or failed.', { type: 'error' });
        throw err;
    }

    // 2. Wait for the user to click the capture button
    return new Promise((resolve, reject) => {
        captureButton.onclick = () => {
            const videoWidth = cameraStreamElement.videoWidth;
            const videoHeight = cameraStreamElement.videoHeight;

            // Create a canvas element and draw the video frame to it
            const canvas = document.createElement('canvas');
            canvas.width = videoWidth;
            canvas.height = videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(cameraStreamElement, 0, 0, videoWidth, videoHeight);

            // Stop the video stream immediately
            mediaStream.getTracks().forEach(track => track.stop());
            cameraStreamElement.srcObject = null;

            // Convert the canvas content to a Blob
            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create image blob'));
                }
            }, 'image/jpeg', 0.8); // 0.8 is the quality
        };
    });
}


export async function captureSelfieBlob_OLD() {
    // Check for browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera access not supported on this device.', { type: 'error' });
        throw new Error('Camera not supported');
    }

    
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    // capture one frame to canvas
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // stop tracks
    stream.getTracks().forEach(t => t.stop());

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7);
    });
}

// export function validateBySelfie(clueId, photoBlob) {
//   // Assume photoBlob is from <input type="file"> or webcam
//   // You might store blob in IndexedDB or as base64 string
//   const reader = new FileReader();
//   reader.onload = () => {
//     queueLocationValidation(clueId, 'selfie', { photo: reader.result });
//   };
//   reader.readAsDataURL(photoBlob);
// }

