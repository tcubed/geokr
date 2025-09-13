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

export function launchFireworks() {
    // You can customize the launch positions
    const positions = [
        { x: window.innerWidth * 0.25, y: window.innerHeight * 0.5 },
        { x: window.innerWidth * 0.5, y: window.innerHeight * 0.75 },
        { x: window.innerWidth * 0.75, y: window.innerHeight * 0.5 },
        { x: window.innerWidth * 0.6, y: window.innerHeight * 0.6 },
        { x: window.innerWidth * 0.4, y: window.innerHeight * 0.5 },
        { x: window.innerWidth * 0.75, y: window.innerHeight * 0.7 },
        { x: window.innerWidth * 0.3, y: window.innerHeight * 0.4 }
    ];

    // Launch each firework with a delay
    positions.forEach((pos, index) => {
        setTimeout(() => {
            createFirework(pos.x, pos.y);
        }, index * 1000); // 1-second delay between each launch
    });
}

// Example: center of screen
// document.getElementById('fireworks-container').addEventListener('click', e => {
//   createFirework(e.clientX, e.clientY);
// });
