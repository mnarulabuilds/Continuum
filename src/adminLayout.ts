export type AdminNav = "domains" | "analytics" | "settings";

const navIcons = {
    domains: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    analytics: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-7"/></svg>`,
    settings: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
} as const;

const navItems: Array<{ id: AdminNav; label: string; href: string }> = [
    { id: "domains", label: "Domains", href: "/admin-dashboard" },
    { id: "analytics", label: "Analytics", href: "/cdn-dashboard" },
    { id: "settings", label: "Settings", href: "/admin-settings" },
];

export function renderAdminLayout(options: {
    activeNav: AdminNav;
    title: string;
    content: string;
    extraHead?: string;
    extraScripts?: string;
}): string {
    const navHtml = navItems.map((item) =>
        `<a href="${item.href}" class="nav-item${item.id === options.activeNav ? " active" : ""}" title="${item.label}">${navIcons[item.id]}<span class="nav-label">${item.label}</span></a>`,
    ).join("\n            ");

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Continuum | ${options.title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' style='stop-color:%233B82F6;stop-opacity:1' /><stop offset='100%' style='stop-color:%238B5CF6;stop-opacity:1' /></linearGradient></defs><rect width='100' height='100' rx='20' fill='url(%23g)'/><text x='50%' y='50%' dominant-baseline='central' text-anchor='middle' fill='white' font-family='Outfit, sans-serif' font-size='60' font-weight='800'>C</text></svg>">
        <style>
            :root {
                --bg: #05070a;
                --sidebar-bg: #0c0f16;
                --card-bg: #111622;
                --accent: #3b82f6;
                --accent-glow: rgba(59, 130, 246, 0.4);
                --text: #ffffff;
                --text-muted: #8b949e;
                --border: rgba(255,255,255,0.08);
                --success: #10b981;
                --danger: #ef4444;
                --glass: rgba(255, 255, 255, 0.03);
                --sidebar-width: 260px;
                --sidebar-width-collapsed: 72px;
            }

            * { box-sizing: border-box; margin: 0; }
            body {
                font-family: 'Outfit', sans-serif;
                background: var(--bg);
                color: var(--text);
                display: flex;
                min-height: 100vh;
            }

            .sidebar {
                width: var(--sidebar-width);
                background: var(--sidebar-bg);
                border-right: 1px solid var(--border);
                display: flex;
                flex-direction: column;
                padding: 20px 16px;
                position: fixed;
                height: 100vh;
                z-index: 100;
                transition: width 0.25s ease, padding 0.25s ease;
                overflow: hidden;
            }
            .sidebar-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 32px;
                min-height: 40px;
            }
            .sidebar-toggle {
                flex-shrink: 0;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--glass);
                border: 1px solid var(--border);
                border-radius: 10px;
                color: var(--text-muted);
                cursor: pointer;
                transition: color 0.2s, background 0.2s, border-color 0.2s;
            }
            .sidebar-toggle:hover {
                color: var(--text);
                background: rgba(255, 255, 255, 0.06);
                border-color: rgba(255, 255, 255, 0.12);
            }
            .sidebar-toggle svg {
                width: 20px;
                height: 20px;
                transition: transform 0.25s ease;
            }
            .logo {
                font-size: 1.35rem;
                font-weight: 600;
                white-space: nowrap;
                overflow: hidden;
                background: linear-gradient(135deg, #60a5fa 0%, #a855f7 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                opacity: 1;
                transition: opacity 0.2s ease, max-width 0.25s ease;
                max-width: 180px;
            }
            .nav-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 14px;
                color: var(--text-muted);
                text-decoration: none;
                border-radius: 12px;
                margin-bottom: 8px;
                transition: background 0.2s, color 0.2s, padding 0.25s ease;
                border-left: 3px solid transparent;
            }
            .nav-item:hover, .nav-item.active { background: var(--glass); color: var(--text); }
            .nav-item.active { border-left-color: var(--accent); }
            .nav-icon {
                flex-shrink: 0;
                width: 20px;
                height: 20px;
            }
            .nav-label {
                white-space: nowrap;
                overflow: hidden;
                opacity: 1;
                transition: opacity 0.2s ease, max-width 0.25s ease;
                max-width: 160px;
            }

            body.sidebar-collapsed .sidebar {
                width: var(--sidebar-width-collapsed);
                padding: 20px 12px;
            }
            body.sidebar-collapsed .sidebar-header {
                justify-content: center;
                gap: 0;
            }
            body.sidebar-collapsed .logo {
                opacity: 0;
                max-width: 0;
                pointer-events: none;
            }
            body.sidebar-collapsed .nav-label {
                opacity: 0;
                max-width: 0;
            }
            body.sidebar-collapsed .nav-item {
                justify-content: center;
                padding: 12px;
                gap: 0;
            }
            body.sidebar-collapsed .sidebar-toggle svg {
                transform: rotate(180deg);
            }

            .main {
                flex: 1;
                margin-left: var(--sidebar-width);
                padding: 40px 60px;
                min-width: 0;
                transition: margin-left 0.25s ease;
            }
            body.sidebar-collapsed .main {
                margin-left: var(--sidebar-width-collapsed);
            }
            header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
            h1 { font-size: 2.2rem; font-weight: 600; }

            .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
            .card {
                background: var(--card-bg);
                border: 1px solid var(--border);
                border-radius: 20px;
                padding: 30px;
                position: relative;
                box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
            }
            .card h3 { margin-bottom: 8px; font-size: 1.1rem; }
            .card p { color: var(--text-muted); font-size: 0.9rem; line-height: 1.6; }

            .form-group { margin-bottom: 20px; }
            label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; }
            input, select {
                width: 100%;
                background: rgba(0,0,0,0.3);
                border: 1px solid var(--border);
                color: white;
                padding: 14px 18px;
                border-radius: 12px;
                font-family: inherit;
            }

            .btn {
                padding: 12px 24px;
                border-radius: 10px;
                border: none;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                font-family: inherit;
            }
            .btn-primary { background: var(--accent); color: white; }
            .btn-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
            .btn-secondary { background: var(--glass); color: var(--text); border: 1px solid var(--border); }

            .domain-item {
                background: var(--glass);
                border: 1px solid var(--border);
                border-radius: 16px;
                padding: 20px;
                margin-bottom: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .badge {
                padding: 4px 10px;
                border-radius: 8px;
                font-size: 0.7rem;
                background: rgba(59, 130, 246, 0.1);
                color: var(--accent);
            }

            .settings-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                gap: 24px;
            }

            .info-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid var(--border);
                font-size: 0.9rem;
            }
            .info-row:last-child { border-bottom: none; }
            .info-label { color: var(--text-muted); }
            .info-value { font-weight: 600; font-variant-numeric: tabular-nums; }

            #toast {
                position: fixed; bottom: 40px; right: 40px;
                padding: 16px 24px; border-radius: 16px;
                background: var(--card-bg);
                border: 1px solid var(--border);
                transform: translateX(200%);
                transition: transform 0.4s;
                z-index: 1000;
            }
            #toast.show { transform: translateX(0); }
        </style>
        ${options.extraHead ?? ""}
    </head>
    <body>
        <script>if(localStorage.getItem('continuum-sidebar-collapsed')==='true')document.body.classList.add('sidebar-collapsed');</script>
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar" aria-expanded="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M9 3v18"/>
                        <path d="M14 9l3 3-3 3"/>
                    </svg>
                </button>
                <div class="logo">Continuum</div>
            </div>
            <nav>${navHtml}</nav>
        </div>

        <div class="main">
            ${options.content}
        </div>

        <div id="toast"></div>
        <script>
            (function () {
                const storageKey = 'continuum-sidebar-collapsed';
                const toggle = document.getElementById('sidebarToggle');
                const collapsed = localStorage.getItem(storageKey) === 'true';
                function applyState(isCollapsed) {
                    document.body.classList.toggle('sidebar-collapsed', isCollapsed);
                    toggle.setAttribute('aria-expanded', String(!isCollapsed));
                    toggle.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
                }
                applyState(collapsed);
                toggle.addEventListener('click', () => {
                    const next = !document.body.classList.contains('sidebar-collapsed');
                    applyState(next);
                    localStorage.setItem(storageKey, String(next));
                });
            })();
        </script>
        ${options.extraScripts ? `<script>${options.extraScripts}</script>` : ""}
    </body>
    </html>
    `;
}

export function adminToastScript(): string {
    return `
        function showToast(msg, isSuccess) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.style.borderColor = isSuccess ? 'var(--success)' : 'var(--border)';
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }
    `;
}
