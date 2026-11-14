import { adminToastScript, renderAdminLayout } from "./adminLayout.js";

export function renderAdminDashboard(defaultTtl = 3600): string {
    const content = `
            <header>
                <h1>Domain Management</h1>
            </header>

            <div class="grid">
                <div>
                    <div class="card" style="margin-bottom: 30px;">
                        <form id="addDomainForm">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                                <div class="form-group">
                                    <label>Hostname</label>
                                    <input type="text" id="hostInput" placeholder="blog.site.com" required>
                                </div>
                                <div class="form-group">
                                    <label>Origin</label>
                                    <input type="url" id="originInput" placeholder="https://origin.com" required>
                                </div>
                                <div class="form-group">
                                    <label>Default cache TTL (seconds)</label>
                                    <input type="number" id="defaultTtlInput" min="0" max="31536000" value="${defaultTtl}" required>
                                </div>
                                <div class="form-group">
                                    <label>Maximum cache TTL (seconds)</label>
                                    <input type="number" id="maxTtlInput" min="0" max="31536000" value="${defaultTtl}" required>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary">Provision Domain</button>
                        </form>
                    </div>
                    <div id="domainList"></div>
                </div>

                <div class="card">
                    <h3>Edge Network Instructions</h3>
                    <p style="margin-top: 15px;">
                        To point a new domain to Continuum:<br><br>
                        1. Create a <b>CNAME</b> record in your DNS provider.<br>
                        2. Point it to: <code id="cdn-host">edge.continuum-cdn.com</code><br>
                        3. Click "Verify DNS" to check status.
                    </p>
                </div>
            </div>
    `;

    return renderAdminLayout({
        activeNav: "domains",
        title: "Admin Control Center",
        content,
        extraScripts: `
            ${adminToastScript()}

            async function fetchDomains() {
                try {
                    const res = await fetch('/admin/domains');
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? 'Unable to load domains');
                    renderDomains(data);
                } catch (error) {
                    showToast(error.message ?? 'Unable to load domains');
                }
            }

            function renderDomains(domains) {
                const list = document.getElementById('domainList');
                list.replaceChildren();
                Object.entries(domains).forEach(([host, config]) => {
                    const item = document.createElement('div');
                    item.className = 'domain-item';
                    const domain = typeof config === 'string' ? { origin: config } : config;
                    const details = document.createElement('div');
                    const hostname = document.createElement('div');
                    hostname.style.cssText = 'font-weight: 600; font-size: 1.1rem; margin-bottom: 4px;';
                    hostname.textContent = host;
                    const origin = document.createElement('div');
                    origin.style.cssText = 'font-size: 0.85rem; color: var(--text-muted); font-family: monospace;';
                    origin.textContent = Array.isArray(domain.origin) ? domain.origin.join(', ') : domain.origin;
                    const policy = domain.cachePolicy ?? { defaultTtl: 3600, maxTtl: 3600 };
                    const policyForm = document.createElement('form');
                    policyForm.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-top: 10px;';
                    const defaultTtl = document.createElement('input');
                    defaultTtl.type = 'number';
                    defaultTtl.min = '0';
                    defaultTtl.max = '31536000';
                    defaultTtl.style.width = '120px';
                    defaultTtl.value = String(policy.defaultTtl);
                    defaultTtl.setAttribute('aria-label', 'Default cache TTL in seconds');
                    const maxTtl = document.createElement('input');
                    maxTtl.type = 'number';
                    maxTtl.min = '0';
                    maxTtl.max = '31536000';
                    maxTtl.style.width = '120px';
                    maxTtl.value = String(policy.maxTtl);
                    maxTtl.setAttribute('aria-label', 'Maximum cache TTL in seconds');
                    const savePolicy = document.createElement('button');
                    savePolicy.type = 'submit';
                    savePolicy.className = 'btn btn-secondary';
                    savePolicy.textContent = 'Save cache policy';
                    policyForm.append(defaultTtl, maxTtl, savePolicy);
                    policyForm.addEventListener('submit', (event) => {
                        event.preventDefault();
                        saveCachePolicy(host, Number(defaultTtl.value), Number(maxTtl.value));
                    });
                    details.append(hostname, origin, policyForm);
                    const actions = document.createElement('div');
                    actions.style.cssText = 'display: flex; gap: 10px; align-items: center;';
                    actions.append(
                        actionButton('Verify DNS', () => verifyDNS(host)),
                        actionButton('SSL', () => provisionSSL(host)),
                        actionButton('Delete', () => deleteDomain(host), 'btn-danger'),
                    );
                    item.append(details, actions);
                    list.appendChild(item);
                });
            }

            function actionButton(label, action, extraClass = '') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn ' + extraClass;
                button.style.cssText = 'padding: 6px 12px; font-size: 0.7rem;';
                button.textContent = label;
                button.addEventListener('click', action);
                return button;
            }

            async function verifyDNS(host) {
                showToast('Checking DNS...');
                try {
                    const res = await fetch('/admin/dns-verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostname: host })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.error ?? 'DNS verification failed');
                    showToast('DNS correctly pointed', true);
                } catch (error) { showToast(error.message ?? 'DNS verification failed'); }
            }

            async function provisionSSL(host) {
                showToast('Requesting SSL...');
                try {
                    const res = await fetch('/admin/ssl-provision', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostname: host })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.error ?? 'SSL provisioning failed');
                    showToast('SSL issued successfully', true);
                } catch (error) { showToast('SSL failed: ' + (error.message ?? 'unknown error')); }
            }

            async function deleteDomain(host) {
                if (!confirm('Delete ' + host + '?')) return;
                try {
                    const res = await fetch('/admin/domains', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostname: host })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.error ?? 'Unable to delete domain');
                    fetchDomains();
                } catch (error) { showToast(error.message ?? 'Unable to delete domain'); }
            }

            async function saveCachePolicy(hostname, defaultTtl, maxTtl) {
                try {
                    const res = await fetch('/admin/domains', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostname, cachePolicy: { defaultTtl, maxTtl } })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.error ?? 'Unable to save cache policy');
                    showToast('Cache policy saved', true);
                } catch (error) { showToast(error.message ?? 'Unable to save cache policy'); }
            }

            document.getElementById('addDomainForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const res = await fetch('/admin/domains', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            hostname: document.getElementById('hostInput').value,
                            origin: document.getElementById('originInput').value,
                            cachePolicy: {
                                defaultTtl: Number(document.getElementById('defaultTtlInput').value),
                                maxTtl: Number(document.getElementById('maxTtlInput').value),
                            }
                        })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.error ?? 'Unable to add domain');
                    e.target.reset();
                    fetchDomains();
                    showToast('Domain added', true);
                } catch (error) { showToast(error.message ?? 'Unable to add domain'); }
            });

            fetchDomains();
            document.getElementById('cdn-host').textContent = window.location.host;
        `,
    });
}
