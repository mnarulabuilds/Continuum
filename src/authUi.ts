
export function renderLoginPage() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Continuum Admin Login</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' style='stop-color:%233B82F6;stop-opacity:1' /><stop offset='100%' style='stop-color:%238B5CF6;stop-opacity:1' /></linearGradient></defs><rect width='100' height='100' rx='20' fill='url(%23g)'/><text x='50%' y='50%' dominant-baseline='central' text-anchor='middle' fill='white' font-family='Outfit, sans-serif' font-size='60' font-weight='800'>C</text></svg>">
    <style>
        :root {
            --bg: #0b0f19;
            --card-bg: #161c2d;
            --accent: #3b82f6;
            --text: #ffffff;
            --text-muted: #94a3b8;
            --border: rgba(255,255,255,0.05);
        }
        * { box-sizing: border-box; }
        body { 
            font-family: 'Outfit', sans-serif; 
            background: var(--bg); 
            color: var(--text); 
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0;
        }
        .login-card {
            background: var(--card-bg);
            padding: 40px;
            border-radius: 20px;
            width: 100%;
            max-width: 400px;
            border: 1px solid var(--border);
            text-align: center;
            box-shadow: 0 20px 50px -10px rgba(0,0,0,0.5);
        }
        h1 { margin-bottom: 8px; font-weight: 600; }
        p { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 30px; }
        
        input {
            width: 100%;
            background: rgba(0,0,0,0.2);
            border: 1px solid var(--border);
            color: var(--text);
            padding: 14px 16px;
            border-radius: 8px;
            font-size: 1rem;
            margin-bottom: 16px;
            transition: border-color 0.2s;
        }
        input:focus { outline: none; border-color: var(--accent); }

        button {
            width: 100%;
            padding: 14px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        button:hover { opacity: 0.9; }

        .google-btn {
            background: white;
            color: #333;
            margin-top: 12px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
        }
        .divider {
            margin: 24px 0;
            display: flex;
            align-items: center;
            color: var(--text-muted);
            font-size: 0.8rem;
        }
        .divider::before, .divider::after {
            content: "";
            flex: 1;
            height: 1px;
            background: var(--border);
        }
        .divider span { padding: 0 10px; }

        .otp-input {
            letter-spacing: 0.5em;
            text-align: center;
            font-size: 1.5rem;
            font-weight: 600;
        }

        #toast {
            position: fixed; top: 20px; padding: 12px 24px; border-radius: 8px; font-size: 0.9rem;
            background: #ef4444; color: white; opacity: 0; transition: opacity 0.3s; pointer-events: none;
        }
        #toast.show { opacity: 1; }
    </style>
</head>
<body>

    <div id="toast">Error message</div>

    <div class="login-card" id="step1">
        <h1>Welcome Back</h1>
        <p>Sign in to access Continuum Admin Console</p>
        
        <form onsubmit="sendOTP(event)">
            <input type="email" id="email" placeholder="admin@company.com" required>
            <button type="submit">Send Login Code</button>
        </form>

        <div class="divider"><span>OR</span></div>

        <button class="google-btn" onclick="googleLogin()">
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.272C4.672 5.141 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
            Sign in with Google
        </button>
    </div>

    <div class="login-card" id="step2" style="display: none;">
        <h1>Enter Code</h1>
        <p>We sent a 6-digit code to <b id="displayEmail"></b></p>
        
        <form onsubmit="verifyOTP(event)">
            <input type="text" id="otp" class="otp-input" maxlength="6" placeholder="000000" required pattern="[0-9]*" inputmode="numeric">
            <button type="submit">Verify & Login</button>
        </form>
        
        <p style="margin-top: 20px; cursor: pointer; color: var(--accent);" onclick="location.reload()">Use different email</p>
    </div>

    <script>
        async function sendOTP(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            
            try {
                const res = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                if (res.ok) {
                    document.getElementById('step1').style.display = 'none';
                    document.getElementById('step2').style.display = 'block';
                    document.getElementById('displayEmail').innerText = email;
                } else {
                    const data = await res.json().catch(() => null);
                    showError(data?.error ?? 'Failed to send login code');
                }
            } catch (err) {
                showError('Network error');
            }
        }

        async function verifyOTP(e) {
            e.preventDefault();
            const email = document.getElementById('displayEmail').innerText;
            const otp = document.getElementById('otp').value;

            try {
                const res = await fetch('/auth/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, otp })
                });

                if (res.ok) {
                    window.location.href = '/admin-dashboard';
                } else {
                    showError('Invalid or expired code');
                }
            } catch (err) {
                showError('Network error');
            }
        }

        function googleLogin() {
            // Placeholder for Google OAuth flow
            window.location.href = '/auth/google';
        }

        function showError(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }
    </script>
</body>
</html>
    `;
}
