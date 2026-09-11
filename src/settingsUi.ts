import { adminToastScript, renderAdminLayout } from "./adminLayout.js";

export type SettingsSnapshot = {
    environment: string;
    port: number;
    redisEnabled: boolean;
    clusterEnabled: boolean;
    analyticsEnabled: boolean;
    compressionEnabled: boolean;
    defaultTtl: number;
    cacheMaxSizeMb: number;
    httpsEnabled: boolean;
    websocketEnabled: boolean;
};

export function renderSettingsPage(snapshot: SettingsSnapshot): string {
    const content = `
            <header>
                <h1>Settings</h1>
            </header>

            <div class="settings-grid">
                <div class="card">
                    <h3>Cache Purge</h3>
                    <p style="margin-bottom: 20px;">Remove cached assets for a specific path or flush the entire edge cache.</p>
                    <form id="purgeForm">
                        <div class="form-group">
                            <label>Domain (optional)</label>
                            <input type="text" id="purgeDomain" placeholder="cdn.example.com">
                        </div>
                        <div class="form-group">
                            <label>Path or URL</label>
                            <input type="text" id="purgePath" placeholder="/assets/app.js or all" required>
                        </div>
                        <button type="submit" class="btn btn-primary">Purge Cache</button>
                    </form>
                </div>

                <div class="card">
                    <h3>Analytics</h3>
                    <p style="margin-bottom: 20px;">Clear all collected traffic statistics. This cannot be undone.</p>
                    <button type="button" class="btn btn-danger" id="resetAnalyticsBtn">Reset Analytics Data</button>
                </div>

                <div class="card">
                    <h3>System Configuration</h3>
                    <p style="margin-bottom: 12px;">Runtime settings loaded from environment variables.</p>
                    <div class="info-row"><span class="info-label">Environment</span><span class="info-value">${snapshot.environment}</span></div>
                    <div class="info-row"><span class="info-label">Port</span><span class="info-value">${snapshot.port}</span></div>
                    <div class="info-row"><span class="info-label">Redis</span><span class="info-value">${snapshot.redisEnabled ? "Enabled" : "Disabled"}</span></div>
                    <div class="info-row"><span class="info-label">Cluster Mode</span><span class="info-value">${snapshot.clusterEnabled ? "Enabled" : "Disabled"}</span></div>
                    <div class="info-row"><span class="info-label">Analytics</span><span class="info-value">${snapshot.analyticsEnabled ? "Enabled" : "Disabled"}</span></div>
                    <div class="info-row"><span class="info-label">Compression</span><span class="info-value">${snapshot.compressionEnabled ? "Enabled" : "Disabled"}</span></div>
                    <div class="info-row"><span class="info-label">Default TTL</span><span class="info-value">${snapshot.defaultTtl}s</span></div>
                    <div class="info-row"><span class="info-label">Cache Limit</span><span class="info-value">${snapshot.cacheMaxSizeMb} MB</span></div>
                    <div class="info-row"><span class="info-label">HTTPS</span><span class="info-value">${snapshot.httpsEnabled ? "Enabled" : "Disabled"}</span></div>
                    <div class="info-row"><span class="info-label">WebSockets</span><span class="info-value">${snapshot.websocketEnabled ? "Enabled" : "Disabled"}</span></div>
                </div>

                <div class="card">
                    <h3>Session</h3>
                    <p style="margin-bottom: 20px;">Sign out of the admin console on this device.</p>
                    <button type="button" class="btn btn-secondary" id="logoutBtn">Sign Out</button>
                </div>
            </div>
    `;

    return renderAdminLayout({
        activeNav: "settings",
        title: "Settings",
        content,
        extraScripts: `
            ${adminToastScript()}

            document.getElementById('purgeForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const path = document.getElementById('purgePath').value.trim();
                const domain = document.getElementById('purgeDomain').value.trim();
                const body = { path };
                if (domain) body.domain = domain;

                const res = await fetch('/cdn-purge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                if (res.ok && data.success) showToast('Purged ' + data.count + ' cache entries', true);
                else showToast(data.error ?? 'Cache purge failed');
            });

            document.getElementById('resetAnalyticsBtn').addEventListener('click', async () => {
                if (!confirm('Reset all analytics data? This cannot be undone.')) return;
                const res = await fetch('/admin/analytics/reset', { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.success) showToast('Analytics data reset', true);
                else showToast(data.error ?? 'Unable to reset analytics');
            });

            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await fetch('/auth/logout', { method: 'POST' });
                window.location.href = '/login';
            });
        `,
    });
}
