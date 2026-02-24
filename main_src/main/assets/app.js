// Główny plik aplikacji - inicjalizacja wszystkich modułów
class OptiDrogApp {
    constructor() {
        this.mapManager = null;
        this.tableManager = null;
        this.addressSearchManager = null;
        this.navigationManager = null;
        this.statusChecker = null;
        this.initializationAttempts = 0;
        this.maxAttempts = 10;
        this.init();
    }

    // Inicjalizacja aplikacji
    init() {
        this.initializationAttempts++;
        console.log(`Próba inicjalizacji ${this.initializationAttempts}/${this.maxAttempts}`);

        // Sprawdź czy wszystkie klasy są dostępne
        if (typeof MapManager === 'undefined' ||
            typeof TableManager === 'undefined' ||
            typeof AddressSearchManager === 'undefined' ||
            typeof NavigationManager === 'undefined' ||
            typeof StatusChecker === 'undefined') {

            if (this.initializationAttempts < this.maxAttempts) {
                console.log('Nie wszystkie klasy są dostępne, ponowna próba za 150ms...');
                setTimeout(() => this.init(), 150); // ZOPTYMALIZOWANE: zmniejszone z 200ms do 150ms
                return;
            } else {
                console.error('Nie udało się załadować wszystkich klas po', this.maxAttempts, 'próbach');
                alert('Błąd inicjalizacji aplikacji. Odśwież stronę.');
                return;
            }
        }

        try {
            // Inicjalizacja modułów w odpowiedniej kolejności
            console.log('Inicjalizacja MapManager...');
            this.mapManager = new MapManager();

            console.log('Inicjalizacja TableManager...');
            this.tableManager = new TableManager(this.mapManager);

            console.log('Inicjalizacja AddressSearchManager...');
            this.addressSearchManager = new AddressSearchManager(this.mapManager, this.tableManager);

            console.log('Inicjalizacja NavigationManager...');
            this.navigationManager = new NavigationManager(this.mapManager, this.tableManager);

            // Udostępnij NavigationManager globalnie dla callback'ów z Androida
            window.navigationManager = this.navigationManager;

            // Aktualizuj tekst przycisku nawigacji przy starcie aplikacji
            if (this.navigationManager && typeof this.navigationManager.updateNavigationButtonText === 'function') {
                this.navigationManager.updateNavigationButtonText();
            }

            // Inicjalizacja FavoritesManager (po utworzeniu map/table/addressSearch)
            if (window.favoritesManager && typeof window.favoritesManager.init === 'function') {
                window.favoritesManager.init(this.mapManager, this.tableManager, this.addressSearchManager);
            }

            console.log('Inicjalizacja StatusChecker...');
            this.statusChecker = new StatusChecker();
            console.log('StatusChecker zainicjalizowany w OptiDrogApp');

            // Udostępnienie funkcji globalnie dla interfejsu Android
            window.updateMarker = (latitude, longitude) => {
                // Ukryj informację o pobieraniu pozycji gdy pozycja zostanie pobrana
                const locationStatus = document.getElementById('location-status');
                if (locationStatus) {
                    locationStatus.style.display = 'none';
                }

                if (this.mapManager) {
                    // Tylko aktualizuj marker, bez centrowania mapy
                    this.mapManager.updateMarker(latitude, longitude);
                    console.log('Marker zaktualizowany bez centrowania mapy');
                } else {
                    console.error('MapManager nie jest zainicjalizowany');
                }
            };

            // Nowa funkcja do aktualizacji markera bez centrowania mapy
            window.updateMarkerWithoutCentering = (latitude, longitude) => {
                // Ukryj informację o pobieraniu pozycji gdy pozycja zostanie pobrana
                const locationStatus = document.getElementById('location-status');
                if (locationStatus) {
                    locationStatus.style.display = 'none';
                }

                if (this.mapManager) {
                    // Tylko aktualizuj dane pozycji bez wywoływania updateMarker
                    this.mapManager.currentLat = latitude;
                    this.mapManager.currentLng = longitude;

                    // Aktualizuj pozycję markera bez centrowania mapy
                    if (this.mapManager.currentLocationMarker) {
                        const newLatLng = new L.LatLng(latitude, longitude);
                        this.mapManager.currentLocationMarker.setLatLng(newLatLng);
                        console.log('Marker zaktualizowany bez centrowania mapy (updateMarkerWithoutCentering)');
                    } else {
                        // Jeśli marker nie istnieje, utwórz go
                        const newLatLng = new L.LatLng(latitude, longitude);

                        // Utwórz niestandardowy znacznik aktualnej pozycji
                        const currentLocationIcon = L.divIcon({
                            html: '<div class="current-location-marker"></div>',
                            className: 'custom-current-location',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10],
                            popupAnchor: [0, -10]
                        });

                        this.mapManager.currentLocationMarker = L.marker(newLatLng, { icon: currentLocationIcon })
                            .addTo(this.mapManager.map)
                            .bindPopup('Twoja aktualna pozycja');
                        console.log('Utworzono nowy marker bez centrowania mapy');
                    }
                } else {
                    console.error('MapManager nie jest zainicjalizowany');
                }
            };

            // Funkcja do wyświetlania informacji o pobieraniu pozycji
            window.showLocationStatus = () => {
                const locationStatus = document.getElementById('location-status');
                if (locationStatus) {
                    locationStatus.style.display = 'block';
                }
            };

            // Funkcja do bezpośredniej aktualizacji pozycji z Android
            window.updateCurrentLocation = (latitude, longitude) => {
                console.log('updateCurrentLocation wywołana z Android:', latitude, longitude);

                if (this.mapManager) {
                    // Aktualizuj pozycję w MapManager
                    this.mapManager.currentLat = latitude;
                    this.mapManager.currentLng = longitude;

                    // Aktualizuj marker na mapie
                    if (this.mapManager.currentLocationMarker) {
                        const newLatLng = new L.LatLng(latitude, longitude);
                        this.mapManager.currentLocationMarker.setLatLng(newLatLng);
                        console.log('Marker zaktualizowany przez updateCurrentLocation');
                    } else {
                        // Utwórz nowy marker jeśli nie istnieje
                        const newLatLng = new L.LatLng(latitude, longitude);

                        // Utwórz niestandardowy znacznik aktualnej pozycji
                        const currentLocationIcon = L.divIcon({
                            html: '<div class="current-location-marker"></div>',
                            className: 'custom-current-location',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10],
                            popupAnchor: [0, -10]
                        });

                        this.mapManager.currentLocationMarker = L.marker(newLatLng, { icon: currentLocationIcon })
                            .addTo(this.mapManager.map)
                            .bindPopup('Twoja aktualna pozycja');
                        console.log('Utworzono nowy marker przez updateCurrentLocation');
                    }

                    // Ukryj status pobierania pozycji
                    const locationStatus = document.getElementById('location-status');
                    if (locationStatus) {
                        locationStatus.style.display = 'none';
                    }
                } else {
                    console.error('MapManager nie jest dostępny w updateCurrentLocation');
                }
            };

