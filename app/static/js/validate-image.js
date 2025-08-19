// async function quickCheck(capturedImageData) {
//     const overlayImg = document.querySelector('img.overlay');

//     // Draw overlay to small canvas
//     const smallCanvas = document.createElement('canvas');
//     smallCanvas.width = 16;
//     smallCanvas.height = 16;
//     const smallCtx = smallCanvas.getContext('2d');

//     // Draw captured image
//     const img1 = await loadImage(capturedImageData);
//     smallCtx.drawImage(img1, 0, 0, 16, 16);
//     const data1 = smallCtx.getImageData(0, 0, 16, 16).data;

//     // Draw overlay image
//     smallCtx.clearRect(0, 0, 16, 16);
//     const img2 = await loadImage(overlayImg.src);
//     smallCtx.drawImage(img2, 0, 0, 16, 16);
//     const data2 = smallCtx.getImageData(0, 0, 16, 16).data;

//     // Compute difference
//     let diff = 0;
//     for (let i = 0; i < data1.length; i += 4) {
//         diff += Math.abs(data1[i] - data2[i]);     // R
//         diff += Math.abs(data1[i+1] - data2[i+1]); // G
//         diff += Math.abs(data1[i+2] - data2[i+2]); // B
//     }
//     const avgDiff = diff / (16 * 16 * 3);
//     return avgDiff < 50; // threshold for rough match
// }

// function loadImage(src) {
//     return new Promise((resolve) => {
//         const img = new Image();
//         img.crossOrigin = 'Anonymous';
//         img.onload = () => resolve(img);
//         img.src = src;
//     });
// }



// ✅ Function: Capture and resize
function captureAndResize(videoEl, maxWidth) {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);

    const scale = maxWidth / canvas.width;
    const newHeight = canvas.height * scale;

    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = maxWidth;
    resizedCanvas.height = newHeight;
    const resizedCtx = resizedCanvas.getContext('2d');
    resizedCtx.drawImage(canvas, 0, 0, maxWidth, newHeight);

    return resizedCanvas.toDataURL('image/jpeg', 0.8); // quality = 80%
}

// ✅ Function: Quick pre-check using tiny thumbnails
async function quickCheck(imageData1, imageSrc2) {
    const img1 = await loadImage(imageData1);
    const img2 = await loadImage(imageSrc2);
    const size = 16;
    const threshold = 50; // threshold for rough similarity

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img1, 0, 0, size, size);
    const data1 = ctx.getImageData(0, 0, size, size).data;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img2, 0, 0, size, size);
    const data2 = ctx.getImageData(0, 0, size, size).data;

    let diff = 0;
    for (let i = 0; i < data1.length; i += 4) {
        diff += Math.abs(data1[i] - data2[i]);     // R
        diff += Math.abs(data1[i+1] - data2[i+1]); // G
        diff += Math.abs(data1[i+2] - data2[i+2]); // B
    }
    const avgDiff = diff / (size * size * 3);
    return avgDiff < threshold; // threshold for rough similarity
}

// ✅ Helper: Load image from src/base64
function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.src = src;
    });
}



const video = document.getElementById('camera');
const statusDiv = document.getElementById('status');
const overlayImg = document.querySelector('img.overlay');

// Start camera
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => { video.srcObject = stream; })
    .catch(err => { statusDiv.textContent = "Camera access denied."; });

// ✅ Capture, resize, and verify
document.getElementById('capture-btn').addEventListener('click', async () => {
    const capturedImage = captureAndResize(video, 300); // 300px max width
    statusDiv.textContent = "Quick check...";
    const ok = await quickCheck(capturedImage, overlayImg.src);
    if (!ok) {
        statusDiv.textContent = "❌ Looks off! Try to align better.";
        return;
    }

    statusDiv.textContent = "Checking with server...";
    const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: capturedImage })
    });
    const data = await res.json();
    statusDiv.textContent = data.match ? "✅ Match Found!" : "❌ Try Again!";
});