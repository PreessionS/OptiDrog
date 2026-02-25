// Główny plik zarządzania mapą Leaflet
// WERSJA Z SERWEREM PHP JAKO PROXY

class MapManager {
    constructor() {
        this.map = null;
        this.currentLocationMarker = null;
        this.currentLat = null;
        this.currentLng = null;
        this.routePolyline = null;
        this.routeMarkers = new Map(); // Map<addressKey, marker> dla znaczników trasy
        this.hasInitialCentering = false;
        this.longPressTimeout = null;
        this.longPressDelay = 500;
        this.isLongPressActive = false;
        this.lastLongPressLatLng = null;

        // KONFIGURACJA SERWERA PHP - ZMIEŃ NA SWÓJ ADRES
        this.API_BASE_URL = 'https://optidrog.pl/api';
        // Dla testów lokalnych: this.API_BASE_URL = 'http://localhost/api';

        this.API_KEY = ''; // Opcjonalnie
        this.API_TIMEOUT = 120000; // 2 minuty

        this.init();
    }

    // =====================================================
    // KOMUNIKACJA Z SERWEREM PHP
    // =====================================================

    /**
     * Pobiera trasę z serwera PHP
     */
    async getRouteFromServer(waypoints) {
        const url = `${this.API_BASE_URL}/route.php`;

        const requestBody = {
            waypoints: waypoints.map(wp => ({
                lat: wp.lat,
                lng: wp.lng
            }))
        };

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (this.API_KEY) {
            headers['X-API-Key'] = this.API_KEY;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.API_TIMEOUT);

            console.log(`📡 Wysyłam ${waypoints.length} punktów do serwera (route)...`);

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Serwer HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Nieznany błąd serwera');
            }

            console.log(`✅ Otrzymano trasę z serwera (provider: ${data.provider})`);

