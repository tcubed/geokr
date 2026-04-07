// static/js/qr.js
let videoStream = null;
let animationFrameId = null;

function resolveElement(target) {
    if (typeof target === 'string') {
        return document.getElementById(target);
    }
    return target || null;
}

export async function startQRScanner({
    videoElementId = 'qr-video',
    canvasElementId = 'qr-canvas',
    onResult,
    onStatus,
    onError,
} = {}) {
    const video = resolveElement(videoElementId);
    const canvas = resolveElement(canvasElementId);
    if (!video || !canvas) {
        const err = new Error('QR scanner elements not found');
        onError?.(err);
        throw err;
    }

    const ctx = canvas.getContext('2d');

    onStatus?.('Opening back camera…');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
            },
            audio: false,
        });

        videoStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', true);
        await video.play();
        onStatus?.('Camera ready. Hold steady over the QR code.');

        const tick = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.height = video.videoHeight;
                canvas.width = video.videoWidth;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, canvas.width, canvas.height);
                if (code) {
                    stopQRScanner(videoElementId);
                    onStatus?.('QR detected. Validating…');
                    onResult?.(code.data);
                    return;
                }
            }
            animationFrameId = requestAnimationFrame(tick);
        };

        animationFrameId = requestAnimationFrame(tick);
    } catch (err) {
        console.error('Error accessing camera:', err);
        onStatus?.('Camera unavailable. Check permissions and try again.');
        onError?.(err);
        throw err;
    }
}

export function stopQRScanner(videoElementId = 'qr-video') {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    const video = document.getElementById(videoElementId);
    if (video) {
        video.pause();
        video.srcObject = null;
    }
}