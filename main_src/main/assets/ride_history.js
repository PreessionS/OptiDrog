class RideHistoryManager {
    constructor() {
        this.currentView = 'list';
        this.rides = [];
        this.map = null;
        this.trackLayer = null;
        this.markersLayer = null;
        this.deleteRideId = null;
    }

    init() {
        if (typeof Android === 'undefined') {
            const container = document.getElementById('rides-list');
            if (container) {
                container.innerHTML = '<div class="rh-empty"><div class="rh-empty-icon">📱</div><div class="rh-empty-text">Funkcja dostępna tylko w aplikacji</div></div>';
            }
            return;
        }

        // Sprawdź czy historia przejazdów jest włączona w ustawieniach
        if (typeof Android.isRideHistoryEnabled === 'function') {
            if (!Android.isRideHistoryEnabled()) {
                this.showDisabledState();
                return;
            }
        }

        try { Android.rhCleanupOldRides(); } catch (e) { }

        this.loadRides();
        this.renderRidesList();
    }

    loadRides() {
        try {
            const json = Android.rhGetRidesLast30Days();
            this.rides = json ? JSON.parse(json) : [];
        } catch (e) {
            this.rides = [];
        }
    }

    renderRidesList() {
        const container = document.getElementById('rides-list');
        if (!container) return;

        if (!this.rides || this.rides.length === 0) {
            this.showEmptyState();
            return;
        }

        const sorted = [...this.rides].sort((a, b) => b.startTs - a.startTs);
        container.innerHTML = sorted.map(ride => this.renderRideCard(ride)).join('');
    }

    renderRideCard(ride) {
        const date = this.formatDate(ride.startTs);
        const timeStart = this.formatTime(ride.startTs);
        const timeEnd = ride.endTs ? this.formatTime(ride.endTs) : '—';
        const duration = this.formatDuration(ride.durationS || 0);
        const distance = this.formatDistance(ride.distanceM || 0);
        const isOpen = ride.status !== 'closed';
        const badgeClass = isOpen ? 'rh-badge-open' : 'rh-badge-closed';
        const badgeLabel = isOpen ? 'W trakcie' : 'Zakończona';

        return `
            <div class="rh-card" onclick="rideHistoryManager.openRideDetail('${ride.id}')">
                <div class="rh-card-header">
                    <div>
                        <div class="rh-card-date">${date}</div>
                        <div class="rh-card-time">${timeStart} – ${timeEnd}</div>
                    </div>
                    <span class="rh-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="rh-card-stats">
                    <div class="rh-stat">
                        <div class="rh-stat-value">${distance}</div>
                        <div class="rh-stat-label">Dystans</div>
                    </div>
                    <div class="rh-stat">
                        <div class="rh-stat-value">${duration}</div>
                        <div class="rh-stat-label">Czas jazdy</div>
                    </div>
                    <div class="rh-stat">
                        <div class="rh-stat-value">${ride.pointsCount || 0}</div>
                        <div class="rh-stat-label">Punkty</div>
                    </div>
                </div>
                <div class="rh-card-actions">
                    <button class="rh-delete-btn" onclick="event.stopPropagation(); rideHistoryManager.confirmDeleteRide('${ride.id}')">🗑️ Usuń</button>
                </div>
            </div>`;
    }

    formatDate(ts) {
        const d = new Date(ts);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}.${d.getFullYear()}`;
    }

    formatTime(ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    formatDuration(seconds) {
        if (!seconds || seconds < 60) return '< 1 min';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
        return `${minutes} min`;
    }

    formatDistance(meters) {
        if (!meters || meters < 100) return `${Math.round(meters || 0)} m`;
        return `${(meters / 1000).toFixed(1)} km`;
    }

    openRideDetail(rideId) {
        let ride;
        try {
            const json = Android.rhGetRide(rideId);
            ride = json ? JSON.parse(json) : null;
        } catch (e) {
            return;
        }
        if (!ride || !ride.id) return;

        this.currentView = 'detail';
        document.getElementById('rh-list-view').classList.add('hidden');
        const detailView = document.getElementById('rh-detail-view');
        detailView.classList.add('active');

        this.renderDetailHeader(ride);
        this.renderPointsList(ride);
        this.renderTimeline(ride);

        // Setup CSV export button
        const csvBtn = document.getElementById('rh-csv-btn');
        if (csvBtn) {
            csvBtn.onclick = () => this.exportRideToCSV(ride);
        }

        setTimeout(() => {
            this.initDetailMap(ride);
            this.drawPointMarkers(ride);
            this.drawStops(ride);
            this.loadAndDrawTrack(ride);
        }, 100);
    }

    renderDetailHeader(ride) {
        const container = document.getElementById('rh-detail-header');
        if (!container) return;

        const date = this.formatDate(ride.startTs);
        const timeStart = this.formatTime(ride.startTs);
        const timeEnd = ride.endTs ? this.formatTime(ride.endTs) : '—';
        const stats = ride.stats || {};
        const distance = this.formatDistance(stats.distanceM || 0);
        const duration = this.formatDuration(stats.durationS || 0);
        const points = ride.route && ride.route.pointsSnapshot ? ride.route.pointsSnapshot.length : 0;

        const delivered = ride.actions ? Object.values(ride.actions).filter(a => a.deliveredTs).length : 0;
        const skipped = ride.actions ? Object.values(ride.actions).filter(a => a.skippedTs).length : 0;
        const stopsCount = ride.stops ? ride.stops.length : 0;

        container.innerHTML = `
            <div class="rh-detail-header">
                <div class="rh-detail-title">${date} • ${timeStart} – ${timeEnd}</div>
                <div class="rh-detail-subtitle">
                    ${delivered} dostarczonych • ${skipped} pominiętych • ${stopsCount} postojów
                </div>
                <div class="rh-detail-stats">
                    <div class="rh-detail-stat">
                        <div class="rh-detail-stat-value">${distance}</div>
                        <div class="rh-detail-stat-label">Dystans</div>
                    </div>
                    <div class="rh-detail-stat">
                        <div class="rh-detail-stat-value">${duration}</div>
                        <div class="rh-detail-stat-label">Czas jazdy</div>
                    </div>
                    <div class="rh-detail-stat">
                        <div class="rh-detail-stat-value">${points}</div>
                        <div class="rh-detail-stat-label">Punkty</div>
                    </div>
                    <div class="rh-detail-stat">
                        <div class="rh-detail-stat-value">${ride.track ? ride.track.trackPointCount : 0}</div>
                        <div class="rh-detail-stat-label">Punkty GPS</div>
                    </div>
                </div>
            </div>`;
    }

    renderPointsList(ride) {
        const container = document.getElementById('rh-points-list');
        if (!container || !ride.route || !ride.route.pointsSnapshot) {
            if (container) container.innerHTML = '';
            return;
        }

        const actions = ride.actions || {};
        container.innerHTML = ride.route.pointsSnapshot.map(point => {
            const action = actions[point.pointId];
            let dotColor = '#2196F3';
            let statusText = '';
            let statusStyle = '';

            if (action && action.deliveredTs) {
                dotColor = '#4CAF50';
                statusText = 'Dostarczone';
                statusStyle = 'background:rgba(76,175,80,0.15);color:#4CAF50;';
            } else if (action && action.skippedTs) {
                dotColor = '#F44336';
                statusText = 'Pominięte';
                statusStyle = 'background:rgba(244,67,54,0.15);color:#F44336;';
            }

            return `
                <div class="rh-point-item">
                    <div class="rh-point-dot" style="background:${dotColor};"></div>
                    <span class="rh-point-order">${point.order}</span>
                    <span class="rh-point-label">${point.label || point.pointId}</span>
                    ${statusText ? `<span class="rh-point-status" style="${statusStyle}">${statusText}</span>` : ''}
                </div>`;
        }).join('');
    }

    initDetailMap(ride) {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.map = L.map('rh-map').setView([52.2297, 21.0122], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(this.map);

        this.trackLayer = L.layerGroup().addTo(this.map);
        this.markersLayer = L.layerGroup().addTo(this.map);

        const points = ride.route && ride.route.pointsSnapshot ? ride.route.pointsSnapshot : [];
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
            this.map.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    async loadAndDrawTrack(ride) {
        if (!ride.track || !ride.track.chunkKeys || ride.track.chunkKeys.length === 0) return;

        let allPoints = [];
        for (const chunkKey of ride.track.chunkKeys) {
            try {
                const json = Android.rhGetTrackChunk(chunkKey);
                const chunk = json ? JSON.parse(json) : [];
                allPoints = allPoints.concat(chunk);
            } catch (e) { }
        }

        if (allPoints.length === 0) return;
        allPoints.sort((a, b) => a.ts - b.ts);

        const segments = {};
        allPoints.forEach(p => {
            const seg = p.seg || 0;
            if (!segments[seg]) segments[seg] = [];
            segments[seg].push([p.lat, p.lng]);
        });

        Object.values(segments).forEach(coords => {
            if (coords.length < 2) return;
            L.polyline(coords, { color: '#FF6D00', weight: 4, opacity: 0.85 }).addTo(this.trackLayer);
        });

        const allLatLngs = allPoints.map(p => [p.lat, p.lng]);
        const bounds = L.latLngBounds(allLatLngs);
        if (ride.route && ride.route.pointsSnapshot) {
            ride.route.pointsSnapshot.forEach(p => bounds.extend([p.lat, p.lng]));
        }
        this.map.fitBounds(bounds, { padding: [30, 30] });
    }

    drawPointMarkers(ride) {
        if (!ride.route || !ride.route.pointsSnapshot) return;
        const actions = ride.actions || {};

        ride.route.pointsSnapshot.forEach(point => {
            const action = actions[point.pointId];
            let color = '#2196F3';
            if (action && action.deliveredTs) color = '#4CAF50';
            else if (action && action.skippedTs) color = '#F44336';

            const marker = L.circleMarker([point.lat, point.lng], {
                radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9
            });

            let popup = `<b>${point.order}. ${point.label || ''}</b>`;
            if (action && action.deliveredTs) popup += `<br><small>Dostarczono: ${this.formatTime(action.deliveredTs)}</small>`;
            else if (action && action.skippedTs) popup += `<br><small>Pominięto: ${this.formatTime(action.skippedTs)}</small>`;
            marker.bindPopup(popup);
            marker.addTo(this.markersLayer);
        });
    }

    drawStops(ride) {
        if (!ride.stops || ride.stops.length === 0) return;

        ride.stops.forEach(stop => {
            L.circle([stop.centerLat, stop.centerLng], {
                radius: 100, fillColor: '#FFD600', fillOpacity: 0.2, color: '#FFD600', weight: 1, opacity: 0.5
            }).addTo(this.markersLayer);
        });
    }

    renderTimeline(ride) {
        const container = document.getElementById('rh-timeline');
        if (!container) return;

        const events = [];
        const pointsMap = {};
        if (ride.route && ride.route.pointsSnapshot) {
            ride.route.pointsSnapshot.forEach(p => { pointsMap[p.pointId] = p; });
        }

        if (ride.route && ride.route.optimizeClickedTs) {
            events.push({
                ts: ride.route.optimizeClickedTs,
                type: 'start',
                label: 'Optymalizacja trasy',
                detail: `${ride.route.pointsSnapshot ? ride.route.pointsSnapshot.length : 0} punktów`
            });
        }

        if (ride.reoptimizations) {
            ride.reoptimizations.forEach((reopt, idx) => {
                events.push({
                    ts: reopt.ts,
                    type: 'start',
                    label: `Cicha reoptymalizacja #${idx + 1}`,
                    detail: `${reopt.pointsCount || 0} punktów`
                });
            });
        }

        if (ride.stops) {
            ride.stops.forEach(stop => {
                const point = pointsMap[stop.pointId];
                const label = point ? point.label : stop.pointId;
                const durationMs = stop.endTs && stop.startTs ? stop.endTs - stop.startTs : 0;
                events.push({
                    ts: stop.startTs,
                    type: 'stop',
                    label: `Postój przy ${label}`,
                    detail: durationMs > 0 ? this.formatDuration(Math.round(durationMs / 1000)) : 'Trwa...'
                });
            });
        }

        const actions = ride.actions || {};
        Object.entries(actions).forEach(([pointId, action]) => {
            const point = pointsMap[pointId];
            const label = point ? point.label : pointId;

            if (action.deliveredTs) {
                events.push({ ts: action.deliveredTs, type: 'delivered', label: `Dostarczone: ${label}`, detail: '' });
            }
            if (action.skippedTs) {
                events.push({ ts: action.skippedTs, type: 'skipped', label: `Pominięte: ${label}`, detail: '' });
            }
        });

        if (ride.endTs) {
            events.push({ ts: ride.endTs, type: 'start', label: 'Zakończenie trasy', detail: '' });
        }

        events.sort((a, b) => a.ts - b.ts);

        if (events.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--rh-text-sec);">Brak zdarzeń</div>';
            return;
        }

        container.innerHTML = events.map(e => `
            <div class="rh-timeline-item">
                <div class="rh-timeline-dot ${e.type}"></div>
                <div class="rh-timeline-content">
                    <div class="rh-timeline-label">${e.label}</div>
                    <div class="rh-timeline-time">${this.formatTime(e.ts)}</div>
                    ${e.detail ? `<div class="rh-timeline-detail">${e.detail}</div>` : ''}
                </div>
            </div>`).join('');
    }

    backToList() {
        this.currentView = 'list';

        if (this.map) {
            this.map.remove();
            this.map = null;
            this.trackLayer = null;
            this.markersLayer = null;
        }

        document.getElementById('rh-detail-view').classList.remove('active');
        document.getElementById('rh-list-view').classList.remove('hidden');

        this.loadRides();
        this.renderRidesList();
    }

    confirmDeleteRide(rideId) {
        this.deleteRideId = rideId;
        const modal = document.getElementById('rh-delete-modal');
        if (modal) modal.classList.add('active');

        const confirmBtn = document.getElementById('rh-confirm-delete-btn');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                // Zapisz rideId do zmiennej lokalnej PRZED zamknięciem modala
                const rideIdToDelete = this.deleteRideId;
                this.closeDeleteModal();
                this.deleteRide(rideIdToDelete);
            };
        }
    }

    closeDeleteModal() {
        const modal = document.getElementById('rh-delete-modal');
        if (modal) modal.classList.remove('active');
        this.deleteRideId = null;
    }

    deleteRide(rideId) {
        if (!rideId) return;

        let success = false;
        try {
            success = Android.rhDeleteRide(rideId);
        } catch (e) {
            console.error('Błąd usuwania przejazdu:', e);
        }

        if (!success) {
            if (typeof Android !== 'undefined' && Android.showToast) {
                Android.showToast('Nie udało się usunąć przejazdu');
            }
            return;
        }

        // Opóźnienie 100ms aby dać czas na commit SharedPreferences
        setTimeout(() => {
            if (this.currentView === 'detail') {
                this.backToList();
            } else {
                this.loadRides();
                this.renderRidesList();
            }
        }, 100);
    }

    exportRideToCSV(ride) {
        if (!ride) return;

        const stats = ride.stats || {};
        const date = this.formatDate(ride.startTs);
        const timeStart = this.formatTime(ride.startTs);
        const timeEnd = ride.endTs ? this.formatTime(ride.endTs) : 'W trakcie';

        // Nagłówek BOM dla Excela (UTF-8)
        let csv = '\uFEFF';
        csv += `Raport z trasy - OptiDrog\n`;
        csv += `Data;${date}\n`;
        csv += `Czas;${timeStart} - ${timeEnd}\n`;
        csv += `Dystans;${this.formatDistance(stats.distanceM || 0)}\n`;
        csv += `Czas jazdy;${this.formatDuration(stats.durationS || 0)}\n`;
        csv += `\n`;

        // Punkty
        csv += `PUNKTY TRASY\n`;
        csv += `Lp;Adres;Status;Czas realizacji\n`;

        if (ride.route && ride.route.pointsSnapshot) {
            const actions = ride.actions || {};
            ride.route.pointsSnapshot.forEach(p => {
                const action = actions[p.pointId] || {};
                let status = 'Bez akcji';
                let actionTs = '';
                if (action.deliveredTs) {
                    status = 'Dostarczone';
                    actionTs = this.formatTime(action.deliveredTs);
                } else if (action.skippedTs) {
                    status = 'Pominięte';
                    actionTs = this.formatTime(action.skippedTs);
                }
                csv += `${p.order};"${(p.label || p.pointId).toString().replace(/"/g, '""')}";${status};${actionTs}\n`;
            });
        }
        csv += `\n`;

        // Postoje
        csv += `POSTOJE\n`;
        csv += `Lp;Start;Koniec;Czas trwania\n`;
        if (ride.stops && ride.stops.length > 0) {
            ride.stops.forEach((stop, idx) => {
                const start = this.formatTime(stop.startTs);
                const end = stop.endTs ? this.formatTime(stop.endTs) : '...';
                const duration = stop.endTs ? this.formatDuration(Math.round((stop.endTs - stop.startTs) / 1000)) : 'W trakcie';
                csv += `${idx + 1};${start};${end};${duration}\n`;
            });
        } else {
            csv += `Brak zarejestrowanych postojów\n`;
        }

        const fileName = `Trasa_${date.replace(/\./g, '-')}_${timeStart.replace(/:/g, '-')}.csv`;

        try {
            if (typeof Android !== 'undefined' && Android.saveReportCsv) {
                Android.saveReportCsv(csv, fileName);
            } else if (typeof Android !== 'undefined' && Android.shareFile) {
                Android.shareFile(csv, fileName);
            } else if (typeof Android !== 'undefined' && Android.shareText) {
                Android.shareText(csv, fileName);
            } else {
                console.log('CSV Export:', csv);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", fileName);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (e) {
            console.error('Błąd eksportu CSV:', e);
            if (typeof Android !== 'undefined' && Android.showToast) {
                Android.showToast('Błąd eksportu CSV');
            }
        }
    }

    showEmptyState() {
        const container = document.getElementById('rides-list');
        if (!container) return;
        container.innerHTML = `
            <div class="rh-empty">
                <div class="rh-empty-icon">🛣️</div>
                <div class="rh-empty-text">Brak historii przejazdów</div>
                <div class="rh-empty-sub">Zoptymalizuj trasę, aby rozpocząć rejestrowanie przejazdów</div>
            </div>`;
    }

    // Wyświetla komunikat gdy historia przejazdów jest wyłączona w ustawieniach
    showDisabledState() {
        const container = document.getElementById('rides-list');
        if (!container) return;
        container.innerHTML = `
            <div class="rh-empty">
                <div class="rh-empty-icon">⚙️</div>
                <div class="rh-empty-text">Historia przejazdów wyłączona</div>
                <div class="rh-empty-sub">Włącz historię w Ustawieniach, aby rejestrować trasy</div>
            </div>`;
    }
}

let rideHistoryManager;
document.addEventListener('DOMContentLoaded', () => {
    rideHistoryManager = new RideHistoryManager();
    rideHistoryManager.init();
});
