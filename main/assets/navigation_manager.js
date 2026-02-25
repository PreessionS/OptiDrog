// Moduł zarządzania nawigacją i trasami
class NavigationManager {
    constructor(mapManager, tableManager) {
        this.mapManager = mapManager;
        this.tableManager = tableManager;
        this.optimizedRouteData = null;
        this.optimizationResult = null;
        this._cachedHasHistory = undefined;
        this._lastCacheUpdate = 0;
        this._syncDebounceTimer = null;

        // Snackbar element
        this.snackbarTimeout = null;
        this.createSnackbarElement();

        // Flaga dla reklamy przed reoptymalizacją (podobnie jak adShownBeforeOptimization)
        this.adShownBeforeReoptimization = false;
        this.pendingReoptimization = false;
        // Flaga dla automatycznej cichej optymalizacji - reklama będzie PO, nie PRZED
        this.isAutoSilentOptimization = false;

        // Dodano: próba wczytania danych optymalizacji z sessionStorage
        this.loadOptimizationFromSession();
        this.initEventListeners();
    }

    // Tworzy element snackbar w DOM jeśli nie istnieje
    createSnackbarElement() {
        if (document.getElementById('optidrog-snackbar')) return;
        const snackbar = document.createElement('div');
        snackbar.id = 'optidrog-snackbar';
        snackbar.className = 'optidrog-snackbar';
        document.body.appendChild(snackbar);
    }

    /**
     * Wyświetla powiadomienie snackbar
     * @param {string} message - Treść komunikatu
     * @param {number} duration - Czas wyświetlania (ms), 0 aby nie znikało automatycznie
     * @param {string} type - Typ: 'info', 'success', 'error'
     */
    showSnackbar(message, duration = 3000, type = 'info') {
        const snackbar = document.getElementById('optidrog-snackbar');
        if (!snackbar) {
            this.createSnackbarElement();
        }
        const snackbarElem = document.getElementById('optidrog-snackbar');
        if (!snackbarElem) return;

        // Czyść poprzedni timeout
        if (this.snackbarTimeout) {
            clearTimeout(this.snackbarTimeout);
        }

        snackbarElem.textContent = message;
        snackbarElem.className = 'optidrog-snackbar active';
        if (type === 'error') snackbarElem.classList.add('error');
        if (type === 'success') snackbarElem.classList.add('success');

        if (duration > 0) {
            this.snackbarTimeout = setTimeout(() => {
                snackbarElem.classList.remove('active');
            }, duration);
        }
    }

    hideSnackbar() {
        const snackbar = document.getElementById('optidrog-snackbar');
        if (snackbar) {
            snackbar.classList.remove('active');
        }
        if (this.snackbarTimeout) {
            clearTimeout(this.snackbarTimeout);
        }
    }

    /**
     * Wczytuje dane optymalizacji z trwałego magazynu
     */
    loadOptimizationFromSession() {
        try {
            // WAŻNE: Sprawdź czy jest trasa do wczytania z Zapisanych Tras
            // Jeśli tak, NIE wczytuj starej optymalizacji - nowa trasa ją nadpisze
            const loadRouteId = sessionStorage.getItem('loadRouteId');
            if (loadRouteId) {
                console.log('[NavigationManager] Wykryto loadRouteId w sessionStorage, pomijam wczytywanie starej optymalizacji');
                return false;
            }

            // Sprawdź czy StorageManager jest dostępny
            if (typeof window.storageManager === 'undefined') {
                console.log('StorageManager nie jest dostępny, pomijam wczytywanie optymalizacji');
                return false;
            }

            // Sprawdź czy optymalizacja już jest załadowana - unikaj wielokrotnego przeładowania
            if (this.optimizedRouteData && this.optimizedRouteData.length > 0) {
                console.log('[NavigationManager] Optymalizacja już jest załadowana, pomijam ponowne wczytywanie');
                return true;
            }

            const savedData = window.storageManager.loadOptimizedRoute();

            if (savedData.optimizedRouteData && savedData.optimizationResult) {
                this.optimizedRouteData = JSON.parse(savedData.optimizedRouteData);
                this.optimizationResult = JSON.parse(savedData.optimizationResult);

                // Po wczytaniu od razu wyświetl trasę i info
                if (this.optimizedRouteData && this.optimizationResult) {
                    // Narysuj trasę na mapie
                    if (this.mapManager && typeof this.mapManager.drawRoute === 'function') {
                        this.mapManager.drawRoute(this.optimizedRouteData);
                    }
                    // Wyświetl info o trasie
                    // Pobierz aktualny czas stopu z interfejsu
                    let stopTimeMinutes = 0; // Wartość domyślna
                    const stopTimeSelect = document.getElementById('stop-time-select');
                    if (stopTimeSelect) {
                        const parsedValue = parseInt(stopTimeSelect.value, 10);
                        stopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
                    }
                    this.displayRouteInfo(this.optimizationResult, this.optimizationResult.optimizedDistance, this.optimizedRouteData.length, stopTimeMinutes);

                    // Przywróć stan checkboxa odwracania trasy
                    try {
                        const savedReverseState = sessionStorage.getItem('reverseRouteState');
                        if (savedReverseState !== null) {
                            const reverseRouteCheckbox = document.getElementById('reverse-route-checkbox');
                            if (reverseRouteCheckbox) {
                                reverseRouteCheckbox.checked = savedReverseState === 'true';
                                console.log('Przywrócono stan checkboxa odwracania trasy:', savedReverseState);
                            }
                        }
                    } catch (e) {
                        console.warn('Nie udało się przywrócić stanu checkboxa odwracania trasy:', e);
                    }
                    // Pokaż przycisk nawigacji jeśli trasa istnieje
                    const startNavigationButton = document.getElementById('start-navigation');
                    if (startNavigationButton && this.optimizedRouteData.length >= 2) {
                        startNavigationButton.style.display = 'inline-block';
                        startNavigationButton.innerHTML = 'Rozpocznij Nawigację';
                        startNavigationButton.disabled = false;
                    }
                    // Pokaż kontener zapisywania trasy
                    if (window.routeStorage && typeof window.routeStorage.showSaveRouteContainer === 'function') {
                        window.routeStorage.showSaveRouteContainer();
                    }

                    // Zaktualizuj tabelę z wczytaną trasą
                    if (this.tableManager && typeof this.tableManager.updateTable === 'function') {
                        // Sprawdź czy trasa była zmodyfikowana przez użytkownika
                        if (savedData.isModified) {
                            // Użyj funkcji która nie czyści istniejących adresów
                            if (typeof this.tableManager.updateTableWithExistingAddresses === 'function') {
                                this.tableManager.updateTableWithExistingAddresses(this.optimizedRouteData);
                            } else {
                                this.tableManager.updateTable(this.optimizedRouteData);
                            }
                        } else {
                            // Użyj standardowej funkcji dla oryginalnej zoptymalizowanej trasy
                            this.tableManager.updateTable(this.optimizedRouteData);
                        }

                        // PRZYWRACANIE PARAMETRÓW FORMULARZA Z ZAPISANYCH METADANYCH
                        if (this.optimizationResult.savedStopTimeMinutes !== undefined) {
                            const stopTimeSelect = document.getElementById('stop-time-select');
                            if (stopTimeSelect) {
                                stopTimeSelect.value = this.optimizationResult.savedStopTimeMinutes.toString();
                                stopTimeMinutes = this.optimizationResult.savedStopTimeMinutes;
                                console.log('[NavigationManager] Przywrócono czas stopu:', stopTimeMinutes);
                            }
                        }

                        if (this.optimizationResult.savedStartTimeValue !== undefined) {
                            const startTimeSelect = document.getElementById('start-time-select');
                            if (startTimeSelect) {
                                startTimeSelect.value = this.optimizationResult.savedStartTimeValue;
                                console.log('[NavigationManager] Przywrócono wartość godziny startu:', this.optimizationResult.savedStartTimeValue);
                            }
                        }

                        // Przywróć wartości selektorów start-point i end-point
                        this.restoreRouteSelectors();

                        // Następnie oblicz i wyświetl szacunkowe godziny przyjazdu dla każdego adresu (z uwzględnieniem czasu stopu)
                        if (typeof this.tableManager.calculateAndDisplayArrivalTimes === 'function') {
                            // Pobierz godzinę startu dla obliczeń (teraz już z przywróconą wartością w select)
                            let startTimeForCalc = null;
                            const startTimeSelectForCalc = document.getElementById('start-time-select');
                            if (startTimeSelectForCalc && startTimeSelectForCalc.value) {
                                const [hours, minutes] = startTimeSelectForCalc.value.split(':').map(Number);
                                const today = new Date();
                                startTimeForCalc = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
                                if (startTimeForCalc < today) {
                                    startTimeForCalc.setDate(startTimeForCalc.getDate() + 1);
                                }
                            }
                            this.tableManager.calculateAndDisplayArrivalTimes(this.optimizedRouteData, this.optimizationResult.durations, this.optimizationResult.locationToIndexMap, this.optimizationResult.allLocations, startTimeForCalc, stopTimeMinutes);
                        }
                    }
                }

                console.log('Wczytano dane optymalizacji z trwałego magazynu:', this.optimizedRouteData.length, 'punktów');
                return true;
            }
        } catch (error) {
            console.error('Błąd podczas wczytywania danych optymalizacji:', error);
        }
        return false;
    }

