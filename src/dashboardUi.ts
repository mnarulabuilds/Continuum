import type { AnalyticsStats } from "./analytics.js";
import { renderAdminLayout } from "./adminLayout.js";

export function renderDashboard(stats: AnalyticsStats): string {
    const hitRate = stats.totalRequests ? ((stats.hits / stats.totalRequests) * 100).toFixed(2) : 0;

    const formatBandwidth = (bytes: number): string => {
        if (!bytes) return "0 B";
        if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${bytes} B`;
    };

    const historyData = JSON.stringify(stats.history || []);
    const regionsData = JSON.stringify(stats.regions || {});
    const urlStatsData = JSON.stringify(stats.urlStats || {});

    const content = `
            <header>
                <div>
                    <h1>Global Analytics</h1>
                    <p style="color: var(--text-muted); margin-top: 8px;"><span id="status-dot"></span>Edge network status: Active</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">LAST UPDATED</div>
                    <div style="font-weight: 600; font-variant-numeric: tabular-nums;" id="last-updated">${new Date().toLocaleTimeString()}</div>
                </div>
            </header>

            <div class="stats-grid">
                <div class="card">
                    <div class="card-title">Edge Requests</div>
                    <div class="card-value" id="stat-requests">${stats.totalRequests}</div>
                </div>
                <div class="card">
                    <div class="card-title">Global Bandwidth</div>
                    <div class="card-value accent-purple" id="stat-bandwidth">${formatBandwidth(stats.bandwidth)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Cache Hit Rate</div>
                    <div class="card-value accent-hit" id="stat-hitrate">${hitRate}%</div>
                </div>
                <div class="card">
                    <div class="card-title">Active POPs</div>
                    <div class="card-value accent-blue">${Object.keys(stats.regions || {}).length}</div>
                </div>
            </div>

            <div class="search-bar">
                <input type="text" id="url-search" placeholder="Filter by request URL (e.g. /images/logo.png)..." autocomplete="off">
                <button class="search-btn" onclick="filterByUrl()">Search & Filter</button>
            </div>

            <div class="main-grid">
                <div class="map-container card">
                    <div class="card-title" style="margin-bottom: 15px;">Global Request Distribution</div>
                    <div id="world-map"></div>
                </div>
                <div class="card" style="display: flex; flex-direction: column;">
                    <div class="card-title" style="margin-bottom: 15px;">Top Requested Assets</div>
                    <div class="top-url-list" id="top-urls">
                        ${Object.entries(stats.urlStats || {})
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 7)
            .map(([url, s]) => `
                                <div class="url-item">
                                    <div class="url-path" title="${url}">${url}</div>
                                    <div style="font-weight: 600; font-size: 0.9rem;">${s.total}</div>
                                </div>
                            `).join('') || '<div style="color: var(--text-muted); text-align: center; margin-top: 20px;">No URLs logged yet</div>'}
                    </div>
                </div>
            </div>

            <div class="chart-container card">
                <div class="card-title" style="margin-bottom: 15px;">Traffic Performance (Last 60m)</div>
                <canvas id="trafficChart"></canvas>
            </div>

            <div class="table-container card" style="padding: 0; overflow: hidden;">
                <table>
                    <thead>
                        <tr>
                            <th>Domain</th>
                            <th>Total Traffic</th>
                            <th>Hits</th>
                            <th>Misses</th>
                            <th>Hit Rate</th>
                            <th>Bandwidth</th>
                        </tr>
                    </thead>
                    <tbody id="domain-table">
                        ${Object.entries(stats.domains || {}).map(([domain, d]) => {
                const dHitRate = d.totalRequests ? ((d.hits / d.totalRequests) * 100).toFixed(1) : 0;
                return `
                                <tr>
                                    <td style="font-weight: 600;">${domain}</td>
                                    <td>${d.totalRequests}</td>
                                    <td><span class="text-hit">${d.hits}</span></td>
                                    <td><span class="text-miss">${d.misses}</span></td>
                                    <td><span class="badge badge-hit">${dHitRate}%</span></td>
                                    <td>${formatBandwidth(d.bandwidth)}</td>
                                </tr>
                            `;
            }).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No domain traffic</td></tr>'}
                    </tbody>
                </table>
            </div>
    `;

    const extraHead = `
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsvectormap/dist/css/jsvectormap.min.css">
        <script src="https://cdn.jsdelivr.net/npm/jsvectormap"></script>
        <script src="https://cdn.jsdelivr.net/npm/jsvectormap/dist/maps/world.js"></script>
        <style>
            :root {
                --hit: #10b981;
                --miss: #f59e0b;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                margin-bottom: 24px;
            }
            .card-title {
                font-size: 0.75rem;
                color: var(--text-muted);
                text-transform: uppercase;
                font-weight: 600;
                letter-spacing: 1px;
            }
            .card-value { font-size: 1.8rem; font-weight: 600; margin-top: 8px; }
            .accent-purple { color: #a855f7; }
            .accent-hit { color: var(--hit); }
            .accent-blue { color: var(--accent); }
            .text-hit { color: var(--hit); }
            .text-miss { color: var(--miss); }

            .main-grid {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 24px;
                margin-bottom: 24px;
            }
            .map-container { height: 450px; }
            #world-map { width: 100%; height: calc(100% - 30px); }
            .chart-container { height: 350px; margin-bottom: 24px; }

            .search-bar { margin-bottom: 24px; display: flex; gap: 12px; }
            .search-bar input {
                flex: 1;
                background: rgba(0,0,0,0.3);
                border: 1px solid var(--border);
                padding: 12px 20px;
                border-radius: 12px;
                color: white;
                font-family: inherit;
                outline: none;
            }
            .search-btn {
                background: linear-gradient(135deg, #60a5fa 0%, #a855f7 100%);
                border: none;
                padding: 12px 24px;
                border-radius: 12px;
                color: white;
                font-weight: 600;
                cursor: pointer;
                font-family: inherit;
            }

            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 16px 24px; text-align: left; border-bottom: 1px solid var(--border); }
            th { background: rgba(0,0,0,0.3); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; }
            tr:last-child td { border-bottom: none; }
            tr:hover td { background: rgba(255,255,255,0.02); }

            .badge-hit { background: rgba(16, 185, 129, 0.1); color: var(--hit); padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }

            .top-url-list { display: flex; flex-direction: column; gap: 12px; }
            .url-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                border-radius: 12px;
                background: rgba(255,255,255,0.03);
                border: 1px solid var(--border);
            }
            .url-path {
                font-family: monospace;
                font-size: 0.9rem;
                color: #60a5fa;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 200px;
            }

            #status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--hit);
                box-shadow: 0 0 10px var(--hit);
                display: inline-block;
                margin-right: 8px;
            }

            @media (max-width: 1200px) {
                .stats-grid { grid-template-columns: repeat(2, 1fr); }
                .main-grid { grid-template-columns: 1fr; }
            }
        </style>
    `;

    const extraScripts = `
            const fullStats = {
                history: ${historyData},
                regions: ${regionsData},
                urlStats: ${urlStatsData},
                totalRequests: ${stats.totalRequests},
                bandwidth: ${stats.bandwidth},
                hits: ${stats.hits},
                domains: ${JSON.stringify(stats.domains || {})}
            };

            let map = null;

            function initMap(regions) {
                if (map) map.destroy();
                const mapData = {};
                Object.entries(regions).forEach(([code, count]) => { mapData[code] = count; });
                map = new jsVectorMap({
                    selector: '#world-map',
                    map: 'world',
                    backgroundColor: 'transparent',
                    draggable: true,
                    zoomButtons: false,
                    regionStyle: {
                        initial: { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.1)', strokeWidth: 0.5 },
                        hover: { fill: 'rgba(59, 130, 246, 0.5)' }
                    },
                    visualizeData: {
                        scale: ['#1e293b', '#3b82f6'],
                        values: mapData
                    },
                    onRegionTooltipShow(event, tooltip, code) {
                        const count = mapData[code] || 0;
                        tooltip.text('<b>' + tooltip.text() + '</b><br/>Requests: ' + count);
                    }
                });
            }

            function filterByUrl() {
                const search = document.getElementById('url-search').value.trim();
                let filteredStats = {...fullStats};
                if (search) {
                    const u = fullStats.urlStats[search];
                    if (u) {
                        filteredStats = {
                            ...fullStats,
                            totalRequests: u.total,
                            bandwidth: u.bandwidth,
                            hits: u.hits,
                            misses: u.misses,
                            regions: u.regions
                        };
                    } else {
                        alert('No data found for this specific URL path.');
                        return;
                    }
                }
                document.getElementById('stat-requests').innerText = filteredStats.totalRequests;
                document.getElementById('stat-bandwidth').innerText = formatBandwidth(filteredStats.bandwidth);
                const hr = filteredStats.totalRequests ? ((filteredStats.hits / filteredStats.totalRequests) * 100).toFixed(2) : 0;
                document.getElementById('stat-hitrate').innerText = hr + '%';
                initMap(filteredStats.regions);
            }

            function formatBandwidth(bytes) {
                if (!bytes) return "0 B";
                if (bytes > 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
                if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
                if (bytes > 1024) return (bytes / 1024).toFixed(2) + " KB";
                return bytes + " B";
            }

            const ctx = document.getElementById('trafficChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: fullStats.history.map(p => new Date(p.timestamp).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})),
                    datasets: [
                        { label: 'Hits', data: fullStats.history.map(p => p.hits), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 },
                        { label: 'Misses', data: fullStats.history.map(p => p.misses), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } } },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
                    }
                }
            });

            window.addEventListener('load', () => initMap(fullStats.regions));

            const searchInput = document.getElementById('url-search');
            setInterval(() => {
                if (!searchInput.value) window.location.reload();
            }, 30000);
    `;

    return renderAdminLayout({
        activeNav: "analytics",
        title: "Global Analytics",
        content,
        extraHead,
        extraScripts,
    });
}