            return {
                success: true,
                geometry: data.geometry,
                distance: data.distance,
                duration: data.duration,
                provider: data.provider
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Timeout - serwer nie odpowiedział w ciągu 2 minut');
            }
            console.error('Błąd połączenia z serwerem route:', error);
            throw error;
        }
    }

    /**
     * Sprawdza status providerów tras na serwerze
     */
    async checkRouteProviders() {
        const url = `${this.API_BASE_URL}/route.php?action=status`;

        const headers = { 'Accept': 'application/json' };
        if (this.API_KEY) {
            headers['X-API-Key'] = this.API_KEY;
        }

        try {
            const response = await fetch(url, { method: 'GET', headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            console.log('Status providerów tras:', data);
            return data;
        } catch (error) {
            console.error('Błąd sprawdzania statusu route:', error);
            throw error;
        }
    }

    /**
     * Resetuje providera tras na serwerze
     */
    async resetRouteProvider() {
        const url = `${this.API_BASE_URL}/route.php?action=reset`;

        const headers = { 'Accept': 'application/json' };
        if (this.API_KEY) {
            headers['X-API-Key'] = this.API_KEY;
        }

        try {
            const response = await fetch(url, { method: 'GET', headers });
            const data = await response.json();
            console.log('Route provider zresetowany:', data);
            return data;
        } catch (error) {
            console.error('Błąd resetu route providera:', error);
            throw error;
        }
    }

    // =====================================================
    // INICJALIZACJA MAPY
    // =====================================================

    init() {
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Element mapy nie został znaleziony');
            return;
        }

        this.map = L.map('map').setView([52.2297, 21.0122], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(this.map);

        this.initLongPressHandler();

        setTimeout(() => this.addCenterOnLocationButton(), 200);

        console.log('Mapa zainicjalizowana pomyślnie');
    }

    // =====================================================
    // OBSŁUGA DŁUGIEGO PRZYTRZYMANIA
    // =====================================================

    initLongPressHandler() {
        let startTime = 0;
        let startPos = null;

        // Obsługa myszy
        this.map.on('mousedown', (e) => {
            startTime = Date.now();
            startPos = { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
            this.isLongPressActive = false;

            this.longPressTimeout = setTimeout(() => {
                if (startPos) {
                    this.isLongPressActive = true;
                    const mouseEvent = {
                        latlng: e.latlng,
                        originalEvent: e.originalEvent
                    };
                    this.handleLongPress(mouseEvent);
                }
            }, this.longPressDelay);
        });

        this.map.on('mouseup', (e) => {
            if (this.longPressTimeout) {
                clearTimeout(this.longPressTimeout);
                this.longPressTimeout = null;
            }

            if (this.isLongPressActive) {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
                this.isLongPressActive = false;
            }
        });

        this.map.on('mousemove', (e) => {
            if (startPos && this.longPressTimeout) {
                const currentPos = { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
                const distance = Math.sqrt(
                    Math.pow(currentPos.x - startPos.x, 2) +
                    Math.pow(currentPos.y - startPos.y, 2)
                );

                if (distance > 10) {
                    clearTimeout(this.longPressTimeout);
                    this.longPressTimeout = null;
                    this.isLongPressActive = false;
                }
            }
        });

        // Obsługa dotyku
        this.map.on('touchstart', (e) => {
            if (e.touches.length === 1) {
                startTime = Date.now();
                const touch = e.touches[0];
                startPos = { x: touch.clientX, y: touch.clientY };
                this.isLongPressActive = false;

                this.longPressTimeout = setTimeout(() => {
                    if (startPos) {
                        this.isLongPressActive = true;
                        const mapContainer = this.map.getContainer();
                        const rect = mapContainer.getBoundingClientRect();
                        const x = touch.clientX - rect.left;
                        const y = touch.clientY - rect.top;

                        const latlng = this.map.containerPointToLatLng([x, y]);
                        const mouseEvent = {
                            latlng: latlng,
                            originalEvent: e.originalEvent
                        };
                        this.handleLongPress(mouseEvent);
                    }
                }, this.longPressDelay);
            }
        });

        this.map.on('touchend', (e) => {
            if (this.longPressTimeout) {
                clearTimeout(this.longPressTimeout);
                this.longPressTimeout = null;
            }

            if (this.isLongPressActive) {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
                this.isLongPressActive = false;
            }
        });

        this.map.on('touchmove', (e) => {
            if (startPos && this.longPressTimeout && e.touches.length === 1) {
                const touch = e.touches[0];
                const currentPos = { x: touch.clientX, y: touch.clientY };
                const distance = Math.sqrt(
                    Math.pow(currentPos.x - startPos.x, 2) +
                    Math.pow(currentPos.y - startPos.y, 2)
                );

                if (distance > 10) {
                    clearTimeout(this.longPressTimeout);
                    this.longPressTimeout = null;
                    this.isLongPressActive = false;
                }
            }
        });

        this.map.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
            this.handleLongPress(e);
        });

        console.log('Obsługa długiego przytrzymania palca zainicjalizowana');
    }

    handleLongPress(e) {
        const latlng = e.latlng;
        this.lastLongPressLatLng = latlng;
        console.log('Długie przytrzymanie wykryte:', latlng.lat, latlng.lng);

        this.showLoadingIndicator();

        this.getAddressFromCoordinates(latlng.lat, latlng.lng)
            .then(addressData => {
                this.hideLoadingIndicator();
                this.showAddressConfirmationDialog(latlng, addressData);
            })
            .catch(error => {
                this.hideLoadingIndicator();
                console.error('Błąd pobierania adresu:', error);
                alert('Nie udało się pobrać adresu dla tego punktu.');
            });
    }

    // =====================================================
    // GEOKODOWANIE WSTECZNE (już przez PHP proxy)
    // =====================================================

    async getAddressFromCoordinates(lat, lng) {
        const url = `https://optidrog.pl/reverse_geocoding.php?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pl`;

        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'OptiDrog App' }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data) {
                const formattedAddress = this.formatNominatimAddress(data);
                const addressDetails = this.getNominatimAddressDetails(data);

                return {
                    address: formattedAddress,
                    details: addressDetails,
                    rawData: data
                };
            } else {
                throw new Error('Nie udało się pobrać adresu');
            }
        } catch (error) {
            console.error('Błąd pobierania adresu:', error);
            throw error;
        }
    }

    formatNominatimAddress(item) {
        const addr = item.address || {};
        let parts = [];

        if (addr.road && addr.house_number) {
            parts.push(`${addr.road} ${addr.house_number}`);
        } else if (addr.road) {
            parts.push(addr.road);
        } else if (addr.house_number) {
            parts.push(addr.house_number);
        }

        const city = addr.city || addr.town || addr.village || addr.municipality;
        if (city && parts.length > 0) {
            parts.push(city);
        } else if (city && parts.length === 0) {
            parts.push(city);
        }

        let result = parts.length > 0 ? parts.join(', ') : '';

        if (!result && item.display_name) {
            const displayParts = item.display_name.split(',');
            if (displayParts.length >= 2) {
                const firstPart = displayParts[0].trim();
                const secondPart = displayParts[1].trim();
                if (!/^\d+$/.test(firstPart)) {
                    result = `${firstPart}, ${secondPart}`;
                } else {
                    const thirdPart = displayParts.length > 2 ? displayParts[2].trim() : '';
                    result = thirdPart ? `${secondPart}, ${thirdPart}` : secondPart;
                }
            } else {
                result = displayParts[0].trim();
            }
        }

        return result || 'Nieznany adres';
    }

    getNominatimAddressDetails(item) {
        const addr = item.address || {};
        let details = [];

        if (addr.postcode) {
            details.push(addr.postcode);
        }

        if (addr.suburb && addr.suburb !== (addr.city || addr.town || addr.village)) {
            details.push(addr.suburb);
        }

        const city = addr.city || addr.town || addr.village || '';
        if (addr.county && !addr.county.includes(city) && city !== '') {
            details.push(addr.county);
        }

        if (addr.state && !details.some(detail => detail.includes(addr.state))) {
            details.push(`woj. ${addr.state}`);
        }

        return details.length > 0 ? details.join(', ') : '';
    }

    // =====================================================
    // LOADERY I DIALOGI
    // =====================================================

    showLoadingIndicator() {
        const existingIndicator = document.getElementById('loading-indicator');
        if (existingIndicator) existingIndicator.remove();

        const indicator = document.createElement('div');
        indicator.id = 'loading-indicator';
        indicator.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px;
                border-radius: 10px;
                z-index: 10000;
                font-size: 16px;
                text-align: center;
            ">
                <div style="margin-bottom: 10px;">⏳</div>
                Pobieranie adresu...
            </div>
        `;
        document.body.appendChild(indicator);
    }

    hideLoadingIndicator() {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) indicator.remove();
    }

    showRouteLoading() {
        const existing = document.getElementById('route-loading-indicator');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'route-loading-indicator';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.35)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.pointerEvents = 'none';

        overlay.innerHTML = `
            <div style="
                background: rgba(0,0,0,0.8);
                color: #fff;
                padding: 16px 24px;
                border-radius: 8px;
                font-size: 15px;
                text-align: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.4);
            ">
                <div style="margin-bottom: 8px;">⏳</div>
                Ładowanie trasy, proszę czekać...
            </div>
        `;

        const mapContainer = this.map ? this.map.getContainer() : document.body;
        mapContainer.style.position = mapContainer.style.position || 'relative';
        mapContainer.appendChild(overlay);
    }

    hideRouteLoading() {
        const overlay = document.getElementById('route-loading-indicator');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    showAddressConfirmationDialog(latlng, addressData) {
        const existingDialog = document.getElementById('address-confirmation-dialog');
        if (existingDialog) existingDialog.remove();

        const dialog = document.createElement('div');
        dialog.id = 'address-confirmation-dialog';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border: 2px solid #007bff;
                border-radius: 10px;
                padding: 20px;
                z-index: 10001;
                max-width: 90%;
                max-height: 80%;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            ">
                <h3 style="margin-top: 0; color: #007bff;">Dodaj adres z mapy</h3>
                <p style="margin-bottom: 15px; font-size: 14px;">
                    <strong>Wykryty adres:</strong><br>
                    <span style="color: #666; word-break: break-word;">${addressData.address}</span>
                    ${addressData.details ? `<br><span style="color: #888; font-size: 12px;">${addressData.details}</span>` : ''}
                </p>
                <p style="margin-bottom: 15px; font-size: 12px; color: #888;">
                    Koordynaty: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}
                </p>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancel-add-address" style="
                        padding: 8px 16px;
                        border: 1px solid #ccc;
                        background: #f8f9fa;
                        border-radius: 5px;
                        cursor: pointer;
                    ">Anuluj</button>
                    <button id="confirm-add-address" style="
                        padding: 8px 16px;
                        border: none;
                        background: #007bff;
                        color: white;
                        border-radius: 5px;
                        cursor: pointer;
                    ">Dodaj adres</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        document.getElementById('cancel-add-address').addEventListener('click', () => {
            dialog.remove();
        });

        document.getElementById('confirm-add-address').addEventListener('click', () => {
            this.addAddressFromMap(addressData.address, latlng.lat, latlng.lng);
            dialog.remove();
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    addAddressFromMap(address, _lat, _lng) {
        const latlng = this.lastLongPressLatLng || { lat: _lat, lng: _lng };
        const lat = latlng.lat;
        const lng = latlng.lng;
        console.log('Dodawanie adresu z mapy:', address, lat, lng);

        const timeFromInput = document.getElementById('address-time-from');
        const timeToInput = document.getElementById('address-time-to');
        const timeFrom = timeFromInput ? timeFromInput.value : '';
        const timeTo = timeToInput ? timeToInput.value : '';

        if (window.optiDrogApp && window.optiDrogApp.getTableManager) {
            const tableManager = window.optiDrogApp.getTableManager();
            if (tableManager && typeof tableManager.addAddressToTable === 'function') {
                tableManager.addAddressToTable(address, lat, lng, false, false, timeFrom, timeTo, null, '', false);
                this.showSuccessMessage('Adres został dodany do listy!');
            } else {
                console.error('TableManager nie jest dostępny');
                alert('Błąd: Nie można dodać adresu. Spróbuj odświeżyć stronę.');
            }
        } else {
            console.error('Aplikacja nie jest jeszcze zainicjalizowana');
            alert('Błąd: Aplikacja nie jest jeszcze gotowa.');
        }

        if (timeFromInput) timeFromInput.value = '';
        if (timeToInput) timeToInput.value = '';
    }

    showSuccessMessage(message) {
        const existingMessage = document.getElementById('success-message');
        if (existingMessage) existingMessage.remove();

        const successDiv = document.createElement('div');
        successDiv.id = 'success-message';
        successDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #28a745;
                color: white;
                padding: 12px 20px;
                border-radius: 5px;
                z-index: 10002;
                font-size: 14px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            ">
                ✅ ${message}
            </div>
        `;

        document.body.appendChild(successDiv);
        setTimeout(() => {
            if (successDiv.parentNode) successDiv.remove();
        }, 3000);
    }

    // =====================================================
    // AKTUALIZACJA POZYCJI I ZNACZNIKI
    // =====================================================

    updateMarker(latitude, longitude) {
        console.log('Aktualizacja pozycji:', latitude, longitude);
        this.currentLat = latitude;
        this.currentLng = longitude;
        const newLatLng = new L.LatLng(latitude, longitude);

        if (this.currentLocationMarker) {
            this.currentLocationMarker.setLatLng(newLatLng);
        } else {
            const currentLocationIcon = L.divIcon({
                html: '<div class="current-location-marker"></div>',
                className: 'custom-current-location',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                popupAnchor: [0, -10]
            });

            this.currentLocationMarker = L.marker(newLatLng, { icon: currentLocationIcon })
                .addTo(this.map)
                .bindPopup('<div style="color: #333 !important; background: white !important; padding: 8px; border-radius: 6px; font-weight: 500;">Twoja aktualna pozycja</div>').openPopup();
        }

        const locationStatus = document.getElementById('location-status');
        if (locationStatus) locationStatus.style.display = 'none';
    }

    addCenterOnLocationButton() {
        let btnContainer = document.getElementById('center-location-btn-container');
        if (!btnContainer) {
            btnContainer = document.createElement('div');
            btnContainer.id = 'center-location-btn-container';
            btnContainer.style.position = 'absolute';
            btnContainer.style.top = '16px';
            btnContainer.style.right = '16px';
            btnContainer.style.zIndex = '999'; // Zgodne z nowym schematem z-index (niższe niż kontener wyszukiwania: 1100)
            this.map.getContainer().appendChild(btnContainer);
        }

        let btn = document.getElementById('center-location-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'center-location-btn';
            btn.title = 'Wycentruj na aktualnej pozycji';
            btn.style.background = '#fff';
            btn.style.border = '1px solid #2196F3';
            btn.style.borderRadius = '50%';
            btn.style.width = '44px';
            btn.style.height = '44px';
            btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.cursor = 'pointer';
            btn.style.padding = '0';
            btn.style.transition = 'background 0.2s';
            btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8" stroke="#2196F3" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#2196F3"/></svg>`;
            btn.addEventListener('mouseenter', () => btn.style.background = '#e3f2fd');
            btn.addEventListener('mouseleave', () => btn.style.background = '#fff');
            btn.addEventListener('click', () => {
                if (this.currentLat !== null && this.currentLng !== null) {
                    this.map.setView([this.currentLat, this.currentLng], 15, { animate: true });
                } else {
                    alert('Aktualna pozycja nie jest dostępna');
                }
            });
            btnContainer.appendChild(btn);
        }
    }

    addMarker(lat, lng, address) {
        const marker = this.createColoredMarker(lat, lng, '#FF9800', 'marker')
            .addTo(this.map)
            .bindPopup(this.createPopupContent(address, lat, lng))
            .openPopup();

        if (this.map && typeof this.map.setView === 'function') {
            this.map.setView([lat, lng], 17, {
                animate: true,
                duration: 1.0
            });
        }
        return marker;
    }

    createPopupContent(address, lat, lng) {
        const isRouteOptimized = window.optiDrogApp &&
            window.optiDrogApp.tableManager &&
            window.optiDrogApp.tableManager.isRouteOptimized();

        let displayName = address;
        let favoriteName = null;
        let favoriteClass = '';

        if (window.favoritesManager && typeof window.favoritesManager.isFavoriteByCoords === 'function') {
            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(address, lat, lng)
                : `${address}_${lat}_${lng}`;

            if (window.favoritesManager.isFavorite(addressKey)) {
                favoriteName = window.favoritesManager.getFavoriteName(addressKey);
                if (favoriteName) {
                    favoriteClass = ' favorite-popup';
                }
            }
        }

        let popupContent = `<div class="modern-popup-content${favoriteClass}">
            <div class="popup-header">
                <div class="popup-icon-container">
                    <span class="popup-icon">📍</span>
                </div>
                <div class="popup-title-container">
                    ${favoriteName ? `<div class="popup-favorite-badge">${favoriteName}</div>` : ''}
                    <div class="popup-address-text">${address}</div>
                </div>
            </div>`;

        if (isRouteOptimized) {
            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(address, lat, lng)
                : `${address}_${lat}_${lng}`;

            popupContent += `<div class="popup-separator"></div>
            <div class="popup-actions-grid">
                <button class="popup-action-btn navigate-btn" onclick="window.navigateToAddress('${addressKey}')">
                    <span class="action-icon">🚗</span>
                    <span class="action-label">Nawiguj</span>
                </button>
                <button class="popup-action-btn status-btn" onclick="window.toggleAddressStatus('${addressKey}')">
                    <span class="action-icon">📝</span>
                    <span class="action-label">Status</span>
                </button>
                <button class="popup-action-btn position-btn" onclick="window.changeMarkerPosition('${addressKey}')">
                    <span class="action-icon">↕️</span>
                    <span class="action-label">Przesuń</span>
                </button>
            </div>`;
        }

        popupContent += `</div>`;
        return popupContent;
    }

    createColoredMarker(lat, lng, color, iconType = 'marker') {
        let iconHtml, className, iconSize, iconAnchor;

        if (iconType === 'circle') {
            iconHtml = `<div class="intermediate-point-marker">${iconType}</div>`;
            className = 'custom-marker';
            iconSize = [28, 28];
            iconAnchor = [14, 14];
        } else {
            let markerClass;
            if (color === '#4CAF50' || color === 'green') {
                markerClass = 'start-point-marker';
            } else if (color === '#F44336' || color === 'red') {
                markerClass = 'end-point-marker';
            } else if (color === '#FF9800' || color === 'orange') {
                markerClass = 'address-marker';
            } else if (color === '#9C27B0' || color === 'purple') {
                markerClass = 'search-marker';
            } else {
                markerClass = 'address-marker';
            }

            iconHtml = `<div class="${markerClass}"></div>`;
            className = 'custom-marker';
            iconSize = [20, 20];
            iconAnchor = [10, 10];
        }

        const customIcon = L.divIcon({
            html: iconHtml,
            className: className,
            iconSize: iconSize,
            iconAnchor: iconAnchor,
            popupAnchor: [0, -20]
        });

        return L.marker([lat, lng], { icon: customIcon });
    }

    createNumberedMarker(lat, lng, number, status = null) {
        // Określ klasę statusu na podstawie statusu adresu
        let statusClass = '';
        if (status && status !== 'BRAK') {
            statusClass = ` status-${status.toLowerCase()}`;
        }

        const iconHtml = `<div class="intermediate-point-marker${statusClass}">${number}</div>`;

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-numbered-marker',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
        });

        return L.marker([lat, lng], { icon: customIcon });
    }

    /**
     * Aktualizuje wygląd znacznika na mapie na podstawie statusu adresu
     * @param {string} addressKey - klucz adresu
     * @param {string} status - status adresu (Odwiedzony, Pominięty, BRAK)
     */
    updateMarkerStatus(addressKey, status) {
        const markerData = this.routeMarkers.get(addressKey);
        if (!markerData) {
            console.warn(`Nie znaleziono znacznika dla adresu: ${addressKey}`);
            return;
        }

        const { marker, number, point, index } = markerData;
        if (!marker) {
            console.warn(`Brak znacznika dla adresu: ${addressKey}`);
            return;
        }

        // Określ klasę statusu
        let statusClass = '';
        if (status && status !== 'BRAK') {
            statusClass = ` status-${status.toLowerCase()}`;
        }

        let markerClass = 'intermediate-point-marker';
        let content = number !== null ? number : '';
        let iconSize = [28, 28];
        let iconAnchor = [14, 14];

        // Obsługa punktów specjalnych (start/koniec), które nie mają numeru
        if (number === null || number === undefined) {
            if (index === 0) {
                markerClass = 'start-point-marker';
            } else {
                markerClass = 'end-point-marker';
            }
            iconSize = [24, 24]; // Nieco większe niż domyślnie 20x20 dla lepszej widoczności statusu
            iconAnchor = [12, 12];
        }

        // Utwórz nową ikonę z odpowiednią klasą statusu i treścią
        const iconHtml = `<div class="${markerClass}${statusClass}">${content}</div>`;
        const newIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-numbered-marker',
            iconSize: iconSize,
            iconAnchor: iconAnchor,
            popupAnchor: [0, -iconAnchor[1]]
        });

        // Zaktualizuj ikonę znacznika
        marker.setIcon(newIcon);
        console.log(`Zaktualizowano znacznik dla adresu ${addressKey} (index: ${index}, number: ${number}) na status: ${status}`);
    }

    /**
     * Resetuje wygląd wszystkich znaczników do stanu domyślnego (bez statusu)
     */
    resetAllMarkerStatuses() {
        this.routeMarkers.forEach((markerData, addressKey) => {
            if (markerData.number !== undefined) {
                this.updateMarkerStatus(addressKey, 'BRAK');
            }
        });
        console.log('Zresetowano statusy wszystkich znaczników na mapie');
    }

    // =====================================================
    // CZYSZCZENIE ZNACZNIKÓW
    // =====================================================

    clearRouteMarkers() {
        this.routeMarkers.forEach((markerData) => {
            if (markerData.marker) {
                this.map.removeLayer(markerData.marker);
            }
        });
        this.routeMarkers.clear();
    }

    clearRoutePolyline() {
        if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
            this.routePolyline = null;
        }
    }

    clearAllMarkers() {
        this.clearRouteMarkers();
        this.clearRoutePolyline();

        if (window.optiDrogApp && window.optiDrogApp.getTableManager) {
            const tableManager = window.optiDrogApp.getTableManager();
            if (tableManager && tableManager.addressMarkers) {
                tableManager.addressMarkers.forEach((marker) => {
                    this.map.removeLayer(marker);
                });
                tableManager.addressMarkers.clear();
            }
        }

        this.map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                this.map.removeLayer(layer);
            } else if (layer instanceof L.Polyline || layer instanceof L.GeoJSON) {
                this.map.removeLayer(layer);
            }
        });

        console.log('Wyczyszczono wszystkie znaczniki i linie tras z mapy');
    }

    clearAllMarkersExceptCurrentLocation() {
        const currentPosition = this.getCurrentPosition();
        const hadCurrentLocationMarker = this.currentLocationMarker !== null;

        this.clearRouteMarkers();
        this.clearRoutePolyline();

        if (window.optiDrogApp && window.optiDrogApp.getTableManager) {
            const tableManager = window.optiDrogApp.getTableManager();
            if (tableManager && tableManager.addressMarkers) {
                tableManager.addressMarkers.forEach((marker) => {
                    this.map.removeLayer(marker);
                });
                tableManager.addressMarkers.clear();
            }
        }

        this.map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                const isCurrentLocationMarker = layer === this.currentLocationMarker;
                const hasCurrentLocationPopup = layer.getPopup && layer.getPopup() &&
                    layer.getPopup().getContent &&
                    layer.getPopup().getContent() === 'Twoja aktualna pozycja';
                if (!isCurrentLocationMarker && !hasCurrentLocationPopup) {
                    this.map.removeLayer(layer);
                }
            } else if (layer instanceof L.Polyline || layer instanceof L.GeoJSON) {
                this.map.removeLayer(layer);
            }
        });

        console.log('Wyczyszczono znaczniki (z wyjątkiem aktualnej pozycji)');

        if (hadCurrentLocationMarker && currentPosition.lat !== null && currentPosition.lng !== null) {
            this.restoreCurrentLocationMarker(currentPosition.lat, currentPosition.lng);
        }
    }

    restoreCurrentLocationMarker(latitude, longitude) {
        if (latitude === null || longitude === null) return;

        let markerExists = false;
        this.map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                const hasCurrentLocationPopup = layer.getPopup && layer.getPopup() &&
                    layer.getPopup().getContent &&
                    layer.getPopup().getContent() === 'Twoja aktualna pozycja';
                if (hasCurrentLocationPopup) markerExists = true;
            }
        });

        if (!markerExists) {
            const newLatLng = new L.LatLng(latitude, longitude);
            const currentLocationIcon = L.divIcon({
                html: '<div class="current-location-marker"></div>',
                className: 'custom-current-location',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                popupAnchor: [0, -10]
            });

            this.currentLocationMarker = L.marker(newLatLng, { icon: currentLocationIcon })
                .addTo(this.map)
                .bindPopup('<div style="color: #333 !important; background: white !important; padding: 8px; border-radius: 6px; font-weight: 500;">Twoja aktualna pozycja</div>');
        }
    }

    // =====================================================
    // RYSOWANIE TRASY - PRZEZ SERWER PHP
    // =====================================================

    async drawRoute(points, centerMap = true) {
        this.showRouteLoading();

        try {
            if (this.routePolyline) {
                this.map.removeLayer(this.routePolyline);
            }

            this.clearAllMarkersExceptCurrentLocation();

            if (!points || points.length < 2) {
                console.warn('Za mało punktów do narysowania trasy');
                return null;
            }

            console.log(`🗺️ Rysowanie trasy dla ${points.length} punktów przez serwer PHP...`);

            // Przygotuj waypoints
            const waypoints = points.map(p => ({
                lat: p.lat,
                lng: p.lng
            }));

            let allLatLngs = [];
            let totalDistance = 0;
            let routeProvider = 'unknown';

            try {
                // Pobierz trasę z serwera PHP
                const routeResult = await this.getRouteFromServer(waypoints);

                if (routeResult.success && routeResult.geometry) {
                    const geometry = routeResult.geometry;
                    routeProvider = routeResult.provider;

                    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
                        allLatLngs = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                    } else if (geometry.type === 'MultiLineString') {
                        geometry.coordinates.forEach(line => {
                            line.forEach(([lng, lat]) => allLatLngs.push([lat, lng]));
                        });
                    }

                    totalDistance = routeResult.distance || 0;
                    console.log(`✅ Trasa z serwera (${routeProvider}): ${allLatLngs.length} punktów, ${(totalDistance / 1000).toFixed(2)}km`);
                } else {
                    throw new Error(routeResult.error || 'Brak geometrii trasy');
                }

            } catch (serverError) {
                console.warn('Błąd serwera, używam linii prostej:', serverError.message);

                // Fallback: linia prosta
                allLatLngs = points.map(p => [p.lat, p.lng]);
                routeProvider = 'fallback';

                if (typeof Android !== 'undefined' && Android.showToast) {
                    Android.showToast('Trasa narysowana jako linia prosta (błąd serwera)');
                }
            }

            // Narysuj polilinię
            this.routePolyline = L.polyline(allLatLngs, {
                color: '#0000FF',
                weight: 5,
                opacity: 0.7
            }).addTo(this.map);

            // Dodaj znaczniki
            let numberCounter = 0;
            points.forEach((point, index) => {
                let marker;
                let markerNumber = null;

                // Generuj addressKey dla punktu
                const addressKey = typeof generateAddressKey === 'function'
                    ? generateAddressKey(point.address, point.lat, point.lng)
                    : `${point.address}_${point.lat}_${point.lng}`;

                if (point.address !== 'Aktualna pozycja') numberCounter++;

                if (index === 0) {
                    // Punkt startowy - zielony (bez zmiany statusu)
                    marker = this.createColoredMarker(point.lat, point.lng, '#4CAF50');
                } else if (index === points.length - 1) {
                    // Punkt końcowy - czerwony (bez zmiany statusu)
                    marker = this.createColoredMarker(point.lat, point.lng, '#F44336');
                } else {
                    // Punkt pośredni - sprawdź aktualny status
                    let currentStatus = null;
                    if (window.optiDrogApp && window.optiDrogApp.tableManager) {
                        currentStatus = window.optiDrogApp.tableManager.getAddressStatus(addressKey);
                    }
                    markerNumber = numberCounter;
                    marker = this.createNumberedMarker(point.lat, point.lng, numberCounter, currentStatus);
                }

                marker.bindPopup(this.createPopupContent(point.address, point.lat, point.lng));
                marker.addTo(this.map);

                // Przechowuj znacznik w Map z addressKey
                this.routeMarkers.set(addressKey, {
                    marker: marker,
                    number: markerNumber,
                    point: point,
                    index: index
                });
            });

            if (centerMap) {
                this.map.fitBounds(this.routePolyline.getBounds());
            }

            console.log(`Trasa narysowana (provider: ${routeProvider})`);
            return totalDistance || null;

        } catch (err) {
            console.error('Błąd podczas rysowania trasy:', err);
            throw err;
        } finally {
            this.hideRouteLoading();
        }
    }

    // =====================================================
    // POMOCNICZE
    // =====================================================

    getCurrentPosition() {
        return {
            lat: this.currentLat,
            lng: this.currentLng
        };
    }

    getMap() {
        return this.map;
    }

    centerMapOnAllAddresses(tableManager) {
        if (!tableManager || !tableManager.addressMarkers || tableManager.addressMarkers.size === 0) {
            console.log('Brak adresów do wycentrowania mapy');
            return;
        }

        const bounds = L.latLngBounds();
        let hasValidBounds = false;

        tableManager.addressMarkers.forEach((marker) => {
            if (marker && marker.getLatLng) {
                bounds.extend(marker.getLatLng());
                hasValidBounds = true;
            }
        });

        if (hasValidBounds) {
            this.map.fitBounds(bounds, {
                padding: [20, 20],
                maxZoom: 16
            });
            console.log('Mapa wycentrowana na', tableManager.addressMarkers.size, 'adresach');
        }
    }
}

