// Klasa do zarządzania zapisywaniem i wczytywaniem tras
class RouteStorage {
    constructor() {
        this.ROUTES_KEY = 'saved_routes';
        this.initEventListeners();
    }

    // Inicjalizacja nasłuchiwaczy zdarzeń
    initEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            const saveRouteButton = document.getElementById('save-route-button');
            if (saveRouteButton) {
                saveRouteButton.addEventListener('click', () => {
                    this.saveCurrentRoute();
                });
            }
        });
    }

    // Zapisywanie aktualnej trasy
    saveCurrentRoute() {
        const routeNameInput = document.getElementById('route-name-input');
        const routeName = routeNameInput ? routeNameInput.value.trim() : '';

        if (!routeName) {
            alert('Wprowadź nazwę trasy');
            return;
        }

        // Sprawdź czy mamy zoptymalizowaną trasę
        const navigationManager = window.optiDrogApp ? window.optiDrogApp.getNavigationManager() : null;
        if (!navigationManager || !navigationManager.optimizedRouteData || !navigationManager.optimizationResult) {
            alert('Brak zoptymalizowanej trasy do zapisania. Najpierw zoptymalizuj trasę.');
            return;
        }

        // Pobierz pełną zoptymalizowaną trasę (włączając "Aktualna pozycja" jeśli jest)
        const optimizedRoute = navigationManager.optimizedRouteData;

        if (!optimizedRoute || optimizedRoute.length === 0) {
            alert('Brak danych trasy do zapisania');
            return;
        }

        // Pobierz punkty startowy i końcowy z selectów
        const tableManager = window.optiDrogApp.getTableManager();
        const startPointSelect = tableManager.getStartPointSelect();
        const endPointSelect = tableManager.getEndPointSelect();

        let startPoint = null;
        let endPoint = null;

        if (startPointSelect && startPointSelect.value) {
            if (startPointSelect.value === 'current-location') {
                const currentPos = window.optiDrogApp.getMapManager().getCurrentPosition();
                if (currentPos.lat !== null && currentPos.lng !== null) {
                    startPoint = {
                        address: 'Aktualna pozycja',
                        lat: currentPos.lat,
                        lng: currentPos.lng
                    };
                }
            } else {
                try {
                    startPoint = JSON.parse(startPointSelect.value);
                } catch (e) {
                    console.warn('Błąd parsowania punktu startowego:', e);
                }
            }
        }

        if (endPointSelect && endPointSelect.value) {
            if (endPointSelect.value === 'current-location') {
                // Użyj zamrożonych współrzędnych z optimizationResult jeśli dostępne
                // Dzięki temu zapisujemy oryginalny punkt końcowy, nie bieżącą pozycję GPS
                const resolved = navigationManager.optimizationResult && navigationManager.optimizationResult.resolvedEndPoint;
                if (resolved && resolved.lat != null && resolved.lng != null) {
                    endPoint = {
                        address: 'Aktualna pozycja',
                        lat: resolved.lat,
                        lng: resolved.lng
                    };
                } else {
                    const currentPos = window.optiDrogApp.getMapManager().getCurrentPosition();
                    if (currentPos.lat !== null && currentPos.lng !== null) {
                        endPoint = {
                            address: 'Aktualna pozycja',
                            lat: currentPos.lat,
                            lng: currentPos.lng
                        };
                    }
                }
            } else {
                try {
                    endPoint = JSON.parse(endPointSelect.value);
                } catch (e) {
                    console.warn('Błąd parsowania punktu końcowego:', e);
                }
            }
        }

        // Pobierz czas stopu
        let stopTimeMinutes = 0;
        const stopTimeSelect = document.getElementById('stop-time-select');
        if (stopTimeSelect) {
            const parsedValue = parseInt(stopTimeSelect.value, 10);
            stopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
        }

        // Pobierz stan checkboxa odwracania trasy
        let reverseRoute = false;
        try {
            const reverseRouteCheckbox = document.getElementById('reverse-route-checkbox');
            if (reverseRouteCheckbox) {
                reverseRoute = reverseRouteCheckbox.checked;
                console.log('Stan checkboxa odwracania trasy do zapisania:', reverseRoute);
            }
        } catch (e) {
            console.warn('Nie udało się pobrać stanu checkboxa odwracania trasy:', e);
        }

        // Pobierz dane optymalizacji
        const optimizationResult = navigationManager.optimizationResult;

        // Pobierz aktualne dane czasowe z tableManager.addresses
        const currentAddresses = tableManager.addresses || [];
        const addressTimeMap = {};
        currentAddresses.forEach(addr => {
            // Używamy spójnych kluczy jak w pozostałych funkcjach
            const addressKey = addr.id || (typeof generateAddressKey === 'function'
                ? generateAddressKey(addr.address, addr.lat, addr.lng)
                : `${addr.address}_${addr.lat}_${addr.lng}`);
            addressTimeMap[addressKey] = {
                timeFrom: addr.timeFrom || '',
                timeTo: addr.timeTo || '',
                packageSettings: addr.packageSettings || null,
                deliveryType: addr.deliveryType || '',
                firstOnRoute: !!addr.firstOnRoute
            };
        });

        // Przygotuj dane trasy do zapisania - zapisujemy PEŁNĄ zoptymalizowaną trasę z aktualnymi danymi czasowymi
        const routeData = {
            id: this.generateRouteId(),
            name: routeName,
            createdAt: new Date().toISOString(),
            // Zapisujemy pełną zoptymalizowaną trasę z wszystkimi punktami i aktualnymi danymi czasowymi
            route: optimizedRoute.map(point => {
                const addressKey = typeof generateAddressKey === 'function'
                    ? generateAddressKey(point.address, point.lat, point.lng)
                    : `${point.address}_${point.lat}_${point.lng}`;
                const currentTimes = addressTimeMap[addressKey] || {};
                return {
                    ...point,
                    returnOnBack: !!point.returnOnBack,
                    timeFrom: currentTimes.timeFrom || point.timeFrom || '',
                    timeTo: currentTimes.timeTo || point.timeTo || '',
                    packageSettings: currentTimes.packageSettings || point.packageSettings || null,
                    deliveryType: currentTimes.deliveryType || point.deliveryType || '',
                    firstOnRoute: currentTimes.firstOnRoute !== undefined ? currentTimes.firstOnRoute : !!point.firstOnRoute
                };
            }),
            // Zapisujemy punkty startowy i końcowy
            startPoint: startPoint,
            endPoint: endPoint,
            // Zapisujemy czas stopu
            stopTimeMinutes: stopTimeMinutes,
            // Zapisujemy stan checkboxa odwracania trasy
            reverseRoute: reverseRoute,
            // Zapisujemy dane optymalizacji
            optimizedDistance: optimizationResult.optimizedDistance,
            optimizedDistanceKm: (optimizationResult.optimizedDistance / 1000).toFixed(1),
            initialDistance: optimizationResult.initialDistance,
            savings: optimizationResult.savings,
            savingsKm: (optimizationResult.savings / 1000).toFixed(1),
            savingsPercentage: optimizationResult.savingsPercentage,
            routePoints: optimizedRoute.length,
            // Oznacz jako zoptymalizowaną trasę
            isOptimized: true
        };
        console.log('Dane zoptymalizowanej trasy do zapisania:', routeData);

        // Zapisz trasę
        try {
            console.log('Rozpoczynam zapis trasy...');
            this.saveRoute(routeData);
            console.log('Trasa zapisana pomyślnie');
            alert(`Trasa "${routeName}" została zapisana pomyślnie!`);

            // Wyczyść pole nazwy trasy
            if (routeNameInput) {
                routeNameInput.value = '';
            }

            // Ukryj kontener zapisywania trasy
            const saveContainer = document.getElementById('save-route-container');
            if (saveContainer) {
                saveContainer.style.display = 'none';
            }

        } catch (error) {
            console.error('Błąd podczas zapisywania trasy:', error);
            alert('Wystąpił błąd podczas zapisywania trasy');
        }
    }

    // Zapisywanie trasy do localStorage lub przez interfejs Android
    saveRoute(routeData) {
        console.log('saveRoute wywołane z danymi:', routeData);
        // Sprawdź czy jest dostępny interfejs Android
        if (typeof Android !== 'undefined' && Android.saveRoute) {
            console.log('Zapisuję przez interfejs Android');
            // Zapisz przez interfejs Android
            Android.saveRoute(JSON.stringify(routeData));
        } else {
            console.log('Zapisuję w localStorage');
            // Fallback - zapisz w localStorage
            const savedRoutes = this.getSavedRoutes();
            console.log('Aktualne zapisane trasy przed dodaniem:', savedRoutes);
            savedRoutes.push(routeData);
            console.log('Trasy po dodaniu nowej:', savedRoutes);
            const jsonToSave = JSON.stringify(savedRoutes);
            console.log('JSON do zapisania:', jsonToSave);
            localStorage.setItem(this.ROUTES_KEY, jsonToSave);
            console.log('Zapisano w localStorage pod kluczem:', this.ROUTES_KEY);

            // Sprawdź czy rzeczywiście zapisano
            const verification = localStorage.getItem(this.ROUTES_KEY);
            console.log('Weryfikacja zapisu - pobrane z localStorage:', verification);
        }
        console.log('Trasa zapisana:', routeData);
    }

    // Pobieranie zapisanych tras
    getSavedRoutes() {
        console.log('getSavedRoutes wywołane');

        if (typeof Android !== 'undefined' && Android.getSavedRoutes) {
            console.log('Używam interfejsu Android');
            const routesJson = Android.getSavedRoutes();
            console.log('Surowy JSON z Android:', routesJson);
            console.log('Typ danych z Android:', typeof routesJson);
            console.log('Długość stringa z Android:', routesJson ? routesJson.length : 'null');
            try {
                const routes = JSON.parse(routesJson);
                console.log('Sparsowane trasy z Android:', routes);
                console.log('Liczba tras z Android:', routes.length);
                if (routes.length > 0) {
                    console.log('Pierwsza trasa z Android:', routes[0]);
                }
                return routes;
            } catch (e) {
                console.error('Błąd parsowania JSON z Android:', e);
                console.error('Problematyczny JSON:', routesJson);
                return [];
            }
        } else {
            console.log('Używam localStorage');
            const routesJson = localStorage.getItem('optiDrogRoutes');
            console.log('Surowy JSON z localStorage:', routesJson);
            try {
                const routes = routesJson ? JSON.parse(routesJson) : [];
                console.log('Sparsowane trasy z localStorage:', routes);
                return routes;
            } catch (e) {
                console.error('Błąd parsowania JSON z localStorage:', e);
                return [];
            }
        }
    }

    // Usuwanie trasy
    deleteRoute(routeId) {
        try {
            // Sprawdź czy jest dostępny interfejs Android
            if (typeof Android !== 'undefined' && Android.deleteRoute) {
                // Użyj metody Android do usunięcia trasy
                const result = Android.deleteRoute(routeId);
                console.log('Trasa usunięta przez Android:', routeId, result);
                return result;
            } else {
                // Fallback - usuń z localStorage
                const savedRoutes = this.getSavedRoutes();
                const filteredRoutes = savedRoutes.filter(route => route.id !== routeId);
                localStorage.setItem(this.ROUTES_KEY, JSON.stringify(filteredRoutes));
                console.log('Trasa usunięta z localStorage:', routeId);
                return true;
            }
        } catch (error) {
            console.error('Błąd podczas usuwania trasy:', error);
            return false;
        }
    }

    // Wczytywanie trasy (przywracanie na mapę)
    loadRoute(routeId) {
        try {
            console.log(`[RouteStorage.loadRoute] -> Rozpoczęcie wczytywania trasy | routeId: ${routeId}`);

            const savedRoutes = this.getSavedRoutes();
            console.log(`[RouteStorage.loadRoute] -> Pobrano zapisane trasy | count: ${savedRoutes.length}`);

            const route = savedRoutes.find(r => r.id === routeId);

            if (!route) {
                console.error(`[RouteStorage.loadRoute] -> Nie znaleziono trasy o ID | routeId: ${routeId}`);
                return false;
            }

            console.log(`[RouteStorage.loadRoute] -> Znaleziono trasę do wczytania | routeName: ${route.name}, routeId: ${routeId}`);

            // Sprawdź czy aplikacja jest zainicjalizowana
            if (!window.optiDrogApp) {
                console.error(`[RouteStorage.loadRoute] -> Aplikacja nie jest zainicjalizowana`);
                return false;
            }

            const tableManager = window.optiDrogApp.getTableManager();
            const mapManager = window.optiDrogApp.getMapManager();

            if (!tableManager || !mapManager) {
                console.error(`[RouteStorage.loadRoute] -> Menedżery nie są dostępne`);
                return false;
            }

            console.log(`[RouteStorage.loadRoute] -> Wczytywanie trasy | routeName: ${route.name}, isOptimized: ${route.isOptimized ? 'true' : 'false'}`);

            console.log(`[RouteStorage.loadRoute] === ROZPOCZĘCIE WCZYTYWANIA TRASY ===`);
            console.log(`[RouteStorage.loadRoute] routeId: ${routeId}`);
            console.log(`[RouteStorage.loadRoute] Czy trasa zoptymalizowana: ${route.isOptimized}`);
            console.log(`[RouteStorage.loadRoute] Liczba punktów w trasie: ${route.route ? route.route.length : 'brak'}`);
            console.log(`[RouteStorage.loadRoute] Dane trasy:`, route);

            // Sprawdź czy to zoptymalizowana trasa
            if (route.isOptimized) {
                console.log(`[RouteStorage.loadRoute] -> Przywracanie zoptymalizowanej trasy | routeName: ${route.name}`);

                // Przygotuj dane optymalizacji
                // WAŻNE: Dodaj savedStartPointValue i savedEndPointValue aby punkty były przywracane po restarcie
                let savedStartPointValue = '';
                let savedEndPointValue = '';
                
                if (route.startPoint) {
                    if (route.startPoint.address === 'Aktualna pozycja') {
                        savedStartPointValue = 'current-location';
                    } else {
                        savedStartPointValue = JSON.stringify(route.startPoint);
                    }
                }
                
                if (route.endPoint) {
                    if (route.endPoint.address === 'Aktualna pozycja') {
                        savedEndPointValue = 'current-location';
                    } else {
                        savedEndPointValue = JSON.stringify(route.endPoint);
                    }
                }
                
                const optimizationResult = {
                    optimizedDistance: route.optimizedDistance,
                    initialDistance: route.initialDistance,
                    savings: route.savings,
                    savingsPercentage: route.savingsPercentage,
                    savedStartPointValue: savedStartPointValue,
                    savedEndPointValue: savedEndPointValue,
                    savedStopTimeMinutes: route.stopTimeMinutes ?? 0,
                    resolvedStartPoint: route.startPoint || null,
                    resolvedEndPoint: route.endPoint || null
                };
                console.log(`[RouteStorage.loadRoute] -> Przygotowano dane optymalizacji | optimizedDistance: ${route.optimizedDistance}, savedStartPointValue: ${savedStartPointValue}, savedEndPointValue: ${savedEndPointValue}`);

                // WAŻNE: Najpierw ustaw dane optymalizacji w NavigationManager PRZED aktualizacją tabeli
                // Dzięki temu isRouteOptimized() zwróci true i statusy BRAK oraz przyciski pozycji będą tworzone
                const navigationManager = window.optiDrogApp.getNavigationManager();
                if (navigationManager) {
                    navigationManager.optimizedRouteData = route.route;
                    navigationManager.optimizationResult = optimizationResult;
                    console.log(`[RouteStorage.loadRoute] -> Ustawiono dane optymalizacji w NavigationManager PRZED aktualizacją tabeli`);
                }

                // Wyczyść poprzednie dane optymalizacji w storage
                if (typeof window.storageManager !== 'undefined') {
                    window.storageManager.clearOptimizedRoute();
                    console.log(`[RouteStorage.loadRoute] -> Wyczyszczono dane optymalizacji przez StorageManager`);
                } else {
                    sessionStorage.removeItem('optimizedRouteData');
                    sessionStorage.removeItem('optimizationResult');
                    console.log(`[RouteStorage.loadRoute] -> Wyczyszczono dane optymalizacji przez sessionStorage (fallback)`);
                }

                // Zapisz dane optymalizacji do storage
                if (typeof window.storageManager !== 'undefined') {
                    window.storageManager.saveOptimizedRoute(
                        JSON.stringify(route.route),
                        JSON.stringify(optimizationResult)
                    );
                    console.log(`[RouteStorage.loadRoute] -> Zapisano dane optymalizacji przez StorageManager`);
                } else {
                    sessionStorage.setItem('optimizedRouteData', JSON.stringify(route.route));
                    sessionStorage.setItem('optimizationResult', JSON.stringify(optimizationResult));
                    console.log(`[RouteStorage.loadRoute] -> Zapisano dane optymalizacji przez sessionStorage (fallback)`);
                }

                // Ustaw punkty startowy i końcowy
                if (route.startPoint) {
                    const startSelect = document.getElementById('start-point');
                    if (startSelect) {
                        if (route.startPoint.address === 'Aktualna pozycja') {
                            startSelect.value = 'current-location';
                        } else {
                            startSelect.value = JSON.stringify(route.startPoint);
                        }
                        console.log(`[RouteStorage.loadRoute] -> Ustawiono punkt startowy | startPoint: ${route.startPoint.address}`);
                    }
                }

                if (route.endPoint) {
                    const endSelect = document.getElementById('end-point');
                    if (endSelect) {
                        if (route.endPoint.address === 'Aktualna pozycja') {
                            endSelect.value = 'current-location';
                        } else {
                            endSelect.value = JSON.stringify(route.endPoint);
                        }
                        console.log(`[RouteStorage.loadRoute] -> Ustawiono punkt końcowy | endPoint: ${route.endPoint.address}`);
                    }
                }

                // Ustaw czas stopu
                if (route.stopTimeMinutes !== undefined) {
                    const stopTimeSelect = document.getElementById('stop-time-select');
                    if (stopTimeSelect) {
                        stopTimeSelect.value = route.stopTimeMinutes.toString();
                        console.log(`[RouteStorage.loadRoute] -> Ustawiono czas stopu | stopTimeMinutes: ${route.stopTimeMinutes}`);
                    }
                }

                // Przywróć stan checkboxa odwracania trasy
                if (route.reverseRoute !== undefined) {
                    try {
                        const reverseRouteCheckbox = document.getElementById('reverse-route-checkbox');
                        if (reverseRouteCheckbox) {
                            reverseRouteCheckbox.checked = route.reverseRoute;
                            console.log(`[RouteStorage.loadRoute] -> Przywrócono stan checkboxa odwracania trasy | reverseRoute: ${route.reverseRoute}`);
                        }
                    } catch (e) {
                        console.warn(`[RouteStorage.loadRoute] -> Nie udało się przywrócić stanu checkboxa odwracania trasy:`, e);
                    }
                }

                // Użyj updateTable() - automatycznie tworzy statusy, przyciski pozycji i ładuje statusy adresów
                if (tableManager && typeof tableManager.updateTable === 'function') {
                    // Resetuj statusy adresów przed wczytaniem nowej trasy (zoptymalizowanej)
                    // Dzięki temu unikamy wczytywania starych statusów z poprzedniej sesji
                    if (typeof tableManager.resetAddressStatuses === 'function') {
                        tableManager.resetAddressStatuses();
                        console.log(`[RouteStorage.loadRoute] -> Zresetowano statusy adresów przed wczytaniem zoptymalizowanej trasy`);
                    }

                    console.log(`[RouteStorage.loadRoute] -> Wywołuję tableManager.updateTable z trasą:`, route.route.length, 'punktów');
                    tableManager.updateTable(route.route);
                    console.log(`[RouteStorage.loadRoute] -> Zaktualizowano tabelę z trasą`);

                    // Przywróć selektory start/end po updateTable (updateTable może przebudować opcje)
                    if (navigationManager && typeof navigationManager.restoreRouteSelectors === 'function') {
                        navigationManager.restoreRouteSelectors();
                        setTimeout(() => navigationManager.restoreRouteSelectors(), 50);
                    }

                    // Oblicz i wyświetl szacunkowe godziny przyjazdu
                    if (typeof tableManager.calculateAndDisplayArrivalTimes === 'function') {
                        tableManager.calculateAndDisplayArrivalTimes(route.route);
                        console.log(`[RouteStorage.loadRoute] -> Obliczono i wyświetlono szacunkowe godziny przyjazdu`);
                    }
                }

                if (navigationManager) {
                    // Narysuj trasę na mapie
                    // POPRAWA: Czekaj na narysowanie trasy - drawRoute jest asynchroniczna
                    // Bez await mogła się pojawić stara polyline z poprzedniego request'u
                    if (mapManager && typeof mapManager.drawRoute === 'function') {
                        mapManager.drawRoute(route.route).catch(error => {
                            console.error(`[RouteStorage.loadRoute] -> Błąd podczas rysowania trasy na mapie:`, error);
                        });
                    }

                    // Wyświetl informacje o trasie
                    navigationManager.displayRouteInfo(
                        optimizationResult,
                        route.optimizedDistance,
                        route.route.length,
                        route.stopTimeMinutes || 0
                    );
                    console.log(`[RouteStorage.loadRoute] -> Wyświetlono informacje o trasie`);

                    // Pokaż przycisk nawigacji
                    const startNavigationButton = document.getElementById('start-navigation');
                    if (startNavigationButton && route.route.length >= 2) {
                        startNavigationButton.style.display = 'inline-block';
                        console.log(`[RouteStorage.loadRoute] -> Pokazano przycisk nawigacji`);
                    }

                    // Pokaż kontener zapisywania trasy
                    this.showSaveRouteContainer();
                    console.log(`[RouteStorage.loadRoute] -> Pokazano kontener zapisywania trasy`);
                }

                // HISTORIA PRZEJAZDÓW - rozpocznij nowy przejazd dla wczytanej zoptymalizowanej trasy
                if (typeof Android !== 'undefined' && Android.rhStartRide) {
                    try {
                        const pointsSnapshot = route.route
                            .filter(p => p.address !== 'Aktualna pozycja')
                            .map((p, idx) => ({
                                pointId: typeof generateAddressKey === 'function'
                                    ? generateAddressKey(p.address, p.lat, p.lng)
                                    : `${p.address}_${p.lat}_${p.lng}`,
                                label: p.address,
                                lat: p.lat,
                                lng: p.lng,
                                order: idx + 1
                            }));
                        const rideId = Android.rhStartRide(JSON.stringify({
                            optimizeClickedTs: Date.now(),
                            pointsSnapshot: pointsSnapshot
                        }));
                        if (rideId) {
                            window.currentRideId = rideId;
                            console.log('[RideHistory] Rozpoczęto przejazd z wczytanej zoptymalizowanej trasy:', rideId);
                        }
                    } catch (e) {
                        console.error('[RideHistory] Błąd przy startowaniu przejazdu z wczytanej trasy:', e);
                    }
                }

                console.log(`[RouteStorage.loadRoute] -> Zakończono wczytywanie zoptymalizowanej trasy | routeName: ${route.name}`);

            } else {
                console.log(`[RouteStorage.loadRoute] -> Wczytywanie zwykłej trasy | routeName: ${route.name}`);

                // Standardowe wczytywanie zwykłej trasy (bez optymalizacji)
                console.log(`[RouteStorage.loadRoute] -> Wczytywanie zwykłej trasy...`);

                // POPRAWA: Wyczyść mapę PRZED czyszczeniem adresów
                // To gwarantuje że wszystkie stare markery będą usunięte z mapy
                if (mapManager && typeof mapManager.clearAllMarkersExceptCurrentLocation === 'function') {
                    mapManager.clearAllMarkersExceptCurrentLocation();
                    console.log(`[RouteStorage.loadRoute] -> Wyczyszczono mapę (clearAllMarkersExceptCurrentLocation)`);
                }

                // Wyczyść obecne adresy (bez potwierdzenia - to jest automatyczne)
                // POPRAWA: Wywoływu clearAllAddresses() zamiast deleteAllAddresses() aby uniknąć confirm dialoga
                if (typeof tableManager.clearAllAddresses === 'function') {
                    tableManager.clearAllAddresses();
                    console.log(`[RouteStorage.loadRoute] -> Wyczyszczono obecne adresy (clearAllAddresses)`);
                }
                console.log(`[RouteStorage.loadRoute] -> Wyczyszczono obecne adresy`);

                // Dodaj adresy z zapisanej trasy, przekazując returnOnBack i deliveryType
                route.route.forEach(point => {
                    if (point.address !== 'Aktualna pozycja') {
                        tableManager.addAddressToTable(
                            point.address,
                            point.lat,
                            point.lng,
                            false,
                            !!point.returnOnBack,
                            point.timeFrom || '',
                            point.timeTo || '',
                            point.packageSettings || null,
                            point.deliveryType || '',
                            !!point.firstOnRoute
                        );
                    }
                });
                console.log(`[RouteStorage.loadRoute] -> Dodano adresy do tabeli`);

                // Wyczyść zoptymalizowaną trasę
                if (window.navigationManager && typeof window.navigationManager.clearOptimizedRoute === 'function') {
                    window.navigationManager.clearOptimizedRoute();
                    console.log(`[RouteStorage.loadRoute] -> Wyczyszczono zoptymalizowaną trasę`);
                }

                // Resetuj statusy adresów (dla pewności, że nie zostały śmieci w Android storage)
                if (typeof tableManager.resetAddressStatuses === 'function') {
                    tableManager.resetAddressStatuses();
                    console.log(`[RouteStorage.loadRoute] -> Zresetowano statusy adresów po wczytaniu zwykłej trasy`);
                }

                // HISTORIA PRZEJAZDÓW - rozpocznij nowy przejazd dla wczytanej zwykłej trasy
                if (typeof Android !== 'undefined' && Android.rhStartRide) {
                    try {
                        const pointsSnapshot = route.route
                            .filter(p => p.address !== 'Aktualna pozycja')
                            .map((p, idx) => ({
                                pointId: typeof generateAddressKey === 'function'
                                    ? generateAddressKey(p.address, p.lat, p.lng)
                                    : `${p.address}_${p.lat}_${p.lng}`,
                                label: p.address,
                                lat: p.lat,
                                lng: p.lng,
                                order: idx + 1
                            }));
                        const rideId = Android.rhStartRide(JSON.stringify({
                            optimizeClickedTs: Date.now(),
                            pointsSnapshot: pointsSnapshot
                        }));
                        if (rideId) {
                            window.currentRideId = rideId;
                            console.log('[RideHistory] Rozpoczęto przejazd z wczytanej zwykłej trasy:', rideId);
                        }
                    } catch (e) {
                        console.error('[RideHistory] Błąd przy startowaniu przejazdu z wczytanej trasy:', e);
                    }
                }

            }

            console.log(`[RouteStorage.loadRoute] -> Zakończono wczytywanie trasy | routeName: ${route.name}`);
            return true;

        } catch (error) {
            console.error(`[RouteStorage.loadRoute] -> Błąd podczas wczytywania trasy | error: ${error.message}`);
            return false;
        }
    }

    // Generowanie unikalnego ID dla trasy
    generateRouteId() {
        return 'route_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Pokazywanie kontenera zapisywania trasy po optymalizacji
    showSaveRouteContainer() {
        const saveContainer = document.getElementById('save-route-container');
        if (saveContainer) {
            saveContainer.style.display = 'block';
        }
    }

    // Ukrywanie kontenera zapisywania trasy
    hideSaveRouteContainer() {
        const saveContainer = document.getElementById('save-route-container');
        if (saveContainer) {
            saveContainer.style.display = 'none';
        }
    }

    // Formatowanie daty dla wyświetlania
    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('pl-PL') + ' ' + date.toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Formatowanie odległości
    formatDistance(distanceKm) {
        // Konwertuj na liczbę jeśli to string
        const distance = typeof distanceKm === 'string' ? parseFloat(distanceKm) : distanceKm;

        // Sprawdź czy to prawidłowa liczba
        if (isNaN(distance)) {
            return '0.0 km';
        }

        if (distance < 1) {
            return Math.round(distance * 1000) + ' m';
        } else {
            return distance.toFixed(1) + ' km';
        }
    }
}

// Eksport klasy globalnie
window.RouteStorage = RouteStorage;
console.log('RouteStorage załadowany');

// Inicjalizacja instancji globalnej
window.routeStorage = new RouteStorage();