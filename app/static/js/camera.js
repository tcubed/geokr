let mediaStream = null;

const CAMERA_STABILIZATION_MS = 900;
const CAMERA_READY_TIMEOUT_MS = 8000;

function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function getCameraElements() {
    return {
        cameraStreamElement: document.getElementById('camera-stream'),
        captureButton: document.getElementById('capture-selfie-btn'),
        statusText: document.getElementById('selfie-status-text'),
        statusNote: document.getElementById('selfie-status-note'),
        retryButton: document.getElementById('selfie-retry-btn')
    };
}

function logCameraEvent(eventName, details = {}) {
    console.info('[camera]', eventName, {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        ...details
    });
}

function setCameraStatus(message, note = '') {
    const { statusText, statusNote } = getCameraElements();
    if (statusText) {
        statusText.textContent = message;
    }
    if (statusNote) {
        statusNote.textContent = note;
    }
}

function setCaptureEnabled(enabled, label = 'Capture Selfie') {
    const { captureButton } = getCameraElements();
    if (!captureButton) {
        return;
    }
    captureButton.disabled = !enabled;
    captureButton.textContent = label;
}

function setRetryVisible(visible) {
    const { retryButton } = getCameraElements();
    if (!retryButton) {
        return;
    }
    retryButton.classList.toggle('d-none', !visible);
}

function getVideoDimensions(video) {
    return {
        width: Number(video?.videoWidth || 0),
        height: Number(video?.videoHeight || 0)
    };
}

function describeCameraStartError(err) {
    const name = err?.name || 'Error';

    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'Camera access was blocked. Allow camera access or use alternate capture.';
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'No camera was found on this device. Use alternate capture instead.';
    }

    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return 'The camera is busy in another app. Close other camera apps and try again.';
    }

    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
        return 'This device rejected the preferred camera settings. Try alternate capture.';
    }

    return 'Could not start the live camera. Use alternate capture or ask the organizer.';
}

async function waitForVideoReady(video) {
    if (!video) {
        throw new Error('Camera preview element not found.');
    }

    const hasDimensions = () => {
        const { width, height } = getVideoDimensions(video);
        return width > 0 && height > 0;
    };

    if (hasDimensions()) {
        return;
    }

    await new Promise((resolve, reject) => {
        let settled = false;
        let intervalId = null;
        let timeoutId = null;

        const cleanup = () => {
            if (intervalId) {
                window.clearInterval(intervalId);
            }
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            video.removeEventListener('loadedmetadata', onReady);
            video.removeEventListener('canplay', onReady);
        };

        const onReady = () => {
            if (!settled && hasDimensions()) {
                settled = true;
                cleanup();
                resolve();
            }
        };

        intervalId = window.setInterval(onReady, 150);
        timeoutId = window.setTimeout(() => {
            if (!settled) {
                settled = true;
                cleanup();
                reject(new Error('Camera started but never produced a usable frame.'));
            }
        }, CAMERA_READY_TIMEOUT_MS);

        video.addEventListener('loadedmetadata', onReady);
        video.addEventListener('canplay', onReady);
    });
}

async function loadInsetImage(insetImageUrl) {
    if (!insetImageUrl) {
        return null;
    }

    return new Promise(resolve => {
        const inset = new Image();
        inset.crossOrigin = 'anonymous';
        inset.onload = () => resolve(inset);
        inset.onerror = () => {
            logCameraEvent('inset-image-failed', { insetImageUrl });
            resolve(null);
        };
        inset.src = insetImageUrl;
    });
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create image blob.'));
            }
        }, 'image/jpeg', 0.82);
    });
}

export function stopCamera() {
    const { cameraStreamElement } = getCameraElements();
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (cameraStreamElement) {
        cameraStreamElement.pause();
        cameraStreamElement.srcObject = null;
    }
}

