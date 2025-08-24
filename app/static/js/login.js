document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();

    if (!email) {
      loginMessage.textContent = "Please enter your email.";
      return;
    }

    loginMessage.textContent = 'Sending magic link...';
    console.log('[Login] Attempting magic link login for:', email);

    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      loginMessage.textContent = data.message;
      console.log('[Login] Server response:', data);

      if (data.success) {
        // Optionally redirect after a short delay
        setTimeout(() => { window.location.href = '/findloc'; }, 1000);
      } else if (data.queued) {
        alert("You are offline. Login request queued. Try again when back online.");
        localStorage.setItem('offlineEmail', email);
      } else {
        alert(data.message || "Login failed.");
      }

    } catch (err) {
      loginMessage.textContent = 'Offline login not available.';
      console.warn("Network error, storing email for later login.", err);
      localStorage.setItem('offlineEmail', email);
    }
  });
});
