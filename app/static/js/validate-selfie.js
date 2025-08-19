async function captureSelfieBlob() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not supported');
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

function validateBySelfie(clueId, photoBlob) {
  // Assume photoBlob is from <input type="file"> or webcam
  // You might store blob in IndexedDB or as base64 string
  const reader = new FileReader();
  reader.onload = () => {
    queueLocationValidation(clueId, 'selfie', { photo: reader.result });
  };
  reader.readAsDataURL(photoBlob);
}