export async function startCamera() {
    const startedAt = Date.now();
    const { cameraStreamElement } = getCameraElements();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('Camera unavailable', 'This browser does not support live camera capture.');
        setCaptureEnabled(false, 'Capture Selfie');
        setRetryVisible(false);
        throw new Error('Camera not supported on this device. Use alternate capture instead.');
    }

    stopCamera();
    setCaptureEnabled(false, 'Starting camera…');
    setRetryVisible(false);
    setCameraStatus('Starting camera…', 'Allow camera access if your browser asks.');

    const attempts = [
        { label: 'front-camera', constraints: { video: { facingMode: { ideal: 'user' } }, audio: false } },
        { label: 'any-camera', constraints: { video: true, audio: false } }
    ];

    let lastError = null;
    let selectedPath = null;

    for (const attempt of attempts) {
        try {
            logCameraEvent('request-camera', { constraintPath: attempt.label });
            mediaStream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
            selectedPath = attempt.label;
            break;
        } catch (err) {
            lastError = err;
            logCameraEvent('request-camera-failed', {
                constraintPath: attempt.label,
                errorName: err?.name,
                errorMessage: err?.message
            });
        }
    }

    if (!mediaStream) {
        setRetryVisible(true);
        setCaptureEnabled(false, 'Capture Selfie');
        setCameraStatus('Camera unavailable', 'Use alternate capture or ask the organizer for help.');
        throw new Error(describeCameraStartError(lastError));
    }

    try {
        cameraStreamElement.srcObject = mediaStream;
        cameraStreamElement.muted = true;
        cameraStreamElement.setAttribute('playsinline', 'true');
        await cameraStreamElement.play();
        await waitForVideoReady(cameraStreamElement);
        setCameraStatus('Hold steady… optimizing image', 'Keep the phone still for a moment before capture.');
        await delay(CAMERA_STABILIZATION_MS);

        const { width, height } = getVideoDimensions(cameraStreamElement);
        if (width <= 0 || height <= 0) {
            throw new Error('Camera preview had zero dimensions.');
        }

        logCameraEvent('camera-ready', {
            constraintPath: selectedPath,
            readyInMs: Date.now() - startedAt,
            width,
            height
        });
        setCameraStatus('Ready', 'Frame the selfie and clue, then capture.');
        setCaptureEnabled(true, 'Capture Selfie');
        return { constraintPath: selectedPath, width, height };
    } catch (err) {
        logCameraEvent('camera-preview-failed', {
            errorName: err?.name,
            errorMessage: err?.message
        });
        stopCamera();
        setRetryVisible(true);
        setCaptureEnabled(false, 'Capture Selfie');
        setCameraStatus('Camera unavailable', 'Use alternate capture or try the camera again.');
        throw new Error('Camera preview failed before it was ready. Use alternate capture instead.');
    }
}

export async function captureCurrentSelfieBlob(locationId, insetImageUrl = null) {
    const startedAt = Date.now();
    const { cameraStreamElement } = getCameraElements();
    const { width, height } = getVideoDimensions(cameraStreamElement);

    if (width <= 0 || height <= 0) {
        logCameraEvent('capture-invalid-dimensions', { width, height });
        throw new Error('Camera image is not ready yet. Try again in a moment.');
    }

    setCaptureEnabled(false, 'Processing…');
    setCameraStatus('Saving photo…', 'Please hold steady for a moment.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(cameraStreamElement, 0, 0, width, height);

    let usedInset = false;
    const inset = await loadInsetImage(insetImageUrl);
    if (inset) {
        const insetWidth = canvas.width * 0.25;
        const insetHeight = inset.height * (insetWidth / inset.width);
        const insetX = canvas.width - insetWidth - 10;
        const insetY = canvas.height - insetHeight - 10;

        context.shadowColor = 'rgba(0,0,0,0.5)';
        context.shadowBlur = 8;
        context.shadowOffsetX = 2;
        context.shadowOffsetY = 2;
        context.strokeStyle = 'white';
        context.lineWidth = 3;
        context.drawImage(inset, insetX, insetY, insetWidth, insetHeight);
        context.strokeRect(insetX, insetY, insetWidth, insetHeight);
        context.shadowColor = 'transparent';
        usedInset = true;
    }

    const blob = await canvasToBlob(canvas);
    logCameraEvent('capture-complete', {
        captureInMs: Date.now() - startedAt,
        width,
        height,
        blobSize: blob.size,
        usedInset
    });
    stopCamera();
    return { blob, locationId, usedInset };
}

export function getSelfieBlob(locationId) {
    return captureCurrentSelfieBlob(locationId);
}

export function getSelfieBlobInset(locationId, insetImageUrl) {
    return captureCurrentSelfieBlob(locationId, insetImageUrl);
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