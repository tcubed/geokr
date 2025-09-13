import { showToast } from '/static/js/common-ui.js';

const gameSelect = document.getElementById('gameSelect');
const container = document.getElementById('locationsContainer');

let availableImages = [];
let allLocations = []; // keep full list for filtering

// Fetch available images once
async function fetchImages() {
  try {
    const resp = await fetch('/admin/api/images');
    if (!resp.ok) throw new Error('Failed to load images');
    availableImages = await resp.json();
    //console.log('availableImages:',availableImages)
  } catch (err) {
    console.error('Error fetching images:', err);
    availableImages = [];
    showToast('Failed to load available images', { type: 'danger' });
  }
}

// Initialize images on page load
fetchImages();

const filterInput = document.getElementById('filterInput');
// Filter cards based on input
filterInput.addEventListener('input', () => {
    console.log('filterInput input triggered');
  const filterText = filterInput.value.toLowerCase();
  const filtered = allLocations.filter(loc =>
    loc.name.toLowerCase().includes(filterText) ||
    (loc.clue_text || '').toLowerCase().includes(filterText) ||
    (loc.image_url || '').toLowerCase().includes(filterText)
  );
  renderLocations(filtered, filterText);
});

gameSelect.addEventListener('change', async () => {
    console.log('gameSelect change triggered');
  const gameId = gameSelect.value;
  if (!gameId) return;

  try {
    const resp = await fetch(`/api/locations?game_id=${gameId}`);
    const locations = await resp.json();
    allLocations = locations; // store full list for filtering
    console.log('game select locations:',locations);
    renderLocations(locations);
  } catch (err) {
    showToast('Failed to load locations: ' + err.message, { type: 'danger' });
  }
});

function renderLocations(locs, filterText = '') {
  container.innerHTML = '';
  const lowerFilter = filterText.toLowerCase();
  
  // Use all available images for dropdowns (or optionally filter only for matching images)
  const filteredImages = availableImages;

  // Add "New Location" card at the top
  if (gameSelect.value) {
    const newCard = document.createElement('div');
    newCard.className = 'col-md-4';
    newCard.innerHTML = `
      <div class="card h-100 p-2 new-location-card">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title">+ New Location</h5>
          <input type="text" class="form-control mb-2 new-loc-name" placeholder="Location name">
          <textarea class="form-control mb-2 new-loc-text" rows="3" placeholder="Clue text"></textarea>
          
          <div class="row mb-2">
              <div class="col-6">
                  <input type="number" step="any" class="form-control new-loc-lat" placeholder="Latitude">
              </div>
              <div class="col-6">
                  <input type="number" step="any" class="form-control new-loc-lon" placeholder="Longitude">
              </div>
          </div>

          <div class="mb-2">
            <label class="form-label">Image:</label>
            <select class="form-select new-loc-image">
              <option value="">-- select an image --</option>
              ${availableImages.map(img => `<option value="${img}">${img}</option>`).join('')}
            </select>
          </div>
          <div class="mt-auto d-flex justify-content-end">
            <button type="button" class="btn btn-sm btn-secondary upload-img-btn">Upload Image</button>
            <button class="btn btn-sm btn-primary add-loc">Add</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(newCard);
  }

  

  locs.forEach(loc => {
    const col = document.createElement('div');
    col.className = 'col-md-4';

    const highlight = (text) => {
      if (!lowerFilter) return text || '';
      const regex = new RegExp(`(${lowerFilter})`, 'gi');
      return (text || '').replace(regex, '<mark>$1</mark>');
    };
    console.log('loc:',loc.image_url)
    col.innerHTML = `
      <div class="card h-100 p-2" data-loc-id="${loc.id}">
        <div class="card-body d-flex flex-column">
          <input type="text" class="form-control mb-2 loc-name" value="${loc.name}">
          <textarea class="form-control mb-2 clue-text" rows="3">${loc.clue_text || ''}</textarea>
          
          <div class="row mb-2">
              <div class="col-6">
                  <input type="number" step="any" class="form-control loc-lat" value="${loc.latitude || ''}" placeholder="Latitude">
              </div>
              <div class="col-6">
                  <input type="number" step="any" class="form-control loc-lon" value="${loc.longitude || ''}" placeholder="Longitude">
              </div>
          </div>
          
          <div class="mb-2">
            <label class="form-label">Image:</label>
            <select class="form-select clue-image">
              <option value="">-- select an image --</option>
              ${filteredImages.map(img => {
                    const shortName = img.replace(/^\/static\/images\//, '');
                    return `<option value="${img}" ${shortName === loc.image_url ? 'selected' : ''}>${shortName}</option>`;
                }).join('')}
            </select>
          </div>
          <div class="mt-auto d-flex justify-content-between align-items-center">
                ${loc.image_url ? `<img src="/static/images/${loc.image_url}" class="img-thumbnail" style="width:150px;height:150px;object-fit:cover;">` : '<div></div>'}
                <button class="btn btn-sm btn-success save-loc">Save</button>
                <button class="btn btn-sm btn-danger delete-loc">Delete</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(col);
  });
}

// Handle clicks
container.addEventListener('click', async (e) => {
  const card = e.target.closest('.card');
  if (!card) return;

  try{
    // ---------------- SAVE LOCATION ----------------
    if (e.target.classList.contains('save-loc')) {
        const locId = card.dataset.locId;
        const name = card.querySelector('.loc-name').value.trim();
        const text = card.querySelector('.clue-text').value;
        let image = card.querySelector('.clue-image').value;
        // Get latitude and longitude values
        const latitude = card.querySelector('.loc-lat').value;
        const longitude = card.querySelector('.loc-lon').value;

        // Strip the prefix before sending to the server
        if (image.startsWith('/static/images/')) {
            image = image.replace('/static/images/', '');
        }

        const resp = await fetch(`/api/location/${locId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, 
                clue_text: text, 
                image, 
                latitude, 
                longitude  })
        });

        if (!resp.ok) throw new Error('Server error');
        showToast('Location saved', { type: 'success' });
        return;
    }
  
    // ---------------- DELETE LOCATION ----------------
    if (e.target.classList.contains('delete-loc')) {
      const locId = card.dataset.locId;
      if (!confirm('Are you sure you want to delete this location?')) return;

      const resp = await fetch(`/api/location/${locId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Server error');

      showToast('Location deleted', { type: 'success' });
      allLocations = allLocations.filter(loc => loc.id != locId);
      renderLocations(allLocations, filterInput.value);
      return;
    }

    // ---------------- ADD NEW LOCATION ----------------
    if (e.target.classList.contains('add-loc')) {
      const name = card.querySelector('.new-loc-name').value.trim() || 'New Location';
      const text = card.querySelector('.new-loc-text').value.trim();
      let image = card.querySelector('.new-loc-image').value;
      const latitude = card.querySelector('.new-loc-lat').value;
      const longitude = card.querySelector('.new-loc-lon').value;
      const gameId = gameSelect.value;

      if (image.startsWith('/static/images/')) image = image.replace('/static/images/', '');

      const resp = await fetch(`/api/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
                    game_id: gameId, 
                    name, 
                    clue_text: text, 
                    image, 
                    latitude, 
                    longitude 
                })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.message || 'Server error');

      showToast('Location added', { type: 'success' });

      // Reload locations safely
      const updatedResp = await fetch(`/api/locations?game_id=${gameId}`);
      let updatedLocations;
      try {
        updatedLocations = await updatedResp.json();
      } catch(e) {
        console.error('Failed to parse locations JSON', e);
        updatedLocations = [];
      }
      allLocations = updatedLocations;
      renderLocations(allLocations);
      return;
    }

    // ---------------- UPLOAD IMAGE ----------------
    if (e.target.classList.contains('upload-img-btn')) {
      // populate directories
      const resp = await fetch('/admin/api/image-directories');
      const dirs = await resp.json();
      imageDirSelect.innerHTML = dirs.map(d => `<option value="${d}">${d}</option>`).join('');
      newDirInput.value = '';
      
      // callback: set uploaded image into the new-location select
      currentImageCallback = (imagePath) => {
        const select = e.target.closest('.new-location-card').querySelector('.new-loc-image');
        const option = document.createElement('option');
        option.value = `/static/images/${imagePath}`;
        option.textContent = imagePath;
        option.selected = true;
        select.appendChild(option);
      };

      new bootstrap.Modal(uploadModalEl).show();
      return;
    }

  } catch (err) {
    console.error('Error handling card click:', err);
    showToast('Action failed: ' + err.message, { type: 'danger' });
  }
});

// ==============================================================
/*  IMAGE UPLOAD MODAL, ETC

*/
const uploadModalEl = document.getElementById('uploadImageModal');
const uploadForm = document.getElementById('uploadImageForm');
const imageDirSelect = document.getElementById('imageDir');
const newDirInput = document.getElementById('newDirName');
let currentImageCallback = null; // function to call after upload

const imageFileInput = document.getElementById('imageFile');
const imagePreview = document.getElementById('imagePreview');
const targetFilenameInput = document.getElementById('targetFilename');



// Handle upload submit
uploadForm.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  
  const file = document.getElementById('imageFile').files[0];
  let directory = newDirInput.value.trim() || imageDirSelect.value;
  const filename = targetFilenameInput.value.trim();
  
  if (!file || !filename) return alert('File and filename required');

  const formData = new FormData();
  formData.append('image', file);
  formData.append('directory', directory);
  formData.append('filename', filename);
  
  const resp = await fetch('/admin/api/upload-image', {
    method: 'POST',
    body: formData
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) return alert(data.message || 'Upload failed');

  if (currentImageCallback) currentImageCallback(data.path);
  bootstrap.Modal.getInstance(uploadModalEl).hide();
});

// image upload preview


imageFileInput.addEventListener('change', () => {
  const file = imageFileInput.files[0];
  if (!file) {
    imagePreview.style.display = 'none';
    imagePreview.src = '';
    targetFilenameInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreview.style.display = 'block';
  };
  reader.readAsDataURL(file);

  // Autofill filename input (without extension)
  const nameWithoutExt = file.name.replace(/\.[^/.]+$/, ""); 
  targetFilenameInput.value = nameWithoutExt;
});