    // Dodano: Funkcja do czyszczenia zoptymalizowanej trasy
    clearOptimizedRoute() {
        // Usuń dane z trwałego magazynu za pomocą StorageManager
        if (typeof window.storageManager !== 'undefined') {
            window.storageManager.clearOptimizedRoute();
        } else {
            // Fallback do sessionStorage jeśli StorageManager nie jest dostępny
            sessionStorage.removeItem('optimizedRouteData');
            sessionStorage.removeItem('optimizationResult');
        }

        // Wyczyść dodatkowe klucze sesji
        try {
            sessionStorage.removeItem('currentRouteIndex');
        } catch (e) { }



        // Wyczyść z trwałego magazynu
        if (typeof Android !== 'undefined' && Android !== null && typeof Android.clearOptimizedRoute === 'function') {
            try {
                Android.clearOptimizedRoute();
            } catch (e) {
                console.warn('Błąd podczas czyszczenia trwałego magazynu:', e);
            }
        }

        // Wyczyść dane w pamięci
        this.optimizedRouteData = null;
        this.optimizationResult = null;

        // Resetuj checkbox odwracania trasy
        try {
            const reverseRouteCheckbox = document.getElementById('reverse-route-checkbox');
            if (reverseRouteCheckbox) {
                reverseRouteCheckbox.checked = false;
                console.log('Zresetowano checkbox odwracania trasy');
            }
            // Aktualizuj tekst przycisku optymalizacji w NavigationManager
            if (window.navigationManager && typeof window.navigationManager.checkOptimizeButton === 'function') {
                window.navigationManager.checkOptimizeButton();
            }
            sessionStorage.removeItem('reverseRouteState');
        } catch (e) {
            console.warn('Nie udało się zresetować checkboxa odwracania trasy:', e);
        }

        // Wyczyść linię trasy na mapie
        if (this.mapManager && typeof this.mapManager.clearRoutePolyline === 'function') {
            this.mapManager.clearRoutePolyline();
            console.log('Wyczyszczono linię trasy na mapie');
        }

        // Ukryj informacje o trasie i przycisk szczegółów
        const routeInfo = document.getElementById('route-info');
        if (routeInfo) {
            routeInfo.style.display = 'none';
        }

        const showDetailsBtn = document.getElementById('show-route-details-button');
        if (showDetailsBtn) {
            showDetailsBtn.style.display = 'none';
        }

        // Ukryj przycisk nawigacji i przywróć standardowy tekst
        const startNavigationButton = document.getElementById('start-navigation');
        if (startNavigationButton) {
            startNavigationButton.style.display = 'none';
            startNavigationButton.innerHTML = 'Rozpocznij Nawigację';
            startNavigationButton.disabled = false;
            startNavigationButton.title = '';
        }

        // Ukryj kontener zapisywania trasy
        if (window.routeStorage && typeof window.routeStorage.hideSaveRouteContainer === 'function') {
            window.routeStorage.hideSaveRouteContainer();
        }

        // Ukryj szacunkowe godziny przyjazdu
        if (this.tableManager && typeof this.tableManager.hideAllArrivalTimes === 'function') {
            this.tableManager.hideAllArrivalTimes();
        }

        // Zaktualizuj tekst przycisku nawigacji po wyczyszczeniu
        setTimeout(() => {
            this.updateNavigationButtonText();
        }, 200);
    }

