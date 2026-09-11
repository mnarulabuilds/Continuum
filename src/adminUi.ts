import { adminToastScript, renderAdminLayout } from "./adminLayout.js";

export function renderAdminDashboard(): string {
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
                const res = await fetch('/admin/domains');
                const data = await res.json();
                renderDomains(data);
            }

            function renderDomains(domains) {
                const list = document.getElementById('domainList');
                list.innerHTML = '';
                Object.entries(domains).forEach(([host, config]) => {
                    const item = document.createElement('div');
                    item.className = 'domain-item';
                    const origin = typeof config === 'string' ? config : config.origin;
                    item.innerHTML = \`
                        <div>
                            <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 4px;">\${host}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); font-family: monospace;">\${origin}</div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <button class="btn" style="padding: 6px 12px; font-size: 0.7rem;" onclick="verifyDNS('\${host}')">Verify DNS</button>
                            <button class="btn" style="padding: 6px 12px; font-size: 0.7rem;" onclick="provisionSSL('\${host}')">SSL</button>
                            <button class="btn" style="padding: 6px 12px; font-size: 0.7rem; color: var(--danger);" onclick="deleteDomain('\${host}')">Delete</button>
                        </div>
                    \`;
                    list.appendChild(item);
                });
            }

            async function verifyDNS(host) {
                showToast('Checking DNS...');
                const res = await fetch('/admin/dns-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostname: host })
                });
                const data = await res.json();
                if (data.success) showToast('DNS correctly pointed', true);
                else showToast(data.error ?? 'DNS verification failed');
            }

            async function provisionSSL(host) {
                showToast('Requesting SSL...');
                const res = await fetch('/admin/ssl-provision', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostname: host })
                });
                const data = await res.json();
                if (data.success) showToast('SSL issued successfully', true);
                else showToast('SSL failed: ' + (data.error ?? data.msg ?? 'unknown error'));
            }

            async function deleteDomain(host) {
                if (!confirm('Delete ' + host + '?')) return;
                await fetch('/admin/domains', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostname: host })
                });
                fetchDomains();
            }

            document.getElementById('addDomainForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await fetch('/admin/domains', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hostname: document.getElementById('hostInput').value,
                        origin: document.getElementById('originInput').value
                    })
                });
                e.target.reset();
                fetchDomains();
                showToast('Domain added', true);
            });

            fetchDomains();
            document.getElementById('cdn-host').textContent = window.location.host;
        `,
    });
}
