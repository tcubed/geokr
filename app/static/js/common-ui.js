
export function showToast(message, { duration = 4000, type = 'info' } = {}) {
  const container = document.getElementById('sync-toast-container');
  if (!container) return;

  const colors = {
    info: { bg: '#5555eb', text: '#fff' },
    //success: { bg: '#16a34a', text: '#fff' },
    success: { bg: '#19b754', text: '#fff'},
    error: { bg: '#dc2626', text: '#fff' },
    warning: { bg: '#f59e0b', text: '#000' }
  };
  const { bg, text } = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    background:${bg};
    color:${text};
    padding:12px 16px;
    border-radius:8px;
    box-shadow:0 8px 24px rgba(0,0,0,0.15);
    font-size:14px;
    position: relative;
    overflow: hidden;
    opacity:0;
    transition: opacity .3s ease, transform .3s ease;
  `;

  container.prepend(toast);
  // entrance
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // auto-dismiss
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}