    /**
     * Przywraca wartości selektorów start-point i end-point z zapisanych metadanych
     * Używa inteligentnego dopasowania - najpierw próbuje dokładne dopasowanie,
     * potem dopasowanie po adresie (ignorując różnice w współrzędnych)
     */
    restoreRouteSelectors() {
        if (!this.optimizationResult) {
            console.log('[NavigationManager] Brak optimizationResult - pomijam przywracanie selektorów');
            return;
        }

        const startPointSelect = this.tableManager.getStartPointSelect();
        const endPointSelect = this.tableManager.getEndPointSelect();

        // Przywróć punkt początkowy
        if (this.optimizationResult.savedStartPointValue && startPointSelect) {
            const savedValue = this.optimizationResult.savedStartPointValue;
            console.log('[NavigationManager] Próba przywrócenia punktu początkowego:', savedValue);

            // Sprawdź czy to "current-location"
            if (savedValue === 'current-location') {
                startPointSelect.value = 'current-location';
                console.log('[NavigationManager] Przywrócono punkt początkowy: Aktualna pozycja');
            } else {
                // Próba dokładnego dopasowania
                let found = false;
                for (const opt of startPointSelect.options) {
                    if (opt.value === savedValue) {
                        startPointSelect.value = savedValue;
                        console.log('[NavigationManager] Przywrócono punkt początkowy (dokładne dopasowanie):', savedValue);
                        found = true;
                        break;
                    }
                }

                // Jeśli nie znaleziono, próbuj dopasować po adresie
                if (!found) {
                    try {
                        const savedPoint = JSON.parse(savedValue);
                        for (const opt of startPointSelect.options) {
                            if (opt.value && opt.value !== '' && opt.value !== 'current-location') {
                                try {
                                    const optPoint = JSON.parse(opt.value);
                                    if (optPoint.address === savedPoint.address) {
                                        startPointSelect.value = opt.value;
                                        console.log('[NavigationManager] Przywrócono punkt początkowy (dopasowanie po adresie):', optPoint.address);
                                        found = true;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }
                    } catch (e) {
                        console.warn('[NavigationManager] Błąd parsowania savedStartPointValue:', e);
                    }
                }

                if (!found) {
                    console.log('[NavigationManager] Nie znaleziono opcji dla punktu początkowego. Dostępne opcje:',
                        Array.from(startPointSelect.options).map(o => o.value));
                }
            }
        }

        // Przywróć punkt końcowy
        if (this.optimizationResult.savedEndPointValue && endPointSelect) {
            const savedValue = this.optimizationResult.savedEndPointValue;
            console.log('[NavigationManager] Próba przywrócenia punktu końcowego:', savedValue);

            // Sprawdź czy to "current-location"
            if (savedValue === 'current-location') {
                endPointSelect.value = 'current-location';
                console.log('[NavigationManager] Przywrócono punkt końcowy: Aktualna pozycja');
            } else {
                // Próba dokładnego dopasowania
                let found = false;
                for (const opt of endPointSelect.options) {
                    if (opt.value === savedValue) {
                        endPointSelect.value = savedValue;
                        console.log('[NavigationManager] Przywrócono punkt końcowy (dokładne dopasowanie):', savedValue);
                        found = true;
                        break;
                    }
                }

                // Jeśli nie znaleziono, próbuj dopasować po adresie
                if (!found) {
                    try {
                        const savedPoint = JSON.parse(savedValue);
                        for (const opt of endPointSelect.options) {
                            if (opt.value && opt.value !== '' && opt.value !== 'current-location') {
                                try {
                                    const optPoint = JSON.parse(opt.value);
                                    if (optPoint.address === savedPoint.address) {
                                        endPointSelect.value = opt.value;
                                        console.log('[NavigationManager] Przywrócono punkt końcowy (dopasowanie po adresie):', optPoint.address);
                                        found = true;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }
                    } catch (e) {
                        console.warn('[NavigationManager] Błąd parsowania savedEndPointValue:', e);
                    }
                }

                if (!found) {
                    console.log('[NavigationManager] Nie znaleziono opcji dla punktu końcowego. Dostępne opcje:',
                        Array.from(endPointSelect.options).map(o => o.value));
                }
            }
        }
    }

    // Inicjalizacja nasłuchiwaczy zdarzeń
    initEventListeners() {
        const calculateRouteButton = document.getElementById('calculate-route');
        const optimizeRouteButton = document.getElementById('optimize-route');
        const startNavigationButton = document.getElementById('start-navigation');
        const startPointSelect = this.tableManager.getStartPointSelect();
        const endPointSelect = this.tableManager.getEndPointSelect();

        // Sprawdź czy elementy istnieją
        if (!optimizeRouteButton || !startNavigationButton) {
            console.error('Elementy nawigacji nie zostały znalezione');
            return;
        }

        // Sprawdź czy selecty są dostępne
        if (!startPointSelect || !endPointSelect) {
            console.error('Selecty punktów trasy nie zostały znalezione');
            return;
        }

        console.log('NavigationManager - nasłuchiwacze zdarzeń zainicjalizowane');

        // Obsługa przycisku wyznaczania trasy (jeśli istnieje)
        if (calculateRouteButton) {
            calculateRouteButton.addEventListener('click', () => {
                this.calculateRoute();
            });
        }

        // Obsługa przycisku optymalizacji
        optimizeRouteButton.addEventListener('click', () => {
            const span = optimizeRouteButton.querySelector('span');
            const buttonText = span ? span.textContent : optimizeRouteButton.textContent;

            if (buttonText.includes('Reoptymalizuj')) {
                console.log('[NavigationManager] Wywołano reoptymalizację przez przycisk (ręczna)');
                this.silentOptimizeRoute(true); // true = isManual (wyświetl reklamę)
            } else {
                this.optimizeRoute();
            }
        });

        // Obsługa przycisku rozpoczęcia nawigacji
        startNavigationButton.addEventListener('click', () => {
            this.startNavigation();
        });

        // Sprawdzanie czy można odblokować przycisk optymalizacji
        this.checkOptimizeButton = () => {
            const startValue = startPointSelect.value;
            const endValue = endPointSelect.value;

            // Sprawdź czy są dodane adresy do tabeli (oprócz punktów początkowego i końcowego)
            const addresses = this.tableManager.getAddresses();
            const hasAddresses = addresses && addresses.length > 0;

            // Przycisk jest aktywny tylko gdy:
            // 1. Wybrano punkt początkowy i końcowy
            // 2. Jest dodany przynajmniej jeden adres do tabeli
            const hasStartAndEnd = startValue && endValue && startValue !== "" && endValue !== "";
            const shouldEnable = hasStartAndEnd && hasAddresses;

            optimizeRouteButton.disabled = !shouldEnable;

            // --- NOWA LOGIKA: Zmiana tekstu na "Reoptymalizuj" jeśli są statusy ---
            let hasHistory = false;
            try {
                if (typeof Android !== 'undefined' && Android.getAllAddressStatuses) {
                    const statusesJson = Android.getAllAddressStatuses();
                    if (statusesJson && statusesJson !== '{}' && statusesJson !== 'null') {
                        const statuses = JSON.parse(statusesJson);
                        for (const key in statuses) {
                            const status = statuses[key];
                            if (status === 'Odwiedzony' || status === 'Pominięty') {
                                hasHistory = true;
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[NavigationManager.checkOptimizeButton] -> Błąd sprawdzania statusów:', e);
            }

            const buttonSpan = optimizeRouteButton.querySelector('span');
            const baseText = hasHistory ? "Reoptymalizuj trasę" : "Optymalizuj trasę";

            if (buttonSpan) {
                buttonSpan.textContent = baseText;
            } else {
                optimizeRouteButton.textContent = baseText;
            }
            // ---------------------------------------------------------------------

            // Ustaw odpowiedni tytuł przycisku w zależności od stanu
            if (!hasStartAndEnd) {
                optimizeRouteButton.title = "Wybierz punkt początkowy i końcowy";
            } else if (!hasAddresses) {
                optimizeRouteButton.title = "Dodaj przynajmniej jeden adres do tabeli";
            } else {
                optimizeRouteButton.title = baseText;
            }

            console.log('Sprawdzanie przycisku optymalizacji:', {
                startValue,
                endValue,
                hasStartAndEnd,
                hasAddresses,
                addressCount: addresses ? addresses.length : 0,
                shouldEnable,
                hasHistory
            });
        };

        // Dodaj nasłuchiwacze zdarzeń
        startPointSelect.addEventListener('change', this.checkOptimizeButton);
        endPointSelect.addEventListener('change', this.checkOptimizeButton);

        // WAŻNE: Wywołaj sprawdzenie na początku
        this.checkOptimizeButton();

        // Dodaj również sprawdzenie po krótkim opóźnieniu na wypadek opóźnionej inicjalizacji
        setTimeout(this.checkOptimizeButton, 100);
    }

    // Wyznaczanie prostej trasy
    calculateRoute() {
        const startValue = this.tableManager.getStartPointSelect().value;
        const endValue = this.tableManager.getEndPointSelect().value;

        if (!startValue || !endValue) {
            alert('Wybierz punkt początkowy i końcowy');
            return;
        }

        let startLat, startLng, endLat, endLng, startAddress, endAddress;
        const currentPos = this.mapManager.getCurrentPosition();

        if (startValue === 'current-location') {
            if (currentPos.lat === null || currentPos.lng === null) {
                alert('Aktualna pozycja nie jest dostępna');
                return;
            }
            startLat = currentPos.lat;
            startLng = currentPos.lng;
            startAddress = 'Aktualna pozycja';
        } else {
            const startPoint = JSON.parse(startValue);
            startLat = startPoint.lat;
            startLng = startPoint.lng;
            startAddress = startPoint.address;
        }

        if (endValue === 'current-location') {
            if (currentPos.lat === null || currentPos.lng === null) {
                alert('Aktualna pozycja nie jest dostępna');
                return;
            }
            endLat = currentPos.lat;
            endLng = currentPos.lng;
            endAddress = 'Aktualna pozycja';
        } else {
            const endPoint = JSON.parse(endValue);
            endLat = endPoint.lat;
            endLng = endPoint.lng;
            endAddress = endPoint.address;
        }

        // Wywołanie funkcji nawigacji z Androida
        if (typeof Android !== 'undefined' && Android !== null) {
            Android.openGoogleMapsNavigation(
                startLat, startLng,
                endLat, endLng,
                startAddress,
                endAddress
            );
        } else {
            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${startLat},${startLng}&destination=${endLat},${endLng}`;
            window.open(googleMapsUrl, '_system');
        }
    }

    // Optymalizacja trasy
    async optimizeRoute() {
        const startValue = this.tableManager.getStartPointSelect().value;
        const endValue = this.tableManager.getEndPointSelect().value;

        if (!startValue || !endValue) {
            alert('Wybierz punkt początkowy i końcowy');
            return;
        }

        let startPoint, endPoint;
        const currentPos = this.mapManager.getCurrentPosition();

        // Sprawdź czy aktualna pozycja jest dostępna, jeśli jest wymagana
        if ((startValue === 'current-location' || endValue === 'current-location') &&
            (currentPos.lat === null || currentPos.lng === null)) {
            alert('Aktualna pozycja nie jest dostępna. Sprawdź czy lokalizacja jest włączona.');
            return;
        }

        const optimizeRouteButton = document.getElementById('optimize-route');
        const startNavigationButton = document.getElementById('start-navigation');

        // Obsługa punktu początkowego
        if (startValue === 'current-location') {
            if (currentPos.lat === null || currentPos.lng === null) {
                alert('Aktualna pozycja nie jest dostępna');
                return;
            }
            startPoint = {
                address: 'Aktualna pozycja',
                lat: parseFloat(currentPos.lat),
                lng: parseFloat(currentPos.lng)
            };
        } else {
            startPoint = JSON.parse(startValue);
        }

        // Obsługa punktu końcowego
        if (endValue === 'current-location') {
            if (currentPos.lat === null || currentPos.lng === null) {
                alert('Aktualna pozycja nie jest dostępna');
                return;
            }
            endPoint = {
                address: 'Aktualna pozycja',
                lat: parseFloat(currentPos.lat),
                lng: parseFloat(currentPos.lng)
            };
        } else {
            endPoint = JSON.parse(endValue);
        }

        // Filtruj punkty pośrednie – odporne na mikro różnice współrzędnych i duplikaty
        // Używamy niewielkiego progu EPS dla porównań float, aby wykluczyć start/koniec nawet przy drobnych różnicach
        const EPS = 1e-5; // ~1 metr w szerokości geograficznej

        // Funkcja pomocnicza: sprawdź czy dwa punkty są praktycznie tym samym miejscem
        const isSamePoint = (p1, p2) => {
            if (!p1 || !p2) return false;
            // Jeżeli to "Aktualna pozycja" – traktuj po adresie
            if (p1.address === 'Aktualna pozycja' || p2.address === 'Aktualna pozycja') {
                return p1.address === p2.address;
            }
            return Math.abs(p1.lat - p2.lat) < EPS && Math.abs(p1.lng - p2.lng) < EPS;
        };

        // Wstępne odfiltrowanie startu/końca
        const prelimPoints = this.tableManager.getAddresses().filter(addr => {
            return !isSamePoint(addr, startPoint) && !isSamePoint(addr, endPoint);
        });

        // Deduplikacja (na wypadek wielokrotnego dodania tego samego punktu)
        const uniqueMap = new Map();
        for (const p of prelimPoints) {
            // Używamy spójnego klucza z generateAddressKey, aby eliminować mikroróżnice współrzędnych
            // i zapewnić zgodność z TableManager/Android (statusy "Odwiedzony"/"Pominięty")
            const key = typeof generateAddressKey === 'function'
                ? generateAddressKey(p.address, p.lat, p.lng) // Generuj stabilny klucz
                : `${p.address}_${p.lat}_${p.lng}`; // Fallback gdyby funkcja nie była dostępna
            if (!uniqueMap.has(key)) uniqueMap.set(key, p);
        }
        const intermediatePoints = Array.from(uniqueMap.values());

        console.log('Punkty pośrednie po filtracji i deduplikacji:', intermediatePoints.length);

        // Zapisz tymczasowo parametry optymalizacji, aby użyć ich po zamknięciu reklamy
        this.pendingOptimizationData = {
            startPoint,
            endPoint,
            intermediatePoints
        };

        // Wyświetl reklamę PRZED optymalizacją
        if (typeof Android !== 'undefined' && Android.showAdAfterOptimize) {
            console.log('Żądanie reklamy przed optymalizacją...');
            Android.showAdAfterOptimize();
            // proceedWithOptimization zostanie wywołane przez onAdClosedForOptimize() z Androida
        } else {
            // Jeśli brak Androida lub metody, kontynuuj natychmiast
            this.proceedWithOptimization();
        }
    }

    // Callback wywoływany po zamknięciu reklamy przed optymalizacją
    onAdClosedForOptimize(wasShown = false) {
        console.log('Reklama przed optymalizacją zamknięta/pominięta (status: ' + wasShown + ') - kontynuuję obliczenia');
        this.adShownBeforeOptimization = wasShown;
        this.proceedWithOptimization();
    }

    // Właściwa logika optymalizacji (wywoływana po reklamie)
    async proceedWithOptimization() {
        if (!this.pendingOptimizationData) {
            console.error('Brak danych do optymalizacji');
            return;
        }

        const { startPoint, endPoint, intermediatePoints } = this.pendingOptimizationData;
        const optimizeRouteButton = document.getElementById('optimize-route');
        const startNavigationButton = document.getElementById('start-navigation');

        try {
            // Pokaż ekran ładowania optymalizacji
            this.showOptimizationLoadingOverlay();

            optimizeRouteButton.disabled = true;
            const btnSpan = optimizeRouteButton.querySelector('span');
            if (btnSpan) {
                btnSpan.textContent = 'Optymalizacja...';
            } else {
                optimizeRouteButton.textContent = 'Optymalizacja...';
            }
            startNavigationButton.style.display = 'none';



            // Sprawdź czy funkcja optimizeRoute istnieje
            if (typeof optimizeRoute === 'undefined') {
                throw new Error('Funkcja optimizeRoute nie jest dostępna');
            }

            // Pobierz wybraną wartość czasu stopu przed optymalizacją
            let stopTimeMinutes = 0; // Wartość domyślna
            const stopTimeSelect = document.getElementById('stop-time-select');
            if (stopTimeSelect) {
                const parsedValue = parseInt(stopTimeSelect.value, 10);
                stopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
                console.log('Pobrano czas stopu z pola formularza:', stopTimeMinutes, 'minut');
            }

            // Pobierz wybraną godzinę startu
            let startTime = null; // Domyślnie null (teraz)
            const startTimeSelectElement = document.getElementById('start-time-select');
            if (startTimeSelectElement && startTimeSelectElement.value) {
                // Konwertuj wybraną godzinę na obiekt Date
                const [hours, minutes] = startTimeSelectElement.value.split(':').map(Number);
                const today = new Date();
                startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);

                // Jeśli wybrana godzina jest w przeszłości, ustaw na jutro
                if (startTime < today) {
                    startTime.setDate(startTime.getDate() + 1);
                }

                console.log('Wybrano godzinę startu:', startTimeSelectElement.value, '->', startTime.toLocaleString('pl-PL'));
            }

            // Pobierz stan checkboxa odwracania trasy
            let reverseRoute = false;
            const reverseRouteCheckbox = document.getElementById('reverse-route-checkbox');
            if (reverseRouteCheckbox) {
                reverseRoute = reverseRouteCheckbox.checked;
            }

            console.log('Rozpoczynam optymalizację z czasem postoju:', stopTimeMinutes, 'minut, odwrócenie trasy:', reverseRoute, 'godzina startu:', startTime ? startTime.toLocaleString('pl-PL') : 'teraz');

            // Użyj algorytmu optymalizacji z route_optimizer.js z uwzględnieniem czasu postoju, odwrócenia i godziny startu
            const optimizationResult = await optimizeRoute(startPoint, endPoint, intermediatePoints, stopTimeMinutes, reverseRoute, startTime);

            // DODANIE METADANYCH DO ZAPISU (aby przywrócić stan formularzy po restarcie)
            optimizationResult.savedStopTimeMinutes = stopTimeMinutes;
            optimizationResult.savedStartTimeValue = startTimeSelectElement ? startTimeSelectElement.value : "";

            // Zapisz wartości selektorów start-point i end-point
            const startPointSelect = this.tableManager.getStartPointSelect();
            const endPointSelect = this.tableManager.getEndPointSelect();
            optimizationResult.savedStartPointValue = startPointSelect ? startPointSelect.value : "";
            optimizationResult.savedEndPointValue = endPointSelect ? endPointSelect.value : "";

            // Zapisz realnie użyte punkty (zamrożone współrzędne z chwili optymalizacji)
            // Dzięki temu cicha reoptymalizacja może użyć oryginalnych współrzędnych końcowych
            optimizationResult.resolvedStartPoint = startPoint;
            optimizationResult.resolvedEndPoint = endPoint;

            const finalRoute = optimizationResult.route;
            const optimizedDistance = optimizationResult.optimizedDistance;

            this.optimizedRouteData = finalRoute;
            this.optimizationResult = optimizationResult;

            // Zapisz dane do trwałego magazynu za pomocą StorageManager
            if (typeof window.storageManager !== 'undefined') {
                window.storageManager.saveOptimizedRoute(
                    JSON.stringify(finalRoute),
                    JSON.stringify(optimizationResult)
                );
            } else {
                // Fallback do sessionStorage jeśli StorageManager nie jest dostępny
                try {
                    sessionStorage.setItem('optimizedRouteData', JSON.stringify(finalRoute));
                    sessionStorage.setItem('optimizationResult', JSON.stringify(optimizationResult));
                } catch (e) {
                    // Jeśli sessionStorage pełny lub błąd, ignoruj
                }
            }

            // Zapisz stan checkboxa odwracania trasy
            try {
                sessionStorage.setItem('reverseRouteState', reverseRoute.toString());
            } catch (e) {
                console.warn('Nie udało się zapisać stanu checkboxa odwracania trasy:', e);
            }

            // Najpierw zaktualizuj tabelę, aby elementy HTML zostały utworzone oraz spójność ID
            // Dzięki temu numeracja w tabeli i markerach będzie zgodna
            this.tableManager.updateTable(finalRoute);

            // Pobierz godzinę startu do obliczeń szacunkowych czasów przyjazdu
            let startTimeForDisplay = null;
            const startTimeSelectForDisplay = document.getElementById('start-time-select');
            if (startTimeSelectForDisplay && startTimeSelectForDisplay.value) {
                const [hours, minutes] = startTimeSelectForDisplay.value.split(':').map(Number);
                const today = new Date();
                startTimeForDisplay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);

                // Jeśli wybrana godzina jest w przeszłości, ustaw na jutro
                if (startTimeForDisplay < today) {
                    startTimeForDisplay.setDate(startTimeForDisplay.getDate() + 1);
                }
            }

            // Następnie oblicz i wyświetl szacunkowe godziny przyjazdu dla każdego adresu (z uwzględnieniem czasu stopu i godziny startu)
            this.tableManager.calculateAndDisplayArrivalTimes(finalRoute, optimizationResult.durations, optimizationResult.locationToIndexMap, optimizationResult.allLocations, startTimeForDisplay, stopTimeMinutes);

            // WAŻNE: Resetuj statusy adresów PRZED rysowaniem trasy
            // Dzięki temu nowe znaczniki zostaną utworzone z domyślnym niebieskim kolorem
            if (this.tableManager && typeof this.tableManager.resetAddressStatuses === 'function') {
                this.tableManager.resetAddressStatuses();
            }

            // Na końcu narysuj trasę i pobierz rzeczywistą odległość po drogach
            // To zapobiegnie duplikacji znaczników i zapewni spójną numerację markerów z tabelą
            const roadDistance = await this.mapManager.drawRoute(finalRoute);

            // Wyświetl informacje o trasie w interfejsie (z uwzględnieniem czasu stopu)
            this.displayRouteInfo(optimizationResult, roadDistance, finalRoute.length, stopTimeMinutes);


            // HISTORIA PRZEJAZDÓW - rozpocznij nowy przejazd
            if (typeof Android !== 'undefined' && Android.rhStartRide) {
                try {
                    const pointsSnapshot = finalRoute
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
                        console.log('[RideHistory] Rozpoczęto przejazd:', rideId);
                    }
                } catch (e) {
                    console.error('[RideHistory] Błąd przy startowaniu przejazdu:', e);
                }
            }

            // Pokaż kontener zapisywania trasy po optymalizacji
            if (window.routeStorage && typeof window.routeStorage.showSaveRouteContainer === 'function') {
                window.routeStorage.showSaveRouteContainer();
            }

            const finalSpan = optimizeRouteButton.querySelector('span');
            const finalText = this.isReoptimizeNeeded() ? 'Reoptymalizuj trasę' : 'Optymalizuj trasę';
            if (finalSpan) {
                finalSpan.textContent = finalText;
            } else {
                optimizeRouteButton.textContent = finalText;
            }
            optimizeRouteButton.disabled = false;

            if (finalRoute.length >= 2) {
                startNavigationButton.style.display = 'inline-block';
                startNavigationButton.innerHTML = 'Rozpocznij Nawigację';
                startNavigationButton.disabled = false;
            }

            // Ukryj ekran ładowania optymalizacji
            this.hideOptimizationLoadingOverlay();

            // Wyczyść tymczasowe dane
            this.pendingOptimizationData = null;

            // Jeśli reklama nie była wyświetlona PRZED optymalizacją, spróbuj teraz PO
            if (!this.adShownBeforeOptimization) {
                if (typeof Android !== 'undefined' && Android.showAdPostOptimize) {
                    console.log('Reklama nie była gotowa wcześniej - próbuję wyświetlić po optymalizacji');
                    Android.showAdPostOptimize();
                }
            }

            this.adShownBeforeOptimization = false;

        } catch (error) {
            console.error('Błąd podczas optymalizacji:', error);

            // Ukryj ekran ładowania optymalizacji w przypadku błędu
            this.hideOptimizationLoadingOverlay();

            const errSpan = optimizeRouteButton.querySelector('span');
            const errText = this.isReoptimizeNeeded() ? 'Reoptymalizuj trasę' : 'Optymalizuj trasę';
            if (errSpan) {
                errSpan.textContent = errText;
            } else {
                optimizeRouteButton.textContent = errText;
            }
            optimizeRouteButton.disabled = false;
            startNavigationButton.style.display = 'none';

            // Ukryj informacje o trasie
            const routeInfo = document.getElementById('route-info');
            if (routeInfo) {
                routeInfo.style.display = 'none';
            }
            // Usuń dane optymalizacji w przypadku błędu
            if (typeof window.storageManager !== 'undefined') {
                window.storageManager.clearOptimizedRoute();
            } else {
                sessionStorage.removeItem('optimizedRouteData');
                sessionStorage.removeItem('optimizationResult');
            }
        }
    }

    // Wyświetlanie informacji o trasie w interfejsie
    displayRouteInfo(optimizationResult, roadDistance, routePointsCount, stopTimeMinutes = 0) {
        const routeInfo = document.getElementById('route-info');
        const totalDistanceElement = document.getElementById('total-distance');
        const routePointsElement = document.getElementById('route-points');
        const estimatedTravelTimeElement = document.getElementById('estimated-travel-time');

        if (!routeInfo || !totalDistanceElement || !routePointsElement || !estimatedTravelTimeElement) {
            console.warn('Elementy interfejsu informacji o trasie nie zostały znalezione');
            return;
        }

        // Wyświetl całkowitą długość trasy (preferuj rzeczywistą odległość po drogach)
        const displayDistance = roadDistance || optimizationResult.optimizedDistance;
        const distanceKm = (displayDistance / 1000).toFixed(1);

        totalDistanceElement.textContent = `${distanceKm} km`;

        // Wyświetl liczbę punktów (tylko rzeczywiste punkty, bez "Aktualna pozycja")
        let actualPointsCount = routePointsCount;
        if (this.optimizedRouteData) {
            // Jeśli mamy dane trasy, oblicz rzeczywistą liczbę punktów (bez "Aktualna pozycja")
            actualPointsCount = this.optimizedRouteData.filter(point => point.address !== 'Aktualna pozycja').length;
        }
        routePointsElement.textContent = actualPointsCount.toString();

        // WAŻNE: Jeśli stopTimeMinutes nie został przekazany (= 0), pobierz z pola formularza
        // Dzięki temu szacunkowy czas będzie zawsze prawidłowy
        let effectiveStopTimeMinutes = stopTimeMinutes;
        if (effectiveStopTimeMinutes === 0) {
            const stopTimeSelect = document.getElementById('stop-time-select');
            if (stopTimeSelect) {
                const parsedValue = parseInt(stopTimeSelect.value, 10);
                effectiveStopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
                console.log('Pobrano czas stopu z pola formularza:', effectiveStopTimeMinutes, 'minut');
            }
        }

        // Oblicz szacunkowy czas przejechania (przyjmujemy średnią prędkość 50 km/h w mieście)
        const averageSpeedKmh = 50; // km/h
        const travelTimeHours = displayDistance / 1000 / averageSpeedKmh;
        let travelTimeMinutes = Math.round(travelTimeHours * 60);

        // Dodaj czas stopu dla każdego punktu pośredniego (bez startu i końca)
        // Używaj effectiveStopTimeMinutes zamiast stopTimeMinutes
        if (effectiveStopTimeMinutes > 0 && routePointsCount > 2) {
            travelTimeMinutes += (routePointsCount - 2) * effectiveStopTimeMinutes;
            console.log('Dodano czas stopu:', (routePointsCount - 2) * effectiveStopTimeMinutes, 'minut (' + (routePointsCount - 2) + ' punktów x ' + effectiveStopTimeMinutes + ' min)');
        }

        // Formatuj czas
        let timeDisplay;
        if (travelTimeMinutes < 60) {
            timeDisplay = `${travelTimeMinutes} min`;
        } else {
            const hours = Math.floor(travelTimeMinutes / 60);
            const minutes = travelTimeMinutes % 60;
            timeDisplay = minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
        }

        estimatedTravelTimeElement.textContent = timeDisplay;

        // Pokaż sekcję z informacjami (w modalu) i przycisk szczegółów
        routeInfo.style.display = 'block';

        const showDetailsBtn = document.getElementById('show-route-details-button');
        if (showDetailsBtn) {
            showDetailsBtn.style.display = 'flex';
        }
    }

    // Pobieranie danych zoptymalizowanej trasy
    getOptimizedRouteData() {
        if (!this.optimizedRouteData || !this.optimizationResult) {
            return null;
        }

        return {
            route: this.optimizedRouteData,
            optimizedDistance: this.optimizationResult.optimizedDistance,
            optimizedDistanceKm: (this.optimizationResult.optimizedDistance / 1000).toFixed(1),
            initialDistance: this.optimizationResult.initialDistance,
            savings: this.optimizationResult.savings,
            savingsKm: (this.optimizationResult.savings / 1000).toFixed(1),
            savingsPercentage: this.optimizationResult.savingsPercentage
        };
    }




    // Rozpoczęcie nawigacji (uproszczone)
    startNavigation() {
        if (!this.optimizedRouteData || this.optimizedRouteData.length < 2) {
            alert('Brak wystarczających danych trasy do nawigacji');
            return;
        }

        // Pokaż wskaźnik ładowania
        this.showLoadingIndicator();

        // Wyświetl reklamę przed rozpoczęciem nawigacji
        if (typeof Android !== 'undefined' && Android.showAdAfterStartNavigation) {
            Android.showAdAfterStartNavigation();
            // Nawigacja zostanie uruchomiona po zamknięciu reklamy przez callback onAdClosed()
        } else {
            // Jeśli brak reklamy, uruchom nawigację po krótkim opóźnieniu
            setTimeout(() => {
                this.proceedWithNavigation();
            }, 2000);
        }
    }

    // Wyświetlanie wskaźnika ładowania
    showLoadingIndicator() {
        const startNavigationButton = document.getElementById('start-navigation');
        if (startNavigationButton) {
            startNavigationButton.disabled = true;
            startNavigationButton.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></span>Proszę czekać...';

            // Dodaj style animacji jeśli nie istnieją
            if (!document.getElementById('loading-animation-style')) {
                const style = document.createElement('style');
                style.id = 'loading-animation-style';
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }

    // Ukrywanie wskaźnika ładowania
    hideLoadingIndicator() {
        const startNavigationButton = document.getElementById('start-navigation');
        if (startNavigationButton) {
            startNavigationButton.disabled = false;
            // Ustaw odpowiedni tekst w zależności od historii nawigacji
            this.updateNavigationButtonText();
        }
    }

    // Pokazywanie ekranu ładowania optymalizacji (taki sam jak przy ładowaniu mapy)
    showOptimizationLoadingOverlay() {
        const loadingOverlay = document.getElementById('map-loading-overlay');
        const loadingText = document.querySelector('.map-loading-text');

        if (loadingOverlay && loadingText) {
            // Zmień tekst na optymalizację trasy
            loadingText.textContent = 'Optymalizacja trasy...';

            // Pokaż overlay z animacją fade-in
            loadingOverlay.style.display = 'flex';
            loadingOverlay.classList.remove('fade-out');

            console.log('Pokazano ekran ładowania optymalizacji');
        }
    }

    // Ukrywanie ekranu ładowania optymalizacji
    hideOptimizationLoadingOverlay() {
        const loadingOverlay = document.getElementById('map-loading-overlay');
        const loadingText = document.querySelector('.map-loading-text');

        if (loadingOverlay && loadingText) {
            // Dodaj animację fade-out
            loadingOverlay.classList.add('fade-out');

            // Ukryj overlay po zakończeniu animacji
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
                // Przywróć oryginalny tekst dla przyszłych użyć
                loadingText.textContent = 'Ładowanie mapy...';
            }, 300); // 300ms to czas trwania animacji fade-out

            console.log('Ukryto ekran ładowania optymalizacji');
        }
    }

    // Aktualizuje tekst przycisku nawigacji dynamicznie zależnie od statusów adresów
    updateNavigationButtonText() {
        const startNavigationButton = document.getElementById('start-navigation');
        if (!startNavigationButton) return;

        let hasHistory = false;
        try {
            if (typeof Android !== 'undefined' && Android.getAllAddressStatuses) {
                const statusesJson = Android.getAllAddressStatuses();
                if (statusesJson && statusesJson !== '{}' && statusesJson !== 'null') {
                    const statuses = JSON.parse(statusesJson);
                    for (const key in statuses) {
                        const status = statuses[key];
                        if (status === 'Odwiedzony' || status === 'Pominięty') {
                            hasHistory = true;
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[NavigationManager.updateNavigationButtonText] -> Nie udało się odczytać statusów:', e);
        }

        startNavigationButton.innerHTML = hasHistory ? 'Wznów Nawigację' : 'Rozpocznij Nawigację';
    }


    // Callback wywoływany po zamknięciu reklamy
    onAdClosed() {
        console.log('Reklama została zamknięta - rozpoczynam nawigację');
        this.proceedWithNavigation();
    }

    // Metoda resetCache została usunięta jako zbędna
    // Funkcjonalność przeniesiona do clearOptimizedRoute()

    // Kontynuacja nawigacji po opóźnieniu (uproszczone)
    proceedWithNavigation() {
        console.log(`[NavigationManager.proceedWithNavigation] -> Rozpoczęcie kontynuacji nawigacji`);

        // Ukryj wskaźnik ładowania
        this.hideLoadingIndicator();



        // Po synchronizacji sprawdź czy są jeszcze adresy do nawigacji
        if (!this.optimizedRouteData || this.optimizedRouteData.length === 0) {
            console.warn(`[NavigationManager.proceedWithNavigation] -> Brak adresów do nawigacji`);
            alert('Brak adresów do nawigacji');
            return;
        }

        let targetPoint = null;
        let targetIndex = -1;

        // Zbuduj zbiór odwiedzonych adresów na podstawie zapisanych statusów
        let visitedSet = new Set();
        try {
            if (typeof Android !== 'undefined' && Android.getAllAddressStatuses) {
                const statusesJson = Android.getAllAddressStatuses();
                if (statusesJson && statusesJson !== '{}' && statusesJson !== 'null') {
                    const statuses = JSON.parse(statusesJson);
                    Object.entries(statuses).forEach(([key, val]) => {
                        if (val === 'Odwiedzony') {
                            visitedSet.add(key);
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('[NavigationManager.proceedWithNavigation] -> Nie udało się pobrać statusów adresów:', e);
        }

        // Znajdź pierwszy adres, który nie jest "Aktualna pozycja" i nie ma statusu "Odwiedzony"
        for (let i = 0; i < this.optimizedRouteData.length; i++) {
            const p = this.optimizedRouteData[i];
            if (p.address === 'Aktualna pozycja') continue;
            // Generuj spójny klucz za pomocą generateAddressKey, aby poprawnie pominąć odwiedzone adresy
            const key = typeof generateAddressKey === 'function'
                ? generateAddressKey(p.address, p.lat, p.lng)
                : `${p.address}_${p.lat}_${p.lng}`; // Fallback
            if (!visitedSet.has(key)) {
                targetPoint = p;
                targetIndex = i;
                console.log(`[NavigationManager.proceedWithNavigation] -> Wybrano następny cel z pominięciem odwiedzonych | address: ${targetPoint.address}, index: ${targetIndex}`);
                break;
            }
        }

        if (!targetPoint) {
            console.log(`[NavigationManager.proceedWithNavigation] -> Nie znaleziono prawidłowego adresu (wszystkie to 'Aktualna pozycja')`);
        }

        if (!targetPoint) {
            console.warn(`[NavigationManager.proceedWithNavigation] -> Wszystkie adresy zostały już odwiedzone (adresy pominięte pozostają dostępne)`);
            alert('Wszystkie adresy zostały już odwiedzone (adresy pominięte pozostają dostępne)');
            // Aktualizuj przycisk, aby pokazać że nawigacja jest zakończona
            this.updateNavigationButtonText();
            return;
        }

        console.log(`[NavigationManager.proceedWithNavigation] -> Rozpoczynam nawigację do: ${targetPoint.address} (indeks: ${targetIndex})`);

        // Zapisz aktualny indeks w sessionStorage tylko jeśli się zmienił
        if (targetIndex >= 0) {
            const currentStoredIndex = sessionStorage.getItem('currentRouteIndex');
            const newIndex = targetIndex.toString();
            if (currentStoredIndex !== newIndex) {
                sessionStorage.setItem('currentRouteIndex', newIndex);
                console.log(`[NavigationManager.proceedWithNavigation] -> Zapisano indeks trasy w sessionStorage | index: ${newIndex}`);
            } else {
                console.log(`[NavigationManager.proceedWithNavigation] -> Indeks trasy bez zmian w sessionStorage | index: ${newIndex}`);
            }
        }

        // Wywołanie funkcji nawigacji z ustawieniami paczki jeśli są dostępne
        if (typeof Android !== 'undefined' && Android !== null) {
            const packageSettingsWithDelivery = targetPoint.packageSettings ? { ...targetPoint.packageSettings } : {};
            packageSettingsWithDelivery.deliveryType = targetPoint.deliveryType || '';

            // Dodaj nazwę ulubionego jeśli jest dostępna
            if (targetPoint.favoriteName) {
                packageSettingsWithDelivery.favoriteName = targetPoint.favoriteName;
                console.log(`[NavigationManager] Dodano nazwę ulubioną: ${targetPoint.favoriteName}`);
            }

            // Dodaj notatki jeśli są dostępne
            if (targetPoint.notes) {
                packageSettingsWithDelivery.notes = targetPoint.notes;
            }

            // Dodaj zdjęcia jeśli istnieją bezpośrednio w obiekcie punktu
            if (Array.isArray(targetPoint.photos) && targetPoint.photos.length > 0) {
                packageSettingsWithDelivery.photos = targetPoint.photos
                    .filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,'))
                    .slice(0, 2);
                console.log(`[NavigationManager.proceedWithNavigation] -> Zdjęcia z obiektu trasy (count=${packageSettingsWithDelivery.photos.length})`);
            }

            // Fallback: jeśli brak zdjęć w punkcie trasy, spróbuj pobrać z TableManager.addresses (źródło prawdy)
            // POPRAWKA: Dodano również pobieranie packageSettings dla punktu startowego
            if (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function') {
                try {
                    const tm = window.optiDrogApp.getTableManager();
                    if (tm && Array.isArray(tm.addresses)) {
                        // Dopasowanie po adresie + wsp. aby uniknąć kolizji
                        const match = tm.addresses.find(a =>
                            a.address === targetPoint.address &&
                            Math.abs(a.lat - targetPoint.lat) < 0.000001 &&
                            Math.abs(a.lng - targetPoint.lng) < 0.000001
                        );
                        if (match) {
                            // POPRAWKA: Pobierz packageSettings jeśli istnieją i nie ma ich w punkcie
                            // To jest kluczowe dla punktu startowego, który może mieć ustawienia z modala
                            if (match.packageSettings && Object.keys(match.packageSettings).length > 0) {
                                // Scal packageSettings z match z istniejącymi ustawieniami
                                // Priorytet mają ustawienia z match (TableManager.addresses)
                                const mergedSettings = { ...match.packageSettings, ...packageSettingsWithDelivery };
                                // Zachowaj deliveryType z punktu trasy jeśli jest ustawiony
                                if (packageSettingsWithDelivery.deliveryType) {
                                    mergedSettings.deliveryType = packageSettingsWithDelivery.deliveryType;
                                }
                                // Skopiuj wszystkie właściwości do packageSettingsWithDelivery
                                Object.assign(packageSettingsWithDelivery, mergedSettings);
                                console.log(`[NavigationManager.proceedWithNavigation] -> packageSettings pobrane z TableManager:`, match.packageSettings);
                            }
                            
                            // Pobierz zdjęcia jeśli są dostępne
                            if (Array.isArray(match.photos) && match.photos.length > 0) {
                                packageSettingsWithDelivery.photos = match.photos
                                    .filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,'))
                                    .slice(0, 2);
                                console.log(`[NavigationManager.proceedWithNavigation] -> Zdjęcia pobrane z TableManager (count=${packageSettingsWithDelivery.photos.length})`);
                            }

                            // Pobierz nazwę ulubioną jeśli jest dostępna i nie została jeszcze dodana
                            if (match.favoriteName && !packageSettingsWithDelivery.favoriteName) {
                                packageSettingsWithDelivery.favoriteName = match.favoriteName;
                                console.log(`[NavigationManager.proceedWithNavigation] -> Nazwa ulubiona pobrana z TableManager: ${match.favoriteName}`);
                            }
                            
                            // Pobierz notatki jeśli są dostępne w packageSettings
                            if (match.packageSettings && match.packageSettings.notes && !packageSettingsWithDelivery.notes) {
                                packageSettingsWithDelivery.notes = match.packageSettings.notes;
                                console.log(`[NavigationManager.proceedWithNavigation] -> Notatki pobrane z TableManager`);
                            }
                        } else {
                            console.log('[NavigationManager.proceedWithNavigation] -> Brak dopasowania w TableManager dla adresu');
                        }
                    }
                } catch (e) {
                    console.warn('[NavigationManager.proceedWithNavigation] -> Błąd podczas pobierania danych z TableManager:', e);
                }
            }

            const packageSettingsJson = JSON.stringify(packageSettingsWithDelivery);
            console.log(`[NavigationManager.proceedWithNavigation] -> Wywołanie Android.openGoogleMapsWithPackageSettings | lat: ${targetPoint.lat}, lng: ${targetPoint.lng}, address: ${targetPoint.address}, packageSettings: ${packageSettingsJson}, deliveryType: ${packageSettingsWithDelivery.deliveryType}, photosCount=${packageSettingsWithDelivery.photos ? packageSettingsWithDelivery.photos.length : 0}`);

            // Zapisz ustawienia paczki dla wszystkich adresów w trasie
            // To zapewni, że każdy adres będzie miał ustawienia paczki
            if (this.optimizedRouteData && this.optimizedRouteData.length > 0) {
                this.optimizedRouteData.forEach(point => {
                    if (point.address !== 'Aktualna pozycja') {
                        // Skopiuj ustawienia deliveryType do wszystkich punktów
                        if (!point.packageSettings) {
                            point.packageSettings = {};
                        }
                        // Zachowaj istniejący deliveryType lub użyj domyślnego
                        point.packageSettings.deliveryType = point.deliveryType || packageSettingsWithDelivery.deliveryType;
                        point.deliveryType = point.deliveryType || packageSettingsWithDelivery.deliveryType;

                        // Zachowaj istniejącą nazwę ulubioną dla każdego punktu
                        if (point.favoriteName) {
                            point.packageSettings.favoriteName = point.favoriteName;
                            console.log(`[NavigationManager] Zachowano nazwę ulubioną dla adresu ${point.address}: ${point.favoriteName}`);
                        }
                    }
                });
            }

            // Filtrowanie aktualnej trasy musi używać generateAddressKey, aby poprawnie odrzucić odwiedzone punkty
            const filteredRoute = (this.optimizedRouteData || []).filter(p => {
                if (p.address === 'Aktualna pozycja') return false; // Pomijamy pseudo-punkt aktualnej pozycji
                const key = typeof generateAddressKey === 'function'
                    ? generateAddressKey(p.address, p.lat, p.lng)
                    : `${p.address}_${p.lat}_${p.lng}`;
                return !visitedSet.has(key); // Zostaw tylko nieodwiedzone
            });
            try { sessionStorage.setItem('currentRoute', JSON.stringify(filteredRoute)); } catch (e) { console.warn('Nie udało się zapisać currentRoute:', e); }
            sessionStorage.setItem('currentRouteIndex', '0');

            // Upewnij się, że packageSettingsJson nigdy nie jest null
            Android.openGoogleMapsWithPackageSettings(targetPoint.lat, targetPoint.lng, targetPoint.address, packageSettingsJson);
        } else {
            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetPoint.lat},${targetPoint.lng}`;
            console.log(`[NavigationManager.proceedWithNavigation] -> Otwieranie Google Maps w przeglądarce | url: ${googleMapsUrl}`);
            window.open(googleMapsUrl, '_system');
        }

        console.log(`[NavigationManager.proceedWithNavigation] -> Zakończono kontynuację nawigacji`);
    }

    // Nawigacja do konkretnego punktu
    navigateToPoint(point) {
        if (!point) return;

        console.log(`[NavigationManager.navigateToPoint] -> Nawigacja do: ${point.address}`);

        if (typeof Android !== 'undefined' && Android !== null) {
            const packageSettingsWithDelivery = point.packageSettings ? { ...point.packageSettings } : {};
            packageSettingsWithDelivery.deliveryType = point.deliveryType || '';

            // Próba pobrania brakujących danych z TableManager (zdjęcia, nazwa ulubionego)
            if (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function') {
                try {
                    const tm = window.optiDrogApp.getTableManager();
                    if (tm && Array.isArray(tm.addresses)) {
                        const match = tm.addresses.find(a =>
                            a.address === point.address &&
                            Math.abs(a.lat - point.lat) < 0.000001 &&
                            Math.abs(a.lng - point.lng) < 0.000001
                        );
                        if (match) {
                            if (match.favoriteName && !packageSettingsWithDelivery.favoriteName) {
                                packageSettingsWithDelivery.favoriteName = match.favoriteName;
                            }
                            if (Array.isArray(match.photos) && match.photos.length > 0 && (!packageSettingsWithDelivery.photos || packageSettingsWithDelivery.photos.length === 0)) {
                                packageSettingsWithDelivery.photos = match.photos.filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,')).slice(0, 2);
                            }
                            if (match.notes && !packageSettingsWithDelivery.notes) {
                                packageSettingsWithDelivery.notes = match.notes;
                            }

                            // Przekaż numer telefonu jeśli istnieje
                            if (match.phoneNumber) {
                                packageSettingsWithDelivery.phoneNumber = match.phoneNumber;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[NavigationManager.navigateToPoint] -> Błąd podczas pobierania danych z TableManager:', e);
                }
            }

            const packageSettingsJson = JSON.stringify(packageSettingsWithDelivery);
            console.log(`[NavigationManager.navigateToPoint] -> Wywołanie Android.openGoogleMapsWithPackageSettings | lat: ${point.lat}, lng: ${point.lng}, address: ${point.address}`);

            // Zapisz tylko ten JEDEN adres jako aktualną trasę, aby nawigacja zakończyła się na nim
            try {
                sessionStorage.setItem('currentRoute', JSON.stringify([point]));
                sessionStorage.setItem('currentRouteIndex', '0');
                console.log(`[NavigationManager.navigateToPoint] -> Zapisano pojedynczy punkt jako currentRoute`);
            } catch (e) {
                console.warn('[NavigationManager.navigateToPoint] -> Nie udało się zapisać currentRoute w sessionStorage:', e);
            }

            Android.openGoogleMapsWithPackageSettings(point.lat, point.lng, point.address, packageSettingsJson);
        } else {
            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
            console.log(`[NavigationManager.navigateToPoint] -> Otwieranie Google Maps w przeglądarce | url: ${googleMapsUrl}`);
            window.open(googleMapsUrl, '_system');
        }
    }

    /**
     * Zoptymalizowana metoda czyszczenia danych nawigacji
     * Współpracuje z nową metodą clearAllAppData
     */
    /**
     * Cicha optymalizacja w locie - wywoływana po dodaniu nowego adresu do zoptymalizowanej trasy
     * Pomija adresy oznaczone jako "Odwiedzony" i wykonuje reoptymalizację bez overlay ładowania
     *
     * @param {boolean} isManual - Jeśli true, wyświetl reklamę PRZED optymalizacją (gdy użytkownik klika "Reoptymalizuj")
     *                            - Jeśli false (domyślnie), pomiń reklamę (automatyczna cicha optymalizacja)
     */
    async silentOptimizeRoute(isManual = false) {
        console.log('[NavigationManager.silentOptimizeRoute] -> Rozpoczęcie, isManual:', isManual);

        // Jeśli to ręczna reoptymalizacja (przycisk "Reoptymalizuj") - wyświetl reklamę PRZED
        if (isManual) {
            return this.silentOptimizeRouteWithAd();
        }

        // Automatyczna cicha optymalizacja - ustaw flagę i wykonaj (reklama będzie PO)
        this.isAutoSilentOptimization = true;
        return this.proceedWithSilentOptimization();
    }

    /**
     * Rozpoczyna reoptymalizację z reklamą PRZED (dla ręcznego wywołania przez przycisk)
     */
    async silentOptimizeRouteWithAd() {
        console.log('[NavigationManager.silentOptimizeRouteWithAd] -> Wyświetlanie reklamy przed reoptymalizacją');

        // Zapisz informację o oczekującej reoptymalizacji
        this.pendingReoptimization = true;
        this.adShownBeforeReoptimization = false;

        // Wyświetl reklamę PRZED reoptymalizacją
        if (typeof Android !== 'undefined' && Android.showAdAfterReoptimize) {
            console.log('[NavigationManager] Żądanie reklamy przed reoptymalizacją...');
            Android.showAdAfterReoptimize();
            // proceedWithSilentOptimization zostanie wywołane przez onAdClosedForReoptimize() z Androida
        } else {
            // Fallback - kontynuuj bez reklamy (np. w przeglądarce)
            console.log('[NavigationManager] Brak Android.showAdAfterReoptimize - kontynuacja bez reklamy');
            this.proceedWithSilentOptimization();
        }
    }

    /**
     * Callback wywoływany po zamknięciu reklamy przed reoptymalizacją
     * @param {boolean} wasShown - Czy reklama została wyświetlona
     */
    onAdClosedForReoptimize(wasShown = false) {
        console.log('[NavigationManager.onAdClosedForReoptimize] -> Reklama zamknięta/pominięta (status: ' + wasShown + ')');
        this.adShownBeforeReoptimization = wasShown;
        this.proceedWithSilentOptimization();
    }

    /**
     * Właściwa logika cichej reoptymalizacji (wywoływana po reklamie lub bezpośrednio)
     */
    async proceedWithSilentOptimization() {
        console.log('[NavigationManager.proceedWithSilentOptimization] -> Rozpoczęcie obliczeń');

        // Sprawdź czy trasa jest zoptymalizowana
        if (!this.optimizedRouteData || this.optimizedRouteData.length === 0) {
            console.log('[NavigationManager.silentOptimizeRoute] -> Brak zoptymalizowanej trasy, pomijam');
            return false;
        }

        // Sprawdź czy funkcja optimizeRoute istnieje
        if (typeof optimizeRoute === 'undefined') {
            console.error('[NavigationManager.silentOptimizeRoute] -> Funkcja optimizeRoute nie jest dostępna');
            return false;
        }

        try {
            // Pobierz statusy wszystkich adresów
            let visitedAddressKeys = new Set();
            if (typeof Android !== 'undefined' && Android.getAllAddressStatuses) {
                const statusesJson = Android.getAllAddressStatuses();
                if (statusesJson && statusesJson !== '{}' && statusesJson !== 'null') {
                    const statuses = JSON.parse(statusesJson);
                    Object.entries(statuses).forEach(([key, val]) => {
                        if (val === 'Odwiedzony') {
                            visitedAddressKeys.add(key);
                        }
                    });
                }
            }

            console.log('[NavigationManager.silentOptimizeRoute] -> Odwiedzone adresy:', visitedAddressKeys.size);

            // Pobierz wszystkie adresy z TableManager
            const allAddresses = this.tableManager.getAddresses();
            if (!allAddresses || allAddresses.length === 0) {
                console.log('[NavigationManager.silentOptimizeRoute] -> Brak adresów w tabeli');
                return false;
            }

            // Rozdziel adresy na odwiedzone i nieodwiedzone
            const visitedAddresses = [];
            const unvisitedAddresses = [];

            allAddresses.forEach(addr => {
                const addressKey = addr.id ||
                    (typeof generateAddressKey === 'function'
                        ? generateAddressKey(addr.address, addr.lat, addr.lng)
                        : `${addr.address}_${addr.lat}_${addr.lng}`);
                if (visitedAddressKeys.has(addressKey)) {
                    visitedAddresses.push(addr);
                } else {
                    unvisitedAddresses.push(addr);
                }
            });

            console.log('[NavigationManager.silentOptimizeRoute] -> Odwiedzone:', visitedAddresses.length, 'Nieodwiedzone:', unvisitedAddresses.length);

            // Jeśli nie ma nieodwiedzonych adresów (poza punktem końcowym), nie ma co optymalizować
            if (unvisitedAddresses.length === 0) {
                console.log('[NavigationManager.silentOptimizeRoute] -> Brak nieodwiedzonych adresów do optymalizacji');
                return false;
            }

            // Pobierz punkt startowy i końcowy z selectów
            const startValue = this.tableManager.getStartPointSelect().value;
            const endValue = this.tableManager.getEndPointSelect().value;

            if (!startValue || !endValue) {
                console.log('[NavigationManager.silentOptimizeRoute] -> Brak punktu startowego lub końcowego');
                return false;
            }

            let startPoint, endPoint;
            const currentPos = this.mapManager.getCurrentPosition();

            // Punkt startowy - preferuj aktualną pozycję jeśli dostępna
            if (currentPos.lat !== null && currentPos.lng !== null) {
                startPoint = {
                    address: 'Aktualna pozycja',
                    lat: parseFloat(currentPos.lat),
                    lng: parseFloat(currentPos.lng)
                };
            } else if (startValue === 'current-location') {
                console.log('[NavigationManager.silentOptimizeRoute] -> Aktualna pozycja niedostępna');
                return false;
            } else {
                startPoint = JSON.parse(startValue);
            }

            // Punkt końcowy
            if (endValue === 'current-location') {
                // Użyj ZAMROŻONEGO punktu końcowego z momentu oryginalnej optymalizacji
                // Dzięki temu jeśli użytkownik odjedzie 20km, punkt końcowy nie zmienia się
                const prev = this.optimizationResult;
                const hasFrozenEnd =
                    prev &&
                    prev.savedEndPointValue === 'current-location' &&
                    prev.resolvedEndPoint &&
                    prev.resolvedEndPoint.lat != null &&
                    prev.resolvedEndPoint.lng != null;

                if (hasFrozenEnd) {
                    endPoint = {
                        address: 'Aktualna pozycja',
                        lat: parseFloat(prev.resolvedEndPoint.lat),
                        lng: parseFloat(prev.resolvedEndPoint.lng)
                    };
                    console.log('[NavigationManager.silentOptimizeRoute] -> Użyto zamrożonego punktu końcowego:', endPoint.lat, endPoint.lng);
                } else {
                    if (currentPos.lat === null || currentPos.lng === null) {
                        console.log('[NavigationManager.silentOptimizeRoute] -> Punkt końcowy to aktualna pozycja, ale jest niedostępna');
                        return false;
                    }
                    endPoint = {
                        address: 'Aktualna pozycja',
                        lat: parseFloat(currentPos.lat),
                        lng: parseFloat(currentPos.lng)
                    };
                }
            } else {
                endPoint = JSON.parse(endValue);
            }

            // Filtruj punkty pośrednie - usuń start, koniec i odwiedzone
            const EPS = 1e-5;
            const isSamePoint = (p1, p2) => {
                if (!p1 || !p2) return false;
                if (p1.address === 'Aktualna pozycja' || p2.address === 'Aktualna pozycja') {
                    return p1.address === p2.address;
                }
                return Math.abs(p1.lat - p2.lat) < EPS && Math.abs(p1.lng - p2.lng) < EPS;
            };

            const intermediatePoints = unvisitedAddresses.filter(addr => {
                return !isSamePoint(addr, startPoint) && !isSamePoint(addr, endPoint);
            });

            console.log('[NavigationManager.silentOptimizeRoute] -> Punkty pośrednie do optymalizacji:', intermediatePoints.length);

            // Jeśli nie ma punktów pośrednich, nie ma co optymalizować
            if (intermediatePoints.length === 0) {
                console.log('[NavigationManager.silentOptimizeRoute] -> Brak punktów pośrednich');
                return false;
            }

            // Pobierz parametry formularza
            let stopTimeMinutes = 0;
            const stopTimeSelect = document.getElementById('stop-time-select');
            if (stopTimeSelect) {
                const parsedValue = parseInt(stopTimeSelect.value, 10);
                stopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
            }

            let startTime = null;
            const startTimeSelectElement = document.getElementById('start-time-select');
            if (startTimeSelectElement && startTimeSelectElement.value) {
                const [hours, minutes] = startTimeSelectElement.value.split(':').map(Number);
                const today = new Date();
                startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
                if (startTime < today) {
                    startTime.setDate(startTime.getDate() + 1);
                }
            }

            let reverseRoute = false;
            const reverseRouteCheckbox = document.getElementById('reverse-route-checkbox');
            if (reverseRouteCheckbox) {
                reverseRoute = reverseRouteCheckbox.checked;
            }

            console.log('[NavigationManager.silentOptimizeRoute] -> Wywołanie optymalizacji dla', intermediatePoints.length, 'punktów');

            // Pokaż powiadomienie
            this.showSnackbar('Optymalizacja w tle... Proszę czekać.', 0, 'info');

            // Wykonaj optymalizację (cicho, bez overlay)
            const optimizationResult = await optimizeRoute(startPoint, endPoint, intermediatePoints, stopTimeMinutes, reverseRoute, startTime);

            // Zapisz metadane (pełny komplet jak w normalnej optymalizacji)
            optimizationResult.savedStopTimeMinutes = stopTimeMinutes;
            optimizationResult.savedStartTimeValue = startTimeSelectElement ? startTimeSelectElement.value : "";

            const startSel = this.tableManager.getStartPointSelect();
            const endSel = this.tableManager.getEndPointSelect();
            optimizationResult.savedStartPointValue = startSel ? startSel.value : "";
            optimizationResult.savedEndPointValue = endSel ? endSel.value : "";

            // resolvedStartPoint aktualizuje się (start to bieżąca pozycja)
            optimizationResult.resolvedStartPoint = startPoint;

            // resolvedEndPoint: jeśli end to current-location, zachowaj zamrożony z poprzedniego wyniku
            const prevResult = this.optimizationResult;
            if (optimizationResult.savedEndPointValue === 'current-location' && prevResult && prevResult.resolvedEndPoint) {
                optimizationResult.resolvedEndPoint = prevResult.resolvedEndPoint;
            } else {
                optimizationResult.resolvedEndPoint = endPoint;
            }

            // Połącz odwiedzone adresy z nową zoptymalizowaną trasą
            // Odwiedzone punkty zostają na początku (w oryginalnej kolejności)
            let finalRoute = optimizationResult.route;

            // Wstaw odwiedzone adresy na początek trasy (po punkcie startowym, przed nieodwiedzonymi)
            if (visitedAddresses.length > 0) {
                // Znajdź indeks pierwszego punktu który nie jest punktem startowym
                let insertIndex = 0;
                if (finalRoute.length > 0 && isSamePoint(finalRoute[0], startPoint)) {
                    insertIndex = 1;
                }

                // Wstaw odwiedzone adresy
                finalRoute.splice(insertIndex, 0, ...visitedAddresses);
            }

            this.optimizedRouteData = finalRoute;
            this.optimizationResult = optimizationResult;

            // Zapisz do trwałego magazynu
            if (typeof window.storageManager !== 'undefined') {
                window.storageManager.saveOptimizedRoute(
                    JSON.stringify(finalRoute),
                    JSON.stringify(optimizationResult)
                );
            } else {
                try {
                    sessionStorage.setItem('optimizedRouteData', JSON.stringify(finalRoute));
                    sessionStorage.setItem('optimizationResult', JSON.stringify(optimizationResult));
                } catch (e) {
                    // Ignoruj błędy sessionStorage
                }
            }

            // Aktualizuj tabelę (cicho)
            this.tableManager.updateTable(finalRoute);

            // Oblicz i wyświetl szacunkowe godziny przyjazdu
            let startTimeForDisplay = null;
            const startTimeSelectForDisplay = document.getElementById('start-time-select');
            if (startTimeSelectForDisplay && startTimeSelectForDisplay.value) {
                const [hours, minutes] = startTimeSelectForDisplay.value.split(':').map(Number);
                const today = new Date();
                startTimeForDisplay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
                if (startTimeForDisplay < today) {
                    startTimeForDisplay.setDate(startTimeForDisplay.getDate() + 1);
                }
            }

            this.tableManager.calculateAndDisplayArrivalTimes(
                finalRoute,
                optimizationResult.durations,
                optimizationResult.locationToIndexMap,
                optimizationResult.allLocations,
                startTimeForDisplay,
                stopTimeMinutes
            );

            // Załaduj statusy adresów (przywróć statusy "Odwiedzony")
            this.tableManager.loadAddressStatuses();

            // Przerysuj trasę na mapie
            const roadDistance = await this.mapManager.drawRoute(finalRoute);

            // Aktualizuj informacje o trasie
            this.displayRouteInfo(optimizationResult, roadDistance, finalRoute.length, stopTimeMinutes);

            console.log('[NavigationManager.silentOptimizeRoute] -> Cicha reoptymalizacja zakończona pomyślnie');

            // HISTORIA PRZEJAZDÓW - aktualizuj pointsSnapshot po cichej reoptymalizacji
            if (typeof Android !== 'undefined' && Android.rhUpdatePointsSnapshot) {
                try {
                    const updatedSnapshot = finalRoute
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
                    Android.rhUpdatePointsSnapshot(JSON.stringify({
                        silentOptimizeTs: Date.now(),
                        pointsSnapshot: updatedSnapshot
                    }));
                    console.log('[RideHistory] Zaktualizowano pointsSnapshot po cichej reoptymalizacji:', updatedSnapshot.length, 'punktów');
                } catch (e) {
                    console.error('[RideHistory] Błąd aktualizacji pointsSnapshot:', e);
                }
            }

            // Zakończ powiadomienie sukcesem
            this.showSnackbar('Trasa zaktualizowana!', 2000, 'success');

            // REKLAMA PO REOPTIMALIZACJI:
            // 1. Jeśli to była ręczna reoptymalizacja i reklama nie była wyświetlona PRZED - spróbuj PO
            if (!this.adShownBeforeReoptimization && this.pendingReoptimization) {
                if (typeof Android !== 'undefined' && Android.showAdPostOptimize) {
                    console.log('[NavigationManager] Reklama nie była gotowa wcześniej - próbuję wyświetlić po reoptymalizacji');
                    Android.showAdPostOptimize();
                }
            }
            // 2. Jeśli to automatyczna cicha optymalizacja - wyświetl reklamę PO
            else if (this.isAutoSilentOptimization) {
                if (typeof Android !== 'undefined' && Android.showAdPostOptimize) {
                    console.log('[NavigationManager] Automatyczna cicha optymalizacja zakończona - wyświetlam reklamę PO');
                    Android.showAdPostOptimize();
                }
            }

            // Wyczyść flagi
            this.adShownBeforeReoptimization = false;
            this.pendingReoptimization = false;
            this.isAutoSilentOptimization = false;

            return true;

        } catch (error) {
            console.error('[NavigationManager.proceedWithSilentOptimization] -> Błąd podczas cichej reoptymalizacji:', error);
            this.showSnackbar('Błąd optymalizacji trasy', 3000, 'error');

            // Wyczyść flagi również w przypadku błędu
            this.adShownBeforeReoptimization = false;
            this.pendingReoptimization = false;
            this.isAutoSilentOptimization = false;

            return false;
        }
    }

    clearNavigationData() {
        try {
            // Wyczyść dane optymalizacji
            this.optimizedRouteData = null;
            this.optimizationResult = null;

            // Wyczyść cache
            this._cachedHasHistory = undefined;
            this._lastCacheUpdate = 0;

            // Anuluj timer synchronizacji jeśli istnieje
            if (this._syncDebounceTimer) {
                clearTimeout(this._syncDebounceTimer);
                this._syncDebounceTimer = null;
            }

            // Wyczyść dane z sessionStorage
            sessionStorage.removeItem('optimizedRouteData');
            sessionStorage.removeItem('optimizationResult');
            sessionStorage.removeItem('currentRouteIndex');
            sessionStorage.removeItem('reverseRouteState');

            // Wyczyść dane z trwałego magazynu
            if (typeof window.storageManager !== 'undefined') {
                window.storageManager.clearOptimizedRoute();
            }

            // Wyczyść linię trasy na mapie
            if (this.mapManager && typeof this.mapManager.clearRoutePolyline === 'function') {
                this.mapManager.clearRoutePolyline();
            }

            // Ukryj elementy UI
            const routeInfo = document.getElementById('route-info');
            if (routeInfo) {
                routeInfo.style.display = 'none';
            }

            const startNavigationButton = document.getElementById('start-navigation');
            if (startNavigationButton) {
                startNavigationButton.style.display = 'none';
                startNavigationButton.innerHTML = 'Rozpocznij Nawigację';
                startNavigationButton.disabled = false;
                startNavigationButton.title = '';
            }

            // Ukryj kontener zapisywania trasy
            if (window.routeStorage && typeof window.routeStorage.hideSaveRouteContainer === 'function') {
                window.routeStorage.hideSaveRouteContainer();
            }

            // Ukryj szacunkowe godziny przyjazdu
            if (this.tableManager && typeof this.tableManager.hideAllArrivalTimes === 'function') {
                this.tableManager.hideAllArrivalTimes();
            }

            console.log('Dane nawigacji zostały wyczyszczone');
            return true;
        } catch (error) {
            console.error('Błąd podczas czyszczenia danych nawigacji:', error);
            return false;
        }
    }

    /**
     * Sprawdza czy jakikolwiek adres ma status Odwiedzony lub Pominięty
     */
    isReoptimizeNeeded() {
        try {
            if (typeof Android !== 'undefined' && Android.getAllAddressStatuses) {
                const statusesJson = Android.getAllAddressStatuses();
                if (statusesJson && statusesJson !== '{}' && statusesJson !== 'null') {
                    const statuses = JSON.parse(statusesJson);
                    for (const key in statuses) {
                        const status = statuses[key];
                        if (status === 'Odwiedzony' || status === 'Pominięty') {
                            return true;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[NavigationManager.isReoptimizeNeeded] -> Błąd:', e);
        }
        return false;
    }
}

// Eksport klasy globalnie
window.NavigationManager = NavigationManager;
console.log('NavigationManager załadowany');

// Automatyczne czyszczenie zostało usunięte dla lepszej wydajności
// Czyszczenie odbywa się teraz tylko na żądanie użytkownika