            // Automatycznie pokaż informację o pobieraniu pozycji przy starcie
            // TYLKO jeśli nie ma pozycji i status nie jest już ukryty
            setTimeout(() => {
                const locationStatus = document.getElementById('location-status');
                if (locationStatus && this.mapManager &&
                    (this.mapManager.currentLat === null || this.mapManager.currentLng === null) &&
                    locationStatus.style.display !== 'none') {
                    locationStatus.style.display = 'block';
                }
            }, 1000);

            // Wczytaj zapisaną trasę z trwałego magazynu po inicjalizacji
            this.loadSavedRoute();

            console.log('OptiDrog App zainicjalizowana pomyślnie');
            this.isInitialized = true;

            // Sprawdź czy pokazać przycisk resetowania po inicjalizacji
            setTimeout(() => {
                if (this.tableManager && typeof this.tableManager.checkForColoredAddresses === 'function') {
                    this.tableManager.checkForColoredAddresses();
                    console.log('Sprawdzono statusy adresów po inicjalizacji');
                }
            }, 500);

        } catch (error) {
            console.error('Błąd podczas inicjalizacji:', error);
            alert('Wystąpił błąd podczas inicjalizacji aplikacji: ' + error.message);
        }
    }

    // Gettery dla dostępu do modułów
    getNavigationManager() {
        return this.navigationManager;
    }

    getTableManager() {
        return this.tableManager;
    }

    getMapManager() {
        return this.mapManager;
    }

    getAddressSearchManager() {
        return this.addressSearchManager;
    }

    getStatusChecker() {
        return this.statusChecker;
    }

    getUpdateTableWithExistingAddresses() {
        return this.updateTableWithExistingAddresses;
    }

    // Metoda do wczytywania zapisanej trasy z trwałego magazynu
    loadSavedRoute() {
        // WAŻNE: Sprawdź czy jest trasa do wczytania z Zapisanych Tras
        // Jeśli tak, NIE wczytuj starej optymalizacji - nowa trasa ją nadpisze
        const loadRouteId = sessionStorage.getItem('loadRouteId');
        if (loadRouteId) {
            console.log('[OptiDrogApp.loadSavedRoute] Wykryto loadRouteId, pomijam wczytywanie starej trasy');
            return;
        }

        // Sprawdź czy StorageManager jest dostępny
        if (typeof window.storageManager === 'undefined') {
            console.log('StorageManager nie jest jeszcze dostępny, pomijam wczytywanie trasy');
            return;
        }

        try {
            const savedData = window.storageManager.loadOptimizedRoute();

            if (savedData.optimizedRouteData && savedData.optimizationResult) {
                const routeData = JSON.parse(savedData.optimizedRouteData);
                const optimizationResult = JSON.parse(savedData.optimizationResult);

                console.log('Znaleziono zapisaną trasę w trwałym magazynie:', routeData.length, 'punktów');

                // Opóźnij wczytanie aby upewnić się, że wszystkie komponenty są gotowe
                setTimeout(() => {
                    this.restoreOptimizedRoute({ route: routeData, optimizationResult: optimizationResult });
                }, 500);
            } else {
                console.log('Brak zapisanej trasy w trwałym magazynie');
            }
        } catch (error) {
            console.error('Błąd podczas wczytywania zapisanej trasy:', error);
        }
    }

    // Metoda do przywracania zoptymalizowanej trasy
    restoreOptimizedRoute(savedRoute) {
        try {
            console.log('Przywracanie zoptymalizowanej trasy...');

            // Sprawdź czy trasa już jest załadowana przez NavigationManager.loadOptimizationFromSession()
            const addressesToAdd = savedRoute.route.filter(point => point.address !== 'Aktualna pozycja');
            const alreadyLoaded = this.tableManager &&
                this.tableManager.addresses.length === addressesToAdd.length &&
                addressesToAdd.every(point => {
                    const key = typeof generateAddressKey === 'function'
                        ? generateAddressKey(point.address, point.lat, point.lng)
                        : (point.id || `${point.address}_${point.lat}_${point.lng}`);
                    return this.tableManager.addressSet.has(key);
                });

            if (alreadyLoaded) {
                console.log('Trasa już załadowana przez NavigationManager, tylko aktualizuję UI');
                // Tylko pokaż przyciski pozycji i zaktualizuj przeciąganie
                if (this.tableManager) {
                    this.tableManager.showPositionNumbers();
                    this.tableManager.updateRowsDraggable();
                }
            } else {
                // Wyczyść obecne dane i załaduj od nowa
                if (this.tableManager) {
                    this.tableManager.clearAllAddresses();
                }

                addressesToAdd.forEach((point, index) => {
                    if (this.tableManager) {
                        console.log(`Dodaję adres ${index + 1}/${addressesToAdd.length}:`, point.address);
                        this.tableManager.addAddressToTable(
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

                // Pokaż przyciski pozycji po dodaniu adresów
                if (this.tableManager) {
                    this.tableManager.showPositionNumbers();
                    this.tableManager.updateRowsDraggable();
                }
            }

            // Przywróć dane optymalizacji do trwałego magazynu
            if (savedRoute.optimizationResult) {
                // Zapisz do trwałego magazynu za pomocą StorageManager
                if (typeof window.storageManager !== 'undefined') {
                    window.storageManager.saveOptimizedRoute(
                        JSON.stringify(savedRoute.route),
                        JSON.stringify(savedRoute.optimizationResult)
                    );
                } else {
                    // Fallback do sessionStorage jeśli StorageManager nie jest dostępny
                    sessionStorage.setItem('optimizedRouteData', JSON.stringify(savedRoute.route));
                    sessionStorage.setItem('optimizationResult', JSON.stringify(savedRoute.optimizationResult));
                }
            }

            // Przywróć stan optymalizacji w NavigationManager
            if (this.navigationManager) {
                this.navigationManager.optimizedRouteData = savedRoute.route;
                this.navigationManager.optimizationResult = savedRoute.optimizationResult;

                // Przywróć wartości selektorów start-point i end-point (z opóźnieniem aby upewnić się że selektory są gotowe)
                setTimeout(() => {
                    if (typeof this.navigationManager.restoreRouteSelectors === 'function') {
                        this.navigationManager.restoreRouteSelectors();
                    }
                }, 100);

                // Narysuj trasę na mapie
                if (this.mapManager && typeof this.mapManager.drawRoute === 'function') {
                    this.mapManager.drawRoute(savedRoute.route);
                }

                // Wyświetl informacje o trasie
                if (savedRoute.optimizationResult) {
                    // Pobierz aktualny czas stopu z interfejsu
                    let stopTimeMinutes = 5; // Wartość domyślna
                    const stopTimeSelect = document.getElementById('stop-time-select');
                    if (stopTimeSelect) {
                        const parsedValue = parseInt(stopTimeSelect.value, 10);
                        stopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
                    }
                    this.navigationManager.displayRouteInfo(
                        savedRoute.optimizationResult,
                        savedRoute.optimizationResult.optimizedDistance,
                        savedRoute.route.length,
                        savedRoute.stopTimeMinutes || 0 // Użyj zapisanego czasu stopu lub 0 jeśli niedostępny
                    );
                }

                // Pokaż przycisk nawigacji
                const startNavigationButton = document.getElementById('start-navigation');
                if (startNavigationButton && savedRoute.route.length >= 2) {
                    startNavigationButton.style.display = 'inline-block';
                    // Aktualizuj tekst przycisku nawigacji
                    if (typeof this.navigationManager.updateNavigationButtonText === 'function') {
                        this.navigationManager.updateNavigationButtonText();
                    }
                }

                // Pokaż kontener zapisywania trasy
                if (window.routeStorage && typeof window.routeStorage.showSaveRouteContainer === 'function') {
                    window.routeStorage.showSaveRouteContainer();
                }
            }

            console.log('Zoptymalizowana trasa została przywrócona z trwałego magazynu');

        } catch (error) {
            console.error('Błąd podczas przywracania zoptymalizowanej trasy:', error);
        }
    }
}

// Inicjalizacja aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', function () {
    // ZOPTYMALIZOWANE: Zmniejszone opóźnienie z 100ms do 50ms
    setTimeout(() => {
        window.optiDrogApp = new OptiDrogApp();
        // window.optiDrogApp.init(); // USUNIĘTO: init() jest już wywoływane w konstruktorze

        // Dodaj obsługę rozwijanego menu aparatu/galerii
        const cameraButton = document.getElementById('camera-button');
        const cameraDropdown = document.getElementById('camera-dropdown');
        const cameraDropdownMenu = document.getElementById('camera-dropdown-menu');
        const cameraCaptureOption = document.getElementById('camera-capture-option');
        const cameraGalleryOption = document.getElementById('camera-gallery-option');

        // Obsługa kliknięcia przycisku aparatu - otwórz/zamknij menu
        if (cameraButton && cameraDropdownMenu) {
            cameraButton.addEventListener('click', function (e) {
                e.stopPropagation();
                cameraDropdownMenu.classList.toggle('show');
            });
        }

        // Obsługa opcji "Zrób zdjęcie"
        if (cameraCaptureOption) {
            cameraCaptureOption.addEventListener('click', function (e) {
                e.stopPropagation();
                cameraDropdownMenu.classList.remove('show');

                console.log('Kliknięto opcję "Zrób zdjęcie"');
                if (window.optiDrogApp && window.optiDrogApp.getAddressSearchManager) {
                    const addressSearchManager = window.optiDrogApp.getAddressSearchManager();
                    if (addressSearchManager && typeof addressSearchManager.checkCameraAvailability === 'function') {
                        const availability = addressSearchManager.checkCameraAvailability();
                        console.log('Dostępność aparatu:', availability);

                        if (availability === 'available') {
                            // Uruchom aparat
                            console.log('Aparat jest dostępny - uruchamianie podglądu');
                            if (typeof Android !== 'undefined' && Android.openCamera) {
                                Android.openCamera();
                            } else {
                                console.error('Interfejs Android.openCamera nie jest dostępny');
                                addressSearchManager.showCameraPermissionError(
                                    'Nie można uruchomić aparatu - interfejs nie jest dostępny.',
                                    'not_available'
                                );
                            }
                        } else if (availability === 'no_permission') {
                            // Żądaj uprawnień
                            addressSearchManager.requestCameraPermission();
                        } else {
                            // Pokaż informację o niedostępności
                            addressSearchManager.handleCameraPermissionResult(availability);
                        }
                    }
                } else {
                    console.error('AddressSearchManager nie jest dostępny');
                }
            });
        }

        // Obsługa opcji "Wybierz z galerii"
        if (cameraGalleryOption) {
            cameraGalleryOption.addEventListener('click', function (e) {
                e.stopPropagation();
                cameraDropdownMenu.classList.remove('show');

                console.log('Kliknięto opcję "Wybierz z galerii"');
                if (typeof Android !== 'undefined' && Android.openGallery) {
                    Android.openGallery();
                } else {
                    console.error('Interfejs Android.openGallery nie jest dostępny');
                    alert('Nie można otworzyć galerii - interfejs nie jest dostępny.');
                }
            });
        }

        // Zamknij menu przy kliknięciu poza nim
        document.addEventListener('click', function (e) {
            if (cameraDropdown && cameraDropdownMenu && !cameraDropdown.contains(e.target)) {
                cameraDropdownMenu.classList.remove('show');
            }
        });

        // Sprawdź czy ma być wczytana zapisana trasa
        const loadRouteId = sessionStorage.getItem('loadRouteId');
        if (loadRouteId) {
            sessionStorage.removeItem('loadRouteId');
            console.log('Znaleziono trasę do wczytania:', loadRouteId);
            // ZOPTYMALIZOWANE: Zmniejszone opóźnienie z 1000ms do 500ms
            setTimeout(() => {
                waitForAppInitialization(() => {
                    loadSavedRoute(loadRouteId);
                });
            }, 500);
        }
    }, 50);
});

// Funkcja oczekująca na pełną inicjalizację aplikacji - ZOPTYMALIZOWANA
function waitForAppInitialization(callback, maxAttempts = 10) {
    let attempts = 0;

    function checkInitialization() {
        attempts++;
        console.log(`Sprawdzanie inicjalizacji (próba ${attempts}/${maxAttempts})`);

        // Sprawdź czy wszystkie wymagane komponenty są dostępne
        if (window.optiDrogApp &&
            window.optiDrogApp.tableManager &&
            window.routeStorage &&
            typeof window.optiDrogApp.tableManager.clearAllAddresses === 'function' &&
            typeof window.optiDrogApp.tableManager.addAddressToTable === 'function') {

            console.log('Aplikacja jest gotowa do wczytania trasy');
            callback();
            return;
        }

        if (attempts < maxAttempts) {
            console.log('Aplikacja nie jest jeszcze gotowa, czekam...');
            setTimeout(checkInitialization, 150); // Zmniejszone z 200ms do 150ms
        } else {
            console.error('Przekroczono maksymalną liczbę prób inicjalizacji');
            // Spróbuj wczytać trasę mimo wszystko
            callback();
        }
    }

    checkInitialization();
}

// Funkcja do wczytywania zapisanej trasy

// Funkcja do wczytania zapisanej trasy (wywoływana z globalnego scope)
function loadSavedRoute(routeId) {
    if (!routeId) {
        console.error('Próba wczytania trasy bez ID');
        return;
    }

    // Dodatkowe zabezpieczenie: sprawdź czy aplikacja jest w pełni zainicjalizowana
    // mimo wcześniejszego oczekiwania w waitForAppInitialization
    if (!window.optiDrogApp || !window.optiDrogApp.isInitialized) {
        console.warn('Aplikacja nie jest jeszcze w pełni gotowa, ponawiam próbę za 500ms...');
        setTimeout(() => loadSavedRoute(routeId), 500);
        return;
    }

    console.log(`[loadSavedRoute] Rozpoczynam wczytywanie trasy ID: ${routeId}`);

    // Użyj RouteStorage do wczytania trasy - centralizacja logiki
    if (window.routeStorage) {
        // Opóźnienie dla pewności, że UI jest gotowe (np. po przeładowaniu strony)
        setTimeout(() => {
            try {
                // Wczytaj trasę - loadRoute teraz zwróci true/false synchronicznie
                const success = window.routeStorage.loadRoute(routeId);
                if (success) {
                    console.log(`[loadSavedRoute] Trasa ${routeId} została pomyślnie wczytana`);

                    // Pokaż komunikat użytkownikowi
                    if (typeof Android !== 'undefined' && Android.showToast) {
                        Android.showToast('Trasa została wczytana');
                    }
                } else {
                    console.error(`[loadSavedRoute] Nie udało się wczytać trasy ${routeId}`);
                    if (typeof Android !== 'undefined' && Android.showToast) {
                        Android.showToast('Błąd podczas wczytywania trasy');
                    }
                }
            } catch (error) {
                console.error('[loadSavedRoute] Błąd podczas wczytywania trasy:', error);
                if (typeof Android !== 'undefined' && Android.showToast) {
                    Android.showToast('Błąd podczas wczytywania trasy');
                }
            }
        }, 500);
    } else {
        console.error('[loadSavedRoute] RouteStorage nie jest dostępny!');
        // Spróbuj ponownie za chwilę, jeśli moduł się jeszcze nie załadował
        setTimeout(() => loadSavedRoute(routeId), 1000);
    }
}


// Nowa funkcja do obsługi wyników OCR z Androida (ML Kit)
window.handleOcrResults = function (textLines) {
    console.log('Odebrano wyniki OCR z Androida:', textLines);

    // Usuń informację o analizie (jeśli istnieje)
    const analysisDiv = document.querySelector('.camera-analysis');
    if (analysisDiv) {
        analysisDiv.remove();
    }

    if (!textLines || textLines.length === 0) {
        showCameraAnalysisError('Nie udało się rozpoznać żadnego tekstu na zdjęciu.');
        return;
    }

    // Przetwarzaj rozpoznane linie
    processOcrLines(textLines);
};

// Funkcja do przetwarzania linii tekstu z OCR
function processOcrLines(lines) {
    try {
        if (!window.optiDrogApp || !window.optiDrogApp.getAddressSearchManager) {
            console.error('OptiDrogApp lub AddressSearchManager nie są dostępne');
            return;
        }

        const addressSearchManager = window.optiDrogApp.getAddressSearchManager();

        // Inteligentne filtrowanie adresów z surowego tekstu OCR
        // Szukamy linii, które:
        // 1. Zawierają numer domu (cyfra + opcjonalnie litera)
        // 2. Zawierają kod pocztowy (XX-XXX)
        // 3. Są dłuższe niż 5 znaków i nie są typowym szumem (np. "Battery", "PM", "AM")

        const potentialAddresses = lines
            .map(line => line.trim())
            .filter(line => {
                // Odfiltruj typowy szum techniczny/UI
                const noise = /^(am|pm|battery|signal|wi-fi|vol|%|\d{1,2}:\d{2})$/i;
                if (noise.test(line)) return false;

                // Szukamy wzorców typowych dla adresów
                const hasDigit = /\d/.test(line);
                const isLongEnough = line.length > 5;
                const hasPostalCode = /\d{2}-\d{3}/.test(line);
                const hasStreetKeywords = /(ul\.|al\.|os\.|pl\.|street|st\.|road|rd\.|ave|avenue)/i.test(line);

                return (hasDigit && isLongEnough) || hasPostalCode || hasStreetKeywords;
            });

        if (potentialAddresses.length === 0) {
            showCameraAnalysisError('Nie znaleziono tekstu wyglądającego na adresy.');
            return;
        }

        console.log(`Wykryto ${potentialAddresses.length} potencjalnych adresów:`, potentialAddresses);

        // Pokaż podsumowanie rozpoznanych adresów (używamy istniejącej funkcji summary)
        showRecognizedAddressesSummary(potentialAddresses, addressSearchManager);

    } catch (error) {
        console.error('Błąd podczas przetwarzania linii OCR:', error);
        showCameraAnalysisError('Błąd podczas przetwarzania wyników OCR: ' + error.message);
    }
}

// Funkcja do obsługi zdjęcia z aparatu - teraz inicjuje tylko UI, Android zajmie się OCR
window.handleCameraPhoto = function (base64Image) {
    console.log('Odebrano zdjęcie z aparatu - oczekiwanie na wyniki OCR');
    // UI informacyjny
    showOcrLoading('Analizuję zdjęcie (OCR)...');
};

// Funkcja do obsługi zdjęcia z galerii
window.handleGalleryPhoto = function (base64Image) {
    console.log('Odebrano zdjęcie z galerii - przesyłanie do OCR na urządzeniu');

    showOcrLoading('Analizuję zdjęcie z galerii (OCR)...');

    // Wysyłamy zdjęcie z powrotem do Androida, aby tam ML Kit przetworzył je lokalnie
    if (typeof Android !== 'undefined' && Android.processImageForOcr) {
        Android.processImageForOcr(base64Image);
    } else {
        // Fallback: Jeśli nie mamy mostka, informujemy o błędzie (nowa wersja aplikacji go wymaga)
        console.error('Interfejs Android.processImageForOcr nie jest dostępny');

        // Tymczasowy fallback do starego API jeśli jeszcze istnieje (ale użytkownik kazał usunąć AI)
        // analyzeImageWithAllAI(base64Image, window.optiDrogApp.getAddressSearchManager(), document.querySelector('.camera-analysis'));

        showCameraAnalysisError('Twoja wersja aplikacji nie wspiera jeszcze lokalnego OCR dla galerii.');
    }
};

// Pomocnicza funkcja do wyświetlania ładowania OCR
function showOcrLoading(message) {
    // Usuń stare jeśli istnieje
    const existing = document.querySelector('.camera-analysis');
    if (existing) existing.remove();

    const analysisDiv = document.createElement('div');
    analysisDiv.className = 'camera-analysis';
    analysisDiv.innerHTML = `
        <div class="analysis-content">
            <div class="analysis-icon">⚡</div>
            <div class="analysis-message">${message}</div>
            <div class="analysis-spinner">
                <div class="spinner"></div>
            </div>
        </div>
    `;

    // Style (skopiowane z oryginalnego handleCameraPhoto dla spójności)
    analysisDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(76, 175, 80, 0.95); /* Zmieniony na zielony dla OCR */
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 10000;
        min-width: 300px;
        text-align: center;
        font-size: 16px;
        backdrop-filter: blur(10px);
    `;

    // Dodaj animację jeśli nie ma
    if (!document.getElementById('pulseStyle')) {
        const pulseStyle = document.createElement('style');
        pulseStyle.id = 'pulseStyle';
        pulseStyle.innerHTML = `
            @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
            .spinner { border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top: 3px solid white; width: 30px; height: 30px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `;
        document.head.appendChild(pulseStyle);
    }

    document.body.appendChild(analysisDiv);
}


// Funkcja do przetwarzania rozpoznanych adresów
async function processRecognizedAddresses(aiResponse, addressSearchManager) {
    try {
        // Podziel odpowiedź na linie i oczyść z formatowania
        const addresses = aiResponse.split('\n')
            .map(line => line.replace(/^[-*•\d.]+\s*/, '').trim())
            .filter(line => line.length > 0);

        if (addresses.length === 0) {
            showCameraAnalysisError('Nie znaleziono żadnych adresów na zdjęciu.');
            return;
        }

        console.log(`Rozpoznano ${addresses.length} adresów:`, addresses);

        // Pokaż podsumowanie rozpoznanych adresów
        showRecognizedAddressesSummary(addresses, addressSearchManager);

    } catch (error) {
        console.error('Błąd podczas przetwarzania rozpoznanych adresów:', error);
        showCameraAnalysisError('Błąd podczas przetwarzania adresów: ' + error.message);
    }
}

// Funkcja do wyświetlania podsumowania rozpoznanych adresów
function showRecognizedAddressesSummary(addresses, addressSearchManager) {
    // Tworzymy backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'recognized-addresses-backdrop';

    // Kopia adresów do manipulacji
    let currentAddresses = [...addresses];

    const updateModalContent = () => {
        const listContainer = backdrop.nextElementSibling.querySelector('.recognized-addresses-list');
        const countBadge = backdrop.nextElementSibling.querySelector('.recognized-addresses-count');
        const summaryText = backdrop.nextElementSibling.querySelector('.addresses-summary');
        const footerActions = backdrop.nextElementSibling.querySelector('.addresses-actions');

        if (currentAddresses.length === 0) {
            listContainer.innerHTML = `
                <div class="no-addresses-found">
                    <div class="no-addresses-found-icon">🔍</div>
                    <div class="no-addresses-found-text">Brak adresów na liście</div>
                </div>
            `;
            if (countBadge) countBadge.textContent = '0';
            if (summaryText) summaryText.textContent = 'Brak adresów do dodania';
            // Ukryj przycisk "Dodaj wszystkie" jeśli lista jest pusta
            const addBtn = footerActions.querySelector('.primary');
            if (addBtn) addBtn.style.display = 'none';
        } else {
            listContainer.innerHTML = currentAddresses.map((address, index) => `
                <div class="recognized-address-item" data-index="${index}">
                    <div class="address-status-icon success">${index + 1}</div>
                    <div class="address-content">
                        <div class="address-text">${address}</div>
                    </div>
                    <button class="recognized-address-remove" onclick="removeRecognizedAddress(${index})" title="Usuń ten adres">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `).join('');

            if (countBadge) countBadge.textContent = currentAddresses.length;
            if (summaryText) summaryText.textContent = `Znaleziono ${currentAddresses.length} adresów`;

            const addBtn = footerActions.querySelector('.primary');
            if (addBtn) {
                addBtn.style.display = 'flex';
                // Aktualizujemy onclick dla przycisku "Dodaj wszystkie"
                addBtn.onclick = () => {
                    closeRecognizedAddressesModal();
                    window.addRecognizedAddresses(currentAddresses);
                };
            }
        }
    };

    window.removeRecognizedAddress = function (index) {
        currentAddresses.splice(index, 1);
        updateModalContent();
    };

    let html = '<div class="recognized-addresses-container">';
    html += '<div class="recognized-addresses-header">';
    html += '<h3 class="recognized-addresses-title">Rozpoznane adresy</h3>';
    html += '<div class="recognized-addresses-count">' + addresses.length + '</div>';
    html += '</div>';

    html += '<div class="recognized-addresses-list">';
    // Początkowe renderowanie zostanie wykonane przez updateModalContent, ale tu dajemy placeholder
    html += '</div>';

    html += '<div class="recognized-addresses-footer">';
    html += '<div class="addresses-summary success">Znaleziono ' + addresses.length + ' adresów</div>';
    html += '<div class="addresses-actions">';
    html += '<button class="addresses-action-btn primary">';
    html += '<span>➕</span>Dodaj wszystkie';
    html += '</button>';
    html += '<button class="addresses-action-btn secondary" onclick="closeRecognizedAddressesModal()">';
    html += '<span>✖</span>Zamknij';
    html += '</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    // Wstawiamy HTML na stronę
    const container = document.createElement('div');
    container.innerHTML = html;
    const modal = container.firstElementChild;

    // Dodajemy backdrop i modal do strony
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    // Wywołujemy pierwsze renderowanie treści
    updateModalContent();

    // Pokazujemy backdrop z animacją
    setTimeout(() => {
        backdrop.classList.add('visible');
    }, 10);

    // Dodajemy funkcję zamykającą modal (czyści window.removeRecognizedAddress i usuwa elementy)
    window.closeRecognizedAddressesModal = function () {
        if (backdrop) backdrop.remove();
        if (modal) modal.remove();
        if (window.removeRecognizedAddress) delete window.removeRecognizedAddress;
    };
}

// Funkcja do dodawania rozpoznanych adresów do aplikacji
window.addRecognizedAddresses = function (addresses) {
    console.log('Dodawanie rozpoznanych adresów do aplikacji (indywidualnie):', addresses);

    if (!window.optiDrogApp || !window.optiDrogApp.getAddressSearchManager) {
        console.error('OptiDrogApp lub AddressSearchManager nie są dostępne');
        return;
    }

    const addressSearchManager = window.optiDrogApp.getAddressSearchManager();

    // Rozpocznij indywidualne dodawanie adresów
    addAddressesIndividually(addresses, addressSearchManager);
};

// Funkcja do indywidualnego dodawania adresów
async function addAddressesIndividually(addresses, addressSearchManager) {
    console.log(`Rozpoczynam indywidualne dodawanie ${addresses.length} adresów`);

    // Pokaż postęp dodawania
    const progressDiv = showAddressProcessingProgress(addresses.length);

    let successCount = 0;
    let failedAddresses = [];

    // Pobierz wartości godzin z pól formularza (będą używane dla wszystkich adresów)
    const timeFromInput = document.getElementById('address-time-from');
    const timeToInput = document.getElementById('address-time-to');
    const timeFrom = timeFromInput ? timeFromInput.value : '';
    const timeTo = timeToInput ? timeToInput.value : '';

    // Przetwarzaj każdy adres indywidualnie
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i].trim();

        if (!address) {
            failedAddresses.push(`Pusty adres ${i + 1}`);
            continue;
        }

        try {
            // Aktualizuj postęp
            updateAddressProcessingProgress(progressDiv, `Przetwarzam: ${address}`, i, addresses.length);

            console.log(`Przetwarzam adres ${i + 1}/${addresses.length}: ${address}`);

            // Wyszukaj adres indywidualnie
            const result = await addressSearchManager.searchSingleAddressForBatch(address);

            if (result) {
                // Dodaj znaleziony adres do tabeli
                const mapManager = window.optiDrogApp.getMapManager();
                const tableManager = window.optiDrogApp.getTableManager();

                mapManager.addMarker(result.lat, result.lon, result.address);
                tableManager.addAddressToTable(
                    result.address,
                    result.lat,
                    result.lon,
                    false,
                    false,
                    timeFrom,
                    timeTo,
                    null,
                    '', // Nie ustawiaj automatycznie typu dostawy
                    false
                );

                successCount++;
                console.log(`Pomyślnie dodano adres: ${result.address}`);
            } else {
                failedAddresses.push(address);
                console.warn(`Nie znaleziono adresu: ${address}`);
            }

            // Krótka pauza między zapytaniami, aby nie przeciążyć serwera
            if (i < addresses.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }

        } catch (error) {
            console.error(`Błąd podczas przetwarzania adresu ${address}:`, error);
            failedAddresses.push(address);
        }
    }

    // Ukryj postęp i pokaż podsumowanie
    hideAddressProcessingProgress(progressDiv);
    showAddressProcessingSummary(successCount, failedAddresses);

    // Resetuj pola godzin po dodaniu adresów
    if (timeFromInput) timeFromInput.value = '';
    if (timeToInput) timeToInput.value = '';

    console.log(`Zakończono przetwarzanie: ${successCount} sukcesów, ${failedAddresses.length} błędów`);
}

// Funkcja do pokazywania postępu przetwarzania adresów
function showAddressProcessingProgress(totalAddresses) {
    // Tworzymy backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'recognized-addresses-backdrop';

    // Tworzymy kontener modalu
    const modalDiv = document.createElement('div');
    modalDiv.className = 'recognized-addresses-container';
    modalDiv.id = 'address-processing-progress';

    let html = '<div class="recognized-addresses-header">';
    html += '<h3 class="recognized-addresses-title">Dodawanie adresów z aparatu</h3>';
    html += '</div>';
    html += '<div class="address-processing-body">';
    html += '<div class="address-progress-bar-container">';
    html += '<div class="address-progress-bar" id="progress-bar"></div>';
    html += '</div>';
    html += '<div class="address-progress-text" id="progress-message">Przetwarzanie adresów...</div>';
    html += '<div class="address-progress-text" id="progress-counter">0/' + totalAddresses + ' (0%)</div>';
    html += '</div>';

    modalDiv.innerHTML = html;

    // Dodajemy funkcję zamykającą modal
    window.closeAddressProcessingModal = function () {
        const modal = document.querySelector('#address-processing-progress');
        // Usuń wszystkie backdropy
        const backdrops = document.querySelectorAll('.recognized-addresses-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        if (modal) modal.remove();
        if (window.closeAddressProcessingModal) delete window.closeAddressProcessingModal;
    };

    // Dodajemy backdrop i modal do strony
    document.body.appendChild(backdrop);
    document.body.appendChild(modalDiv);

    // Pokazujemy backdrop z animacją
    setTimeout(() => {
        backdrop.classList.add('visible');
    }, 10);

    return modalDiv;
}

// Funkcja do aktualizacji postępu przetwarzania adresów
function updateAddressProcessingProgress(progressDiv, message, current, total) {
    if (!progressDiv || !progressDiv.parentElement) return;

    const messageEl = progressDiv.querySelector('#progress-message');
    const progressBar = progressDiv.querySelector('#progress-bar');
    const counter = progressDiv.querySelector('#progress-counter');

    if (messageEl) messageEl.textContent = message;
    if (progressBar) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        progressBar.style.width = `${percentage}%`;
    }
    if (counter) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        counter.textContent = `${current}/${total} (${percentage}%)`;
    }
}

// Funkcja do ukrywania postępu przetwarzania adresów
function hideAddressProcessingProgress(progressDiv) {
    if (progressDiv && progressDiv.parentElement) {
        progressDiv.remove();
    }
}

// Funkcja do pokazywania podsumowania przetwarzania adresów
function showAddressProcessingSummary(successCount, failedAddresses) {
    // Tworzymy backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'recognized-addresses-backdrop';

    let html = '<div class="recognized-addresses-container">';
    html += '<div class="recognized-addresses-header">';
    html += '<h3 class="recognized-addresses-title">Podsumowanie dodawania adresów</h3>';
    html += '</div>';

    if (failedAddresses.length === 0) {
        html += '<div class="recognized-addresses-list">';
        html += '<div class="recognized-address-item">';
        html += '<div class="address-status-icon success">✓</div>';
        html += '<div class="address-content">';
        html += '<div class="address-text">Pomyślnie dodano ' + successCount + ' adresów</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="recognized-addresses-footer">';
        html += '<div class="addresses-summary success">Wszystkie adresy zostały dodane</div>';
        html += '<div class="addresses-actions">';
        html += '<button class="addresses-action-btn secondary" onclick="closeAddressProcessingSummaryModal()">';
        html += '<span>✖</span>Zamknij';
        html += '</button>';
        html += '</div>';
        html += '</div>';
    } else {
        html += '<div class="recognized-addresses-list">';

        // Dodaj informacje o sukcesach
        if (successCount > 0) {
            html += '<div class="recognized-address-item">';
            html += '<div class="address-status-icon success">✓</div>';
            html += '<div class="address-content">';
            html += '<div class="address-text">Pomyślnie dodano ' + successCount + ' adresów</div>';
            html += '</div>';
            html += '</div>';
        }

        // Dodaj informacje o błędach
        html += '<div class="recognized-address-item">';
        html += '<div class="address-status-icon error">✗</div>';
        html += '<div class="address-content">';
        html += '<div class="address-text">Nie znaleziono ' + failedAddresses.length + ' adresów:</div>';
        html += '<div class="address-error">';

        // Wyświetl maksymalnie 5 błędnych adresów
        const maxErrors = Math.min(failedAddresses.length, 5);
        for (let i = 0; i < maxErrors; i++) {
            html += '• ' + failedAddresses[i] + '<br>';
        }

        if (failedAddresses.length > 5) {
            html += '• i ' + (failedAddresses.length - 5) + ' więcej...';
        }

        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="recognized-addresses-footer">';
        html += '<div class="addresses-summary partial">Dodano ' + successCount + ' z ' + (successCount + failedAddresses.length) + ' adresów</div>';
        html += '<div class="addresses-actions">';
        html += '<button class="addresses-action-btn secondary" onclick="closeAddressProcessingSummaryModal()">';
        html += '<span>✖</span>Zamknij';
        html += '</button>';
        html += '</div>';
        html += '</div>';
    }

    html += '</div>';

    // Wstawiamy HTML na stronę
    const container = document.createElement('div');
    container.innerHTML = html;
    const summaryDiv = container.firstElementChild;

    // Dodajemy funkcję zamykającą modal
    window.closeAddressProcessingSummaryModal = function () {
        const modal = document.querySelector('.recognized-addresses-container');
        // Usuń wszystkie backdropy
        const backdrops = document.querySelectorAll('.recognized-addresses-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        if (modal) modal.remove();
        if (window.closeAddressProcessingSummaryModal) delete window.closeAddressProcessingSummaryModal;
    };

    // Dodajemy backdrop i modal do strony
    document.body.appendChild(backdrop);
    document.body.appendChild(summaryDiv);

    // Pokazujemy backdrop z animacją
    setTimeout(() => {
        backdrop.classList.add('visible');
    }, 10);

    // Automatycznie usuń po 10 sekundach
    setTimeout(() => {
        if (summaryDiv.parentElement) {
            summaryDiv.remove();
            const backdrop = document.querySelector('.recognized-addresses-backdrop');
            if (backdrop) backdrop.remove();
        }
    }, 10000);
}

// Funkcja do wyświetlania błędu analizy aparatu
function showCameraAnalysisError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'camera-analysis-error';
    errorDiv.innerHTML = `
        <div class="error-content">
            <div class="error-icon">❌</div>
            <div class="error-message">${message}</div>
            <button class="error-close" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;

    // Dodaj style inline dla błędu
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #f44336;
        color: white;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 90%;
        font-size: 14px;
    `;

    errorDiv.querySelector('.error-content').style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
    `;

    errorDiv.querySelector('.error-icon').style.cssText = `
        font-size: 20px;
    `;

    errorDiv.querySelector('.error-message').style.cssText = `
        flex: 1;
        line-height: 1.4;
    `;

    errorDiv.querySelector('.error-close').style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s;
    `;

    errorDiv.querySelector('.error-close').addEventListener('mouseenter', function () {
        this.style.backgroundColor = 'rgba(255,255,255,0.2)';
    });

    errorDiv.querySelector('.error-close').addEventListener('mouseleave', function () {
        this.style.backgroundColor = 'transparent';
    });

    document.body.appendChild(errorDiv);

    // Automatycznie usuń po 8 sekundach
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 8000);
}

console.log('app.js załadowany [LOG]');


// Dodaj animację fadeInDown do stylów globalnych jeśli nie istnieje
(function addFadeInDownAnimation() {
    if (document.getElementById('fadeInDownStyle')) return;
    const style = document.createElement('style');
    style.id = 'fadeInDownStyle';
    style.innerHTML = `@keyframes fadeInDown { from { opacity:0; transform:translateY(-40px);} to { opacity:1; transform:translateY(0);} }`;
    document.head.appendChild(style);
})();

// Wywołaj powiadomienie po załadowaniu DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showEarlyAccessNotice);
    console.log('[LOG] Dodano listener DOMContentLoaded na showEarlyAccessNotice');
} else {
    showEarlyAccessNotice();
    console.log('[LOG] Wywołano showEarlyAccessNotice od razu');
}