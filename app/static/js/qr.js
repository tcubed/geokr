// static/js/qr.js
let videoStream = null;
let animationFrameId = null;

export function startQRScanner(videoElementId, canvasElementId, onResult) {
    const video = document.getElementById(videoElementId);
    const canvas = document.getElementById(canvasElementId);
    const ctx = canvas.getContext('2d');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
            videoStream = stream;
            video.srcObject = stream;
            video.setAttribute("playsinline", true); // required for iOS
            video.play();

            const tick = () => {
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    canvas.height = video.videoHeight;
                    canvas.width = video.videoWidth;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, canvas.width, canvas.height);
                    if (code) {
                        stopQRScanner(videoElementId);
                        onResult(code.data);
                        return;
                    }
                }
                animationFrameId = requestAnimationFrame(tick);
            };

            animationFrameId = requestAnimationFrame(tick);
        })
        .catch(err => {
            console.error("Error accessing camera:", err);
        });
}

export function stopQRScanner(videoElementId) {
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

export function initQRScannerIfPresent() {
    const video = document.getElementById("qr-video");
    const canvas = document.getElementById("qr-canvas");
    const result = document.getElementById("qr-result");

    if (video && canvas && result) {
        startQRScanner(video, canvas, (data) => {
            result.textContent = "Scanned: " + data;

            if (data.startsWith("/")) {
                fetch(data)
                    .then(r => r.text())
                    .then(text => console.log("Response:", text));
            } else {
                window.location.href = data;
            }
        });
    }
}