// Eksport klasy globalnie
window.MapManager = MapManager;

// Funkcja globalna do obsługi zmiany pozycji z dymka znacznika
window.changeMarkerPosition = function (addressKey) {
    if (!window.optiDrogApp || !window.optiDrogApp.tableManager) {
        console.error('TableManager nie jest dostępny');
        return;
    }

    const parts = addressKey.split('_');
    if (parts.length < 3) {
        console.error('Nieprawidłowy format klucza adresu');
        return;
    }

    const lat = parseFloat(parts[parts.length - 2]);
    const lng = parseFloat(parts[parts.length - 1]);
    const address = parts.slice(0, parts.length - 2).join('_');

    const tableManager = window.optiDrogApp.tableManager;
    const foundAddress = tableManager.addresses.find(addr =>
        addr.address === address &&
        Math.abs(addr.lat - lat) < 0.00001 &&
        Math.abs(addr.lng - lng) < 0.00001
    );

    if (foundAddress && foundAddress.id) {
        tableManager.showPositionSelector(foundAddress.id);
    } else {
        console.error('Nie znaleziono adresu w tablicy TableManager:', address);
    }
};

// Funkcja globalna do obsługi nawigacji z dymka znacznika
window.navigateToAddress = function (addressKey) {
    if (!window.optiDrogApp || !window.optiDrogApp.navigationManager) {
        console.error('NavigationManager nie jest dostępny');
        return;
    }

    const parts = addressKey.split('_');
    if (parts.length < 3) {
        console.error('Nieprawidłowy format klucza adresu');
        return;
    }

    const lat = parseFloat(parts[parts.length - 2]);
    const lng = parseFloat(parts[parts.length - 1]);
    const address = parts.slice(0, parts.length - 2).join('_');

    const tableManager = window.optiDrogApp.tableManager;
    const foundAddress = tableManager.addresses.find(addr =>
        addr.address === address &&
        Math.abs(addr.lat - lat) < 0.00001 &&
        Math.abs(addr.lng - lng) < 0.00001
    );

    if (foundAddress) {
        window.optiDrogApp.navigationManager.navigateToPoint(foundAddress);
    } else {
        console.error('Nie znaleziono adresu w tablicy TableManager dla nawigacji:', address);
    }
};

// Funkcja globalna do przełączania statusu adresu z dymka znacznika
window.toggleAddressStatus = function (addressKey) {
    if (window.optiDrogApp && window.optiDrogApp.getTableManager) {
        const tableManager = window.optiDrogApp.getTableManager();
        if (tableManager) {
            const currentStatus = tableManager.getAddressStatus(addressKey) || 'BRAK';
            let newStatus;

            // Cykl: BRAK -> Odwiedzony -> Pominięty -> BRAK
            if (currentStatus === 'BRAK') {
                newStatus = 'Odwiedzony';
            } else if (currentStatus === 'Odwiedzony') {
                newStatus = 'Pominięty';
            } else {
                newStatus = 'BRAK';
            }

            tableManager.updateAddressStatus(addressKey, newStatus);

            if (typeof Android !== 'undefined' && Android.showToast) {
                Android.showToast(`Status: ${newStatus}`);
            }
        }
    }
};