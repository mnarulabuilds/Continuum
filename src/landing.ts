
export function renderLandingPage() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Continuum CDN | The Intelligent Edge</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700;800&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' style='stop-color:%233B82F6;stop-opacity:1' /><stop offset='100%' style='stop-color:%238B5CF6;stop-opacity:1' /></linearGradient></defs><rect width='100' height='100' rx='20' fill='url(%23g)'/><text x='50%' y='50%' dominant-baseline='central' text-anchor='middle' fill='white' font-family='Outfit, sans-serif' font-size='60' font-weight='800'>C</text></svg>">
    <style>
        :root {
            --bg-dark: #050505;
            --bg-card: rgba(255, 255, 255, 0.03);
            --primary: #3b82f6;
            --primary-glow: rgba(59, 130, 246, 0.5);
            --accent: #8b5cf6;
            --text-main: #ffffff;
            --text-muted: #94a3b8;
            --border: rgba(255, 255, 255, 0.1);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-dark);
            color: var(--text-main);
            overflow-x: hidden;
            line-height: 1.6;
        }

        /* Ambient Background */
        .ambient-light {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: -1;
            background: 
                radial-gradient(circle at 15% 50%, rgba(59, 130, 246, 0.08), transparent 25%),
                radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.08), transparent 25%);
        }

        /* Navbar */
        nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 8%;
            backdrop-filter: blur(10px);
            position: fixed;
            width: 100%;
            top: 0;
            z-index: 100;
            border-bottom: 1px solid rgba(255,255,255,0.02);
        }

        .logo {
            font-weight: 800;
            font-size: 1.5rem;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .nav-links a {
            color: var(--text-muted);
            text-decoration: none;
            margin-left: 32px;
            font-size: 0.9rem;
            transition: color 0.3s;
        }

        .nav-links a:hover {
            color: #fff;
        }

        .btn {
            padding: 10px 24px;
            border-radius: 999px;
            font-weight: 600;
            text-decoration: none;
            font-size: 0.9rem;
            transition: all 0.3s ease;
            display: inline-block;
        }

        .btn-primary {
            background: linear-gradient(90deg, var(--primary), var(--accent));
            color: white;
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
            border: 1px solid transparent;
        }

        .btn-primary:hover {
            box-shadow: 0 0 30px rgba(59, 130, 246, 0.5);
            transform: translateY(-2px);
        }

        .btn-outline {
            background: transparent;
            border: 1px solid var(--border);
            color: white;
            margin-left: 16px;
        }

        .btn-outline:hover {
            border-color: var(--text-muted);
            background: rgba(255,255,255,0.05);
        }

        /* Hero Section */
        .hero {
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 0 20px;
            position: relative;
            margin-top: 80px;
        }

        .hero h1 {
            font-size: 5rem;
            line-height: 1.1;
            font-weight: 800;
            margin-bottom: 24px;
            background: linear-gradient(180deg, #FFFFFF 0%, #71717a 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.04em;
            max-width: 900px;
        }

        .hero p {
            font-size: 1.25rem;
            color: var(--text-muted);
            max-width: 600px;
            margin-bottom: 40px;
        }

        .hero-stats {
            display: flex;
            gap: 40px;
            margin-top: 60px;
            opacity: 0.8;
        }

        .stat-item {
            text-align: left;
        }

        .stat-val {
            font-size: 2rem;
            font-weight: 700;
            color: white;
        }

        .stat-label {
            font-size: 0.875rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        /* Features Grid */
        .features {
            padding: 100px 8%;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 24px;
        }

        .feature-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 40px;
            transition: transform 0.3s, border-color 0.3s;
        }

        .feature-card:hover {
            transform: translateY(-10px);
            border-color: rgba(59, 130, 246, 0.3);
        }

        .feature-icon {
            font-size: 2rem;
            margin-bottom: 20px;
            display: inline-block;
            background: rgba(255,255,255,0.05);
            padding: 12px;
            border-radius: 12px;
        }

        .feature-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 12px;
            color: white;
        }

        .feature-desc {
            color: var(--text-muted);
            font-size: 0.95rem;
            line-height: 1.6;
        }

        /* Code Snippet */
        .code-section {
            padding: 100px 8%;
            display: flex;
            justify-content: center;
        }

        .code-block {
            background: #0d1117;
            padding: 40px;
            border-radius: 20px;
            border: 1px solid var(--border);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.9rem;
            width: 100%;
            max-width: 800px;
            position: relative;
            box-shadow: 0 20px 50px -10px rgba(0,0,0,0.5);
        }

        .code-block::before {
            content: "domains.json";
            position: absolute;
            top: 15px;
            left: 20px;
            color: var(--text-muted);
            font-size: 0.8rem;
        }

        .keyword { color: #ff7b72; }
        .string { color: #a5d6ff; }
        .key { color: #7ee787; }

        /* Footer */
        footer {
            text-align: center;
            padding: 80px 0;
            color: var(--text-muted);
            font-size: 0.9rem;
            border-top: 1px solid rgba(255,255,255,0.05);
        }

        /* Animations */
        @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
            100% { transform: translateY(0px); }
        }

        .float { animation: float 6s ease-in-out infinite; }

        @media (max-width: 768px) {
            .hero h1 { font-size: 3rem; }
            .features { grid-template-columns: 1fr; }
            nav { padding: 20px; }
        }
    </style>
</head>
<body>

    <div class="ambient-light"></div>

    <nav>
        <div class="logo">Continuum</div>
        <div class="nav-links">
            <a href="#features">Features</a>
            <a href="/cdn-dashboard" target="_blank">Dashboard</a>
            <a href="/admin-dashboard" target="_blank">Admin</a>
        </div>
    </nav>

    <section class="hero">
        <h1 class="float">The Intelligent Edge<br>for Modern SaaS</h1>
        <p>A high-performance, multi-tenant CDN and Reverse Proxy meant for the next generation of web applications. Built for speed, security, and scale.</p>
        
        <div class="cta-group">
            <a href="#features" class="btn btn-primary">Explore Features</a>
            <a href="https://github.com/m-a-y-a-n-k/Continuum" class="btn btn-outline" target="_blank">View on GitHub</a>
        </div>

        <div class="hero-stats">
            <div class="stat-item">
                <div class="stat-val">0ms</div>
                <div class="stat-label">Latency Overhead</div>
            </div>
            <div class="stat-item">
                <div class="stat-val">100%</div>
                <div class="stat-label">Programmable</div>
            </div>
            <div class="stat-item">
                <div class="stat-val">L1/L2</div>
                <div class="stat-label">Tiered Caching</div>
            </div>
        </div>
    </section>

    <section id="features" class="features">
        <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <div class="feature-title">Blazing Fast Cache</div>
            <div class="feature-desc">
                Multi-tier caching architecture using in-memory Redis (L1) and persistent Disk storage (L2) ensures your content is served in milliseconds.
            </div>
        </div>
        <div class="feature-card">
            <div class="feature-icon">🛡️</div>
            <div class="feature-title">Edge Security</div>
            <div class="feature-desc">
                Built-in Web Application Firewall (WAF) blocks SQL injection, XSS, and malicious bots before they touch your origin server.
            </div>
        </div>
        <div class="feature-card">
            <div class="feature-icon">🌐</div>
            <div class="feature-title">Multi-Tenant Routing</div>
            <div class="feature-desc">
                Host thousands of custom domains on a single instance. Perfect for SaaS platforms offering white-label domains to customers.
            </div>
        </div>
        <div class="feature-card">
            <div class="feature-icon">📈</div>
            <div class="feature-title">Real-time Analytics</div>
            <div class="feature-desc">
                Gain deep insights into traffic patterns, bandwidth usage, and cache hit rates with our built-in live dashboard.
            </div>
        </div>
    </section>

    <div class="code-section">
        <div class="code-block">
<pre>
<span class="keyword">const</span> <span class="key">domainManager</span> = {
  <span class="string">"user-site.com"</span>: <span class="string">"https://backend-us-east.server.com"</span>,
  <span class="string">"shop.brand.io"</span>: <span class="string">"https://storefront-service.internal"</span>,
  <span class="string">"blog.startup.co"</span>: <span class="string">"https://wordpress-cluster.local"</span>
};
<span class="comment">// Continuum handles the rest individually for each tenant.</span>
</pre>
        </div>
    </div>

    <footer>
        <p>Continuum CDN &copy; ${new Date().getFullYear()} &bull; Built with Node.js &bull; Designed for Performance</p>
    </footer>

</body>
</html>
    `;
}
