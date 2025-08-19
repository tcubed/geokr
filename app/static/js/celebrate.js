export function createFirework(x, y, colors = ['#f39c12','#e74c3c','#f1c40f','#9b59b6','#1abc9c'], count = 30) {
  const container = document.getElementById('fireworks-container');
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'firework';
    
    // Random angle & distance
    const angle = Math.random() * 2 * Math.PI;
    const distance = 50 + Math.random() * 100;
    particle.style.setProperty('--x', `${Math.cos(angle)*distance}px`);
    particle.style.setProperty('--y', `${Math.sin(angle)*distance}px`);
    
    // Random color
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Position
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    
    container.appendChild(particle);
    
    // Remove particle after animation
    particle.addEventListener('animationend', () => particle.remove());
  }
}

// Example: center of screen
document.getElementById('fireworks-container').addEventListener('click', e => {
  createFirework(e.clientX, e.clientY);
});
