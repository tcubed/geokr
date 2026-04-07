document.addEventListener('DOMContentLoaded', () => {
  const colorInput = document.getElementById('navbar_color');
  const hexInput = document.getElementById('navbar_color_hex');

  if (!colorInput || !hexInput) {
    return;
  }

  colorInput.addEventListener('input', () => {
    hexInput.value = colorInput.value;
  });

  hexInput.addEventListener('input', () => {
    const value = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      colorInput.value = value;
    }
  });
});
