document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');
  const emailInput = document.getElementById('email');
  const displayNameInput = document.getElementById('display_name'); // Assuming you've added this input


  // ** New Logic to handle offline queued logins **
  const offlineEmail = localStorage.getItem('offlineEmail');
  const offlineDisplayName = localStorage.getItem('offlineDisplayName');
  if (offlineEmail && offlineDisplayName) {
      // Populate the fields and automatically trigger a login attempt
      emailInput.value = offlineEmail;
      displayNameInput.value = offlineDisplayName;
      loginForm.dispatchEvent(new Event('submit'));
      localStorage.removeItem('offlineEmail'); // Clear the flag after attempting
      localStorage.removeItem('offlineDisplayName'); // Clear the flag
      console.log('[Offline] Resuming queued login for:', offlineEmail);
  }
  // ** End of new logic **

  loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const display_name = displayNameInput.value.trim();

        if (!email || !display_name) {
            loginMessage.textContent = "Please provide both email and display name.";
            return;
        }

        loginMessage.textContent = 'Logging in...';
        console.log('[Login] Attempting login/registration for:', email);

        try {
            const res = await fetch('/register_or_login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, display_name })
            });

            const data = await res.json();
            loginMessage.textContent = data.message;
            console.log('[Login] Server response:', data);

            if (data.success) {
                // Now you can redirect directly as the user is already logged in
                window.location.href = '/findloc';
            } else if (data.queued) {
                alert("You are offline. Login request queued. Try again when back online.");
                localStorage.setItem('offlineEmail', email);
                localStorage.setItem('offlineDisplayName', display_name);
            } else {
                alert(data.message || "Login failed.");
            }

        } catch (err) {
            loginMessage.textContent = 'Offline login not available. Saving for later.';
            console.warn("Network error, storing info for later login.", err);
            localStorage.setItem('offlineEmail', email);
            localStorage.setItem('offlineDisplayName', display_name);
        }
    });
  
});



// loginForm.addEventListener('submit', async (e) => {
//     e.preventDefault();
//     const email = document.getElementById('email').value.trim();

//     if (!email) {
//       loginMessage.textContent = "Please enter your email.";
//       return;
//     }

//     loginMessage.textContent = 'Sending magic link...';
//     console.log('[Login] Attempting magic link login for:', email);

//     try {
//       const res = await fetch('/login', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ email })
//       });

//       const data = await res.json();
//       loginMessage.textContent = data.message;
//       console.log('[Login] Server response:', data);

//       if (data.success) {
//         // Optionally redirect after a short delay
//         loginMessage.textContent = "Magic link sent! Check your email to log in.";
//         //setTimeout(() => { window.location.href = '/findloc'; }, 1000);
//       } else if (data.queued) {
//         alert("You are offline. Login request queued. Try again when back online.");
//         localStorage.setItem('offlineEmail', email);
//       } else {
//         alert(data.message || "Login failed.");
//       }

//     } catch (err) {
//       loginMessage.textContent = 'Offline login not available.';
//       console.warn("Network error, storing email for later login.", err);
//       localStorage.setItem('offlineEmail', email);
//     }
//   });