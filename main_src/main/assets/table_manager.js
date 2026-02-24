// Moduł zarządzania tabelą adresów
class TableManager {
    constructor(mapManager = null) {
        this.addresses = [];
        this.addressSet = new Set();
        this.addressTableBody = document.querySelector('#address-table tbody');
        this.startPointSelect = document.getElementById('start-point');
        this.endPointSelect = document.getElementById('end-point');
        this.mapManager = mapManager; // Dodaj referencję do MapManager
        this.addressMarkers = new Map(); // Mapa do przechowywania znaczników adresów
        this._isLoadingAddresses = false; // Flaga blokująca podczas wczytywania adresów (zapobiega cyklom)

        // Sprawdź czy elementy istnieją
        if (!this.addressTableBody || !this.startPointSelect || !this.endPointSelect) {
            console.error('Elementy tabeli nie zostały znalezione');
        } else {
            // Dodaj przyciski globalne po inicjalizacji
            this.addGlobalDeleteButtons();
            // Inicjalizuj funkcjonalność "Zaznacz wszystkie"
            this.initSelectAllCheckbox();
            // Inicjalizuj przycisk resetowania statusów
            this.initResetStatusButton();
            // Inicjalizuj funkcjonalność przeciągania
            this.initializeDragAndDrop();
        }
    }

    // Metoda do ustawienia MapManager (jeśli nie został przekazany w konstruktorze)
    setMapManager(mapManager) {
        this.mapManager = mapManager;
    }

    // === METODY DO ZARZĄDZANIA STATUSAMI ADRESÓW ===

    // Pobierz klucz adresu na podstawie samego adresu
    getAddressKeyByAddress(address) {
        const addressObj = this.addresses.find(addr => addr.address === address);
        return addressObj ? addressObj.id : null;
    }

    // Zaktualizuj status adresu w tabeli i pamięci
    updateAddressStatus(addressKey, status) {
        console.log(`Aktualizuję status adresu ${addressKey} na ${status}`);

        // Znajdź wiersz tabeli
        const row = this.addressTableBody.querySelector(`tr[data-address-key="${addressKey}"]`);
        if (!row) {
            console.warn(`Nie znaleziono wiersza dla adresu ${addressKey}`);
            return;
        }

        // Znajdź lub utwórz element statusu
        let statusElement = row.querySelector('.address-status');
        if (!statusElement) {
            // Utwórz element statusu jeśli nie istnieje
            const timeContainer = row.querySelector('.address-time-container');
            if (timeContainer) {
                statusElement = document.createElement('div');
                statusElement.className = 'address-status';
                statusElement.id = `status-${addressKey}`;
                timeContainer.appendChild(statusElement);
            }
        }

        if (statusElement) {
            // Ustaw tekst statusu (używamy BRAK dla statusu BRAK, aby był klikalny)
            statusElement.textContent = (status === 'BRAK' || !status) ? 'BRAK' : status;
            statusElement.className = `address-status status-${(status || 'BRAK').toLowerCase()}`;
            statusElement.title = 'Kliknij, aby zmienić status';
            statusElement.style.cursor = 'pointer';

            // Dodaj obsługę kliknięcia (jeśli jeszcze nie ma)
            if (!statusElement.onclick) {
                statusElement.onclick = (e) => {
                    e.stopPropagation();
                    if (window.toggleAddressStatus) {
                        window.toggleAddressStatus(addressKey);
                    }
                };
            }

            // Zapisz status w pamięci adresów
            const addressObj = this.addresses.find(addr => addr.id === addressKey);
            if (addressObj) {
                addressObj.status = status;
            }

            // Zapisz status w Android (tylko jeśli trasa jest zoptymalizowana)
            if (this.isRouteOptimized() && typeof Android !== 'undefined' && Android.saveAddressStatus) {
                Android.saveAddressStatus(addressKey, status);
            }

            // NOWE: Zapisz w historii przejazdów przy ręcznej zmianie statusu
            // Mapowanie statusów UI na typy akcji w historii przejazdów
            if (status === 'Odwiedzony' || status === 'Pominięty') {
                const actionType = (status === 'Odwiedzony') ? 'delivered' : 'skipped';
                if (typeof Android !== 'undefined' && typeof Android.rhRecordPointAction === 'function') {
                    try {
                        Android.rhRecordPointAction(addressKey, actionType);
                        console.log(`[RideHistory] Zapisano akcję ${actionType} dla punktu ${addressKey} przy ręcznej zmianie statusu`);
                    } catch (e) {
                        console.error('[RideHistory] Błąd zapisu akcji przy ręcznej zmianie statusu:', e);
                    }
                }
            } else if (status === 'BRAK' || !status) {
                // Usuń wpis z historii przejazdów gdy status jest resetowany do BRAK
                if (typeof Android !== 'undefined' && typeof Android.rhRemovePointAction === 'function') {
                    try {
                        Android.rhRemovePointAction(addressKey);
                        console.log(`[RideHistory] Usunięto akcję dla punktu ${addressKey} przy resecie statusu do BRAK`);
                    } catch (e) {
                        console.error('[RideHistory] Błąd usuwania akcji przy resecie statusu:', e);
                    }
                }
            }

            // Zaktualizuj kolor znacznika na mapie
            if (this.mapManager && typeof this.mapManager.updateMarkerStatus === 'function') {
                this.mapManager.updateMarkerStatus(addressKey, status);
            }

            console.log(`Zaktualizowano status adresu ${addressKey} na ${status}`);

            // Sprawdź czy wszystkie adresy zostały przetworzone i zamknij przejazd
            this.checkAndCloseRideIfComplete();

            // Aktualizuj tekst przycisku optymalizacji w NavigationManager
            if (window.navigationManager && typeof window.navigationManager.checkOptimizeButton === 'function') {
                window.navigationManager.checkOptimizeButton();
            }
        }
    }

    // Sprawdza czy wszystkie adresy zostały odwiedzone/pominięte i zamyka przejazd
    checkAndCloseRideIfComplete() {
        // Sprawdź czy trasa jest zoptymalizowana
        if (!this.isRouteOptimized()) {
            return;
        }

        // Pobierz wszystkie adresy (bez punktu "Aktualna pozycja")
        const intermediateAddresses = this.addresses.filter(addr =>
            addr.address !== 'Aktualna pozycja'
        );

        if (intermediateAddresses.length === 0) {
            return;
        }

        // Sprawdź czy wszystkie mają status różny od BRAK
        const allProcessed = intermediateAddresses.every(addr => {
            const status = this.getAddressStatus(addr.id);
            return status && status !== 'BRAK';
        });

        if (allProcessed) {
            console.log('[TableManager] Wszystkie adresy przetworzone - zamykam przejazd');

            // Zamknij bieżący przejazd w historii
            if (typeof Android !== 'undefined' && Android.rhCloseCurrentRide) {
                try {
                    Android.rhCloseCurrentRide();
                    console.log('[TableManager] Przejazd zamknięty pomyślnie');

                    // Pokaż komunikat użytkownikowi
                    if (Android.showToast) {
                        Android.showToast('Trasa zakończona! ✓');
                    }
                } catch (e) {
                    console.error('[TableManager] Błąd zamykania przejazdu:', e);
                }
            }
        }
    }


    // Wyświetl status adresu (tylko po optymalizacji)
    displayAddressStatus(addressKey) {
        // Sprawdź czy trasa została zoptymalizowana
        if (!this.isRouteOptimized()) {
            return;
        }

        const status = this.getAddressStatus(addressKey);
        if (status && status !== 'BRAK') {
            this.updateAddressStatus(addressKey, status);
        }
    }

    // Pobierz status adresu
    getAddressStatus(addressKey) {
        if (typeof Android !== 'undefined' && Android.getAddressStatus) {
            try {
                const status = Android.getAddressStatus(addressKey);
                return status || 'BRAK';
            } catch (e) {
                console.error('Błąd podczas pobierania statusu adresu:', e);
                return 'BRAK';
            }
        }
        return 'BRAK'; // Domyślny status
    }

    // Załaduj wszystkie statusy adresów
    loadAddressStatuses() {
        // Sprawdź czy trasa jest zoptymalizowana - statusy wyświetlamy tylko dla zoptymalizowanej trasy
        if (!this.isRouteOptimized()) {
            console.log('[loadAddressStatuses] Trasa nie jest zoptymalizowana - pomijam ładowanie statusów');
            return;
        }

        let statuses = {};

        if (typeof Android !== 'undefined' && Android.getAllAddressStatuses) {
            try {
                const statusesJson = Android.getAllAddressStatuses();
                if (statusesJson && statusesJson !== '{}' && statusesJson !== 'null') {
                    statuses = JSON.parse(statusesJson);
                    console.log('Załadowano statusy adresów:', statuses);
                }
            } catch (e) {
                console.error('Błąd podczas ładowania statusów adresów:', e);
            }
        }

        // Zaktualizuj statusy w tabeli dla wszystkich adresów
        // Ustaw zapisany status lub "BRAK" dla adresów bez zapisanego statusu
        this.addresses.forEach(addr => {
            const savedStatus = statuses[addr.id];
            const statusToSet = (savedStatus && savedStatus !== 'BRAK') ? savedStatus : 'BRAK';
            this.updateAddressStatus(addr.id, statusToSet);
        });
    }

    // Resetuj statusy wszystkich adresów
    resetAddressStatuses() {
        console.log('Resetuję statusy wszystkich adresów');

        // Wyczyść statusy w Android
        if (typeof Android !== 'undefined' && Android.clearAllAddressStatuses) {
            try {
                Android.clearAllAddressStatuses();
            } catch (e) {
                console.error('Błąd podczas czyszczenia statusów w Android:', e);
            }
        }

        // Wyczyść statusy w tabeli
        this.addresses.forEach(addr => {
            addr.status = 'BRAK';
            const row = this.addressTableBody.querySelector(`tr[data-address-key="${addr.id}"]`);
            if (row) {
                const statusElement = row.querySelector('.address-status');
                if (statusElement) {
                    statusElement.textContent = 'BRAK';
                    statusElement.className = 'address-status status-brak';
                }
            }
        });

        // Zresetuj kolory znaczników na mapie
        if (this.mapManager && typeof this.mapManager.resetAllMarkerStatuses === 'function') {
            this.mapManager.resetAllMarkerStatuses();
        }

        console.log('Zresetowano statusy wszystkich adresów');

        // Aktualizuj tekst przycisku optymalizacji w NavigationManager
        if (window.navigationManager && typeof window.navigationManager.checkOptimizeButton === 'function') {
            window.navigationManager.checkOptimizeButton();
        }
    }



    // Usuń status pojedynczego adresu
    removeAddressStatus(addressKey) {
        if (typeof Android !== 'undefined' && Android.removeAddressStatus) {
            try {
                Android.removeAddressStatus(addressKey);
                console.log(`Usunięto status adresu: ${addressKey}`);
            } catch (e) {
                console.error('Błąd podczas usuwania statusu adresu:', e);
            }
        }
    }

    // Dodawanie adresu do tabeli
    addAddressToTable(address, latitude, longitude, clearExisting = false, returnOnBack = false, timeFrom = '', timeTo = '', packageSettings = null, deliveryType = '', firstOnRoute = false, favoriteName = '') {
        // Użyj spójnej funkcji do generowania klucza adresu, jeśli dostępna
        const addressKey = typeof generateAddressKey === 'function'
            ? generateAddressKey(address, latitude, longitude)
            : `${address}_${latitude}_${longitude}`;

        console.log(`addAddressToTable: ${address}, timeFrom: ${timeFrom}, timeTo: ${timeTo}, deliveryType: ${deliveryType}, clearExisting: ${clearExisting}`);
        console.log(`addAddressToTable: latitude=${latitude}, longitude=${longitude}, returnOnBack=${returnOnBack}, firstOnRoute=${firstOnRoute}`);

        if (!clearExisting && this.addressSet.has(addressKey)) {
            console.log(`Adres ${address} już istnieje w tabeli, pomijam`);
            return;
        }

        if (!clearExisting) {
            this.addressSet.add(addressKey);
            // Upewnij się, że pola timeFrom i timeTo są zawsze zapisane jako stringi
            const timeFromStr = timeFrom !== undefined && timeFrom !== null ? String(timeFrom) : '';
            const timeToStr = timeTo !== undefined && timeTo !== null ? String(timeTo) : '';
            // Upewnij się, że deliveryType ma poprawną wartość - domyślnie pusty string
            const deliveryTypeStr = deliveryType === 'pickup' ? 'pickup' : deliveryType === 'delivery' ? 'delivery' : '';

            console.log(`Dodaję adres do tablicy: ${address}, timeFrom: ${timeFromStr}, timeTo: ${timeToStr}, deliveryType: ${deliveryTypeStr}`);

            this.addresses.push({
                address: address,
                lat: latitude,
                lng: longitude,
                id: addressKey, // Unikalny identyfikator
                returnOnBack: !!returnOnBack, // Czy adres ma być odwiedzony na powrocie
                timeFrom: timeFromStr, // Godzina od (opcjonalnie)
                timeTo: timeToStr, // Godzina do (opcjonalnie)
                packageSettings: packageSettings, // Ustawienia paczki (opcjonalnie)
                deliveryType: deliveryTypeStr, // Typ: 'delivery' lub 'pickup'
                firstOnRoute: !!firstOnRoute, // Czy adres ma być pierwszy na trasie
                favoriteName: favoriteName || '' // Nazwa ulubionego adresu (opcjonalnie)
            });
            this.updateSelectOptions(address, latitude, longitude);

            // Dodaj znacznik na mapę jeśli MapManager jest dostępny
            if (this.mapManager && typeof this.mapManager.addMarker === 'function') {
                const marker = this.mapManager.addMarker(latitude, longitude, address);
                this.addressMarkers.set(addressKey, marker);

                // Nie wywołujemy automatycznego centrowania na wszystkich adresach
                // Każda funkcja dodająca adres będzie odpowiedzialna za własne centrowanie
                // Dzięki temu mapa nie będzie centrowana na wszystkich adresach po dodaniu nowego
                console.log('Dodano znacznik dla adresu:', address, 'bez automatycznego centrowania na wszystkich adresach');
            } else {
                console.warn('MapManager nie jest dostępny - znacznik nie został dodany');
            }

            // Zapisz adresy po dodaniu nowego (tylko gdy NIE trwa wczytywanie)
            if (!this._isLoadingAddresses) {
                this.saveAddresses();

                // OPTYMALIZACJA W LOCIE: Jeśli trasa jest już zoptymalizowana, uruchom cichą reoptymalizację
                if (this.isRouteOptimized() && window.navigationManager && typeof window.navigationManager.silentOptimizeRoute === 'function') {
                    console.log('[TableManager.addAddressToTable] -> Wykryto dodanie adresu do zoptymalizowanej trasy - uruchamiam cichą reoptymalizację');
                    // Opóźnienie pozwala na zakończenie aktualizacji UI i dodania znacznika na mapę
                    setTimeout(() => {
                        window.navigationManager.silentOptimizeRoute().then(success => {
                            if (success) {
                                console.log('[TableManager.addAddressToTable] -> Cicha reoptymalizacja zakończona pomyślnie');
                            } else {
                                console.log('[TableManager.addAddressToTable] -> Cicha reoptymalizacja nie została wykonana');
                            }
                        }).catch(err => {
                            console.error('[TableManager.addAddressToTable] -> Błąd cichej reoptymalizacji:', err);
                        });
                    }, 200);
                }
            }
        }

        const row = this.addressTableBody.insertRow();
        row.dataset.addressKey = addressKey; // Ustawiamy atrybut data dla wiersza
        row.setAttribute('data-address-key', addressKey); // Dodatkowo ustawiamy jako atrybut HTML

        // Komórka z checkboxem do zaznaczania (zaznaczanie do usuwania)
        const selectCell = row.insertCell(0);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.addressKey = addressKey;

        // Dodaj event listener do aktualizacji checkbox "Zaznacz wszystkie"
        checkbox.addEventListener('change', () => {
            this.updateSelectAllCheckbox();
        });

        selectCell.appendChild(checkbox);

        const addressCell = row.insertCell(1);

        // Kontener dla adresu i szacunkowej godziny przyjazdu
        const addressContainer = document.createElement('div');
        addressContainer.className = 'address-container';

        // Adres
        const addressText = document.createElement('div');
        addressText.className = 'address-text';

        // Użyj przekazanej nazwy ulubionego adresu lub sprawdź czy adres jest ulubiony
        if (favoriteName || (window.favoritesManager && typeof window.favoritesManager.isFavorite === 'function')) {
            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(address, latitude, longitude)
                : `${address}_${latitude}_${longitude}`;
            const isFavorite = favoriteName ? true : window.favoritesManager.isFavorite(addressKey);
            const currentFavoriteName = favoriteName || window.favoritesManager.getFavoriteName(addressKey);

            if (isFavorite && currentFavoriteName) {
                addressText.textContent = `${address} (${currentFavoriteName})`;
                addressContainer.appendChild(addressText);
            } else {
                addressText.textContent = address;
                addressContainer.appendChild(addressText);
            }
        } else {
            addressText.textContent = address;
            addressContainer.appendChild(addressText);
        }

        // Szacunkowa godzina przyjazdu (będzie obliczona po optymalizacji)
        const arrivalTimeText = document.createElement('div');
        arrivalTimeText.className = 'arrival-time-text';
        arrivalTimeText.id = `arrival-time-${addressKey}`;
        arrivalTimeText.style.display = 'none'; // Ukryte domyślnie
        addressContainer.appendChild(arrivalTimeText);

        console.log(`Utworzono element arrival-time-${addressKey} dla adresu: ${address}`);

        // Wyświetl godziny od/do pod adresem, zawsze (jeśli brak, wyświetl '-')
        const timeContainer = document.createElement('div');
        timeContainer.className = 'address-time-container';

        const timeInfo = document.createElement('div');
        timeInfo.className = 'address-time-info';
        timeInfo.id = `time-info-${addressKey}`; // Dodaj ID dla łatwiejszego debugowania

        // Upewnij się, że timeFrom i timeTo są stringami
        const timeFromStr = timeFrom !== undefined && timeFrom !== null ? String(timeFrom) : '';
        const timeToStr = timeTo !== undefined && timeTo !== null ? String(timeTo) : '';

        console.log(`Tworzę element time-info dla adresu ${address}: timeFrom=${timeFromStr}, timeTo=${timeToStr}`);

        if (timeFromStr || timeToStr) {
            if (timeFromStr && timeToStr) {
                timeInfo.textContent = `Godzina od–do: ${timeFromStr} - ${timeToStr}`;
                console.log(`Ustawiam tekst dla ${address}: Godzina od–do: ${timeFromStr} - ${timeToStr}`);
            } else if (timeFromStr) {
                timeInfo.textContent = `Godzina od: ${timeFromStr}`;
                console.log(`Ustawiam tekst dla ${address}: Godzina od: ${timeFromStr}`);
            } else if (timeToStr) {
                timeInfo.textContent = `Godzina do: ${timeToStr}`;
                console.log(`Ustawiam tekst dla ${address}: Godzina do: ${timeToStr}`);
            }
        } else {
            timeInfo.textContent = 'Godzina od–do: -';
            console.log(`Ustawiam tekst dla ${address}: Godzina od–do: -`);
        }

        timeContainer.appendChild(timeInfo);

        // Dodaj status adresu (tylko jeśli trasa jest zoptymalizowana)
        if (this.isRouteOptimized()) {
            const currentStatus = this.getAddressStatus(addressKey) || 'BRAK';
            const statusElement = document.createElement('div');
            statusElement.className = `address-status status-${currentStatus.toLowerCase()}`;
            statusElement.id = `status-${addressKey}`;
            statusElement.textContent = currentStatus === 'BRAK' ? 'BRAK' : currentStatus;
            statusElement.style.cursor = 'pointer';
            statusElement.title = 'Kliknij, aby zmienić status';
            statusElement.onclick = (e) => {
                e.stopPropagation();
                if (window.toggleAddressStatus) {
                    window.toggleAddressStatus(addressKey);
                }
            };
            timeContainer.appendChild(statusElement);
        }

        addressContainer.appendChild(timeContainer);

        addressCell.appendChild(addressContainer);

        const latCell = row.insertCell(2);
        latCell.textContent = latitude.toFixed(6);

        const lonCell = row.insertCell(3);
        lonCell.textContent = longitude.toFixed(6);

        // Usunięto kolumnę z checkboxem "Powrót" - funkcjonalność przeniesiona do modala ustawień

        // Komórka z przyciskiem ulubionych
        const favoritesCell = row.insertCell(4);
        // Dodaj przycisk ulubionych (gwiazdka)
        const starButton = document.createElement('button');
        starButton.className = 'favorite-star';
        starButton.title = 'Dodaj do ulubionych';
        // Ustal wstępny stan gwiazdki na podstawie localStorage przez favoritesManager
        try {
            const isFav = window.favoritesManager ? window.favoritesManager.isFavorite(addressKey) : false;
            if (isFav) {
                starButton.classList.add('active');
                starButton.textContent = '★'; // Złota gwiazdka (stylowana przez CSS/klasę)
                starButton.title = 'Usuń z ulubionych';
            } else {
                starButton.textContent = '☆'; // Pusta gwiazdka
            }
        } catch (e) {
            starButton.textContent = '☆';
        }
        // Obsługa kliknięcia gwiazdki: toggle w FavoritesManager
        starButton.addEventListener('click', (ev) => {
            ev.stopPropagation();

            // Sprawdź czy adres jest już ulubiony
            const isAlreadyFavorite = window.favoritesManager ? window.favoritesManager.isFavorite(addressKey) : false;

            if (isAlreadyFavorite) {
                // Jeśli już jest ulubiony, usuń go
                const favPayload = {
                    id: addressKey,
                    address: address,
                    lat: latitude,
                    lng: longitude,
                    timeFrom: timeFromStr,
                    timeTo: timeToStr,
                    deliveryType: (this.addresses.find(a => a.id === addressKey)?.deliveryType) || '',
                    firstOnRoute: !!(this.addresses.find(a => a.id === addressKey)?.firstOnRoute)
                };
                const nowFav = window.favoritesManager ? window.favoritesManager.toggleFavorite(favPayload) : false;
                if (!nowFav) {
                    starButton.classList.remove('active');
                    starButton.textContent = '☆';
                    starButton.title = 'Dodaj do ulubionych';

                    // USUNIĘCIE: Zaktualizuj nazwę w tabeli po usunięciu z ulubionych (usuń nazwę)
                    this.updateAddressName(addressKey, '');

                    try { if (typeof Android !== 'undefined' && Android.showToast) Android.showToast('Usunięto z ulubionych'); } catch { }
                }
            } else {
                // Jeśli nie jest ulubiony, otwórz modal z nazwą
                const favData = {
                    id: addressKey,
                    address: address,
                    lat: latitude,
                    lng: longitude,
                    existingName: '' // Nowy adres nie ma jeszcze nazwy
                };

                // Otwórz modal z nazwą
                if (window.favoritesManager && typeof window.favoritesManager.openFavoriteNameModal === 'function') {
                    window.favoritesManager.openFavoriteNameModal(favData, (id, name) => {
                        // Po zapisaniu nazwy, dodaj do ulubionych
                        const favPayload = {
                            id: id,
                            address: address,
                            lat: latitude,
                            lng: longitude,
                            timeFrom: timeFromStr,
                            timeTo: timeToStr,
                            deliveryType: (this.addresses.find(a => a.id === id)?.deliveryType) || '',
                            firstOnRoute: !!(this.addresses.find(a => a.id === id)?.firstOnRoute),
                            name: name // Przekazanie nazwy
                        };

                        const nowFav = window.favoritesManager ? window.favoritesManager.toggleFavorite(favPayload) : false;
                        if (nowFav) {
                            starButton.classList.add('active');
                            starButton.textContent = '★';
                            starButton.title = 'Usuń z ulubionych';

                            // NOWOŚĆ: Zaktualizuj nazwę w tabeli po zapisaniu w ulubionych
                            this.updateAddressName(id, name);

                            try { if (typeof Android !== 'undefined' && Android.showToast) Android.showToast('Dodano do ulubionych'); } catch { }
                        }
                    });
                } else {
                    // Fallback - dodaj bez nazwy
                    const favPayload = {
                        id: addressKey,
                        address: address,
                        lat: latitude,
                        lng: longitude,
                        timeFrom: timeFromStr,
                        timeTo: timeToStr,
                        deliveryType: (this.addresses.find(a => a.id === addressKey)?.deliveryType) || '',
                        firstOnRoute: !!(this.addresses.find(a => a.id === addressKey)?.firstOnRoute),
                        name: '' // Brak nazwy
                    };

                    const nowFav = window.favoritesManager ? window.favoritesManager.toggleFavorite(favPayload) : false;
                    if (nowFav) {
                        starButton.classList.add('active');
                        starButton.textContent = '★';
                        starButton.title = 'Usuń z ulubionych';
                        try { if (typeof Android !== 'undefined' && Android.showToast) Android.showToast('Dodano do ulubionych'); } catch { }
                    }
                }
            }
        });
        favoritesCell.appendChild(starButton);

        // Komórka z przyciskiem ustawień
        const settingsCell = row.insertCell(5);
        const settingsButton = document.createElement('button');
        settingsButton.className = 'settings-button';
        settingsButton.innerHTML = '⚙️';
        settingsButton.title = 'Ustawienia adresu';
        settingsButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Zapobiega propagacji zdarzenia do wiersza tabeli
            // Otwórz modal ustawień adresu

            // Pobierz aktualne wartości returnOnBack i firstOnRoute z tablicy adresów
            const currentAddress = this.addresses.find(addr => addr.id === addressKey);
            const currentReturnOnBack = currentAddress ? currentAddress.returnOnBack : returnOnBack;
            const currentFirstOnRoute = currentAddress ? currentAddress.firstOnRoute : false;

            const addressData = {
                address: address,
                subtitle: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                latitude: latitude,
                longitude: longitude,
                addressKey: addressKey,
                timeFrom: timeFromStr,
                timeTo: timeToStr,
                returnOnBack: currentReturnOnBack, // Użyj aktualnej wartości z tablicy adresów
                firstOnRoute: currentFirstOnRoute // Dodaj właściwość firstOnRoute
            };
            if (typeof openAddressSettingsModal === 'function') {
                openAddressSettingsModal(addressData);
            } else {
                console.error('Funkcja openAddressSettingsModal nie jest dostępna');
            }
        });
        settingsCell.appendChild(settingsButton);

        // Komórka z numerem pozycji (tylko po optymalizacji)
        const moveCell = row.insertCell(6);
        moveCell.className = 'position-number-cell';
        moveCell.style.display = 'none'; // Ukryte domyślnie

        // Przycisk z numerem pozycji
        const positionButton = document.createElement('button');
        positionButton.className = 'position-number-button';
        positionButton.title = 'Kliknij aby przenieść adres';
        positionButton.addEventListener('click', () => {
            this.showPositionSelector(addressKey);
        });
        moveCell.appendChild(positionButton);

        // Sprawdź czy pokazać przycisk resetowania po dodaniu adresu
        this.checkForColoredAddresses();

        // Ukryj numery pozycji po dodaniu nowego adresu (przed optymalizacją)
        // Ale nie ukrywaj ich podczas odbudowywania tabeli po przeniesieniu
        if (!clearExisting) {
            this.hidePositionNumbers();
        }

        // Załaduj statusy adresów jeśli aplikacja jest gotowa
        if (this.isAppFullyLoaded()) {
            setTimeout(() => {
                this.loadAddressStatuses();
            }, 500); // Krótkie opóźnienie aby dać czas na pełne załadowanie
        }

        // Aktualizuj stan przycisku optymalizacji po dodaniu adresu
        this.updateOptimizeButtonState();
    }

    // Metoda do usuwania pojedynczego adresu
    deleteAddress(addressKey) {
        // Usuń znacznik z mapy jeśli istnieje
        if (this.addressMarkers.has(addressKey)) {
            const marker = this.addressMarkers.get(addressKey);
            if (this.mapManager && this.mapManager.getMap()) {
                this.mapManager.getMap().removeLayer(marker);
            }
            this.addressMarkers.delete(addressKey);
        }

        // Usuń z tablicy adresów
        this.addresses = this.addresses.filter(addr => addr.id !== addressKey);
        // Usuń z Setu
        this.addressSet.delete(addressKey);
        // Usuń wiersz z tabeli HTML
        const rowToRemove = this.addressTableBody.querySelector(`tr[data-address-key="${addressKey}"]`) ||
            this.addressTableBody.querySelector(`tr[data-addresskey="${addressKey}"]`);
        if (rowToRemove) {
            this.addressTableBody.removeChild(rowToRemove);
        }

        // Wyczyść linię trasy na mapie, jeśli istnieje
        if (this.mapManager && typeof this.mapManager.clearRoutePolyline === 'function') {
            this.mapManager.clearRoutePolyline();
            console.log('Wyczyszczono linię trasy na mapie po usunięciu adresu');
        }

        // Zaktualizuj opcje w selectach (usuwając ten adres)
        this.regenerateSelectOptions();
        // Aktualizuj stan checkbox "Zaznacz wszystkie"
        this.updateSelectAllCheckbox();
        // Usuń status adresu
        this.removeAddressStatus(addressKey);

        // Zapisz zmiany
        this.saveAddresses();
        // Sprawdź czy ukryć przycisk resetowania po usunięciu adresu
        this.checkForColoredAddresses();

        // Ukryj przyciski przenoszenia po usunięciu adresu
        this.hidePositionNumbers();

        // Aktualizuj stan przycisku optymalizacji po usunięciu adresu
        this.updateOptimizeButtonState();
    }

    // Metoda do regeneracji opcji w selectach po usunięciu adresu
    regenerateSelectOptions() {
        // Zapamiętaj wybrane wartości
        const selectedStartValue = this.startPointSelect.value;
        const selectedEndValue = this.endPointSelect.value;

        // Wyczyść obecne opcje (poza domyślnymi)
        this.startPointSelect.innerHTML = `
            <option value="">Wybierz punkt początkowy</option>
            <option value="current-location">Aktualna pozycja</option>
        `;
        this.endPointSelect.innerHTML = `
            <option value="">Wybierz punkt końcowy</option>
            <option value="current-location">Aktualna pozycja</option>
        `;

        // Dodaj ponownie opcje na podstawie aktualnej listy adresów
        this.addresses.forEach(addr => {
            this.updateSelectOptions(addr.address, addr.lat, addr.lng);
        });

        // Przywróć poprzednio wybrane wartości, jeśli nadal istnieją
        if (Array.from(this.startPointSelect.options).some(opt => opt.value === selectedStartValue)) {
            this.startPointSelect.value = selectedStartValue;
        }
        if (Array.from(this.endPointSelect.options).some(opt => opt.value === selectedEndValue)) {
            this.endPointSelect.value = selectedEndValue;
        }
    }

    // Metoda do dodawania globalnych przycisków usuwania
    addGlobalDeleteButtons() {
        const tableContainer = this.addressTableBody.closest('table').parentElement;
        if (!tableContainer) {
            console.error('Nie znaleziono kontenera tabeli do dodania przycisków globalnych.');
            return;
        }

        // Sprawdź, czy przyciski już istnieją
        const existingContainer = tableContainer.querySelector('.table-buttons-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'table-buttons-container';

        // Przycisk: Dodaj z ulubionych z nowym stylem mapowym
        const addFromFavoritesButton = document.createElement('button');
        addFromFavoritesButton.className = 'map-favorites-button';
        addFromFavoritesButton.id = 'add-from-favorites-button';
        addFromFavoritesButton.title = 'Dodaj adres z listy ulubionych';

        // Dodanie ikony SVG gwiazdki/pinezki
        addFromFavoritesButton.innerHTML = `
            <svg class="favorites-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span>Dodaj z ulubionych</span>
        `;

        addFromFavoritesButton.addEventListener('click', () => {
            if (window.favoritesManager && typeof window.favoritesManager.openFavoritesModal === 'function') {
                window.favoritesManager.openFavoritesModal();
            } else {
                alert('Moduł ulubionych nie jest dostępny');
            }
        });

        // Przycisk: Usuń zaznaczone z nowym stylem mapowym
        const deleteSelectedButton = document.createElement('button');
        deleteSelectedButton.className = 'map-delete-button';
        deleteSelectedButton.id = 'delete-selected-button'; // Dodaj ID dla łatwiejszego dostępu
        deleteSelectedButton.title = 'Usuń zaznaczone adresy';

        // Dodanie ikony SVG kosza
        deleteSelectedButton.innerHTML = `
            <svg class="delete-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            <span>Usuń zaznaczone</span>
        `;

        deleteSelectedButton.addEventListener('click', () => {
            // Dodaj animację wibracji przed usunięciem
            deleteSelectedButton.classList.add('deleting');
            setTimeout(() => {
                deleteSelectedButton.classList.remove('deleting');
                this.deleteSelectedAddresses();
            }, 300);
        });

        // Początkowo wyłącz przycisk do momentu pełnego załadowania aplikacji
        deleteSelectedButton.disabled = true;
        deleteSelectedButton.title = 'Ładowanie aplikacji...';
        deleteSelectedButton.innerHTML = `
            <svg class="delete-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            <span>Ładowanie...</span>
        `;

        // Sprawdzaj co 500ms czy aplikacja jest gotowa
        const checkAppReady = () => {
            if (this.isAppFullyLoaded()) {
                deleteSelectedButton.disabled = false;
                deleteSelectedButton.title = 'Usuń zaznaczone adresy';
                deleteSelectedButton.innerHTML = `
                    <svg class="delete-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                    <span>Usuń zaznaczone</span>
                `;
                console.log('Przycisk "Usuń zaznaczone" został aktywowany');
            } else {
                setTimeout(checkAppReady, 500);
            }
        };

        // ZOPTYMALIZOWANE: Zmniejszone opóźnienie z 1000ms do 300ms
        setTimeout(checkAppReady, 300);

        // Przycisk: Szczegóły trasy (MODAL) - wyświetlany TYLKO po optymalizacji
        const showRouteDetailsButton = document.createElement('button');
        showRouteDetailsButton.className = 'map-details-button';
        showRouteDetailsButton.id = 'show-route-details-button';
        showRouteDetailsButton.title = 'Pokaż szczegóły i statystyki trasy';
        showRouteDetailsButton.style.display = 'none'; // Ukryty domyślnie

        showRouteDetailsButton.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <span>Szczegóły trasy</span>
        `;

        showRouteDetailsButton.addEventListener('click', () => {
            this.openRouteDetails();
        });

        // Ułóż przyciski: najpierw "Dodaj z ulubionych", potem "Usuń zaznaczone", potem "Szczegóły trasy"
        buttonsContainer.appendChild(addFromFavoritesButton);
        buttonsContainer.appendChild(deleteSelectedButton);
        buttonsContainer.appendChild(showRouteDetailsButton);
        tableContainer.appendChild(buttonsContainer);

        // Dodaj efekt pulsacji dla przycisku "Dodaj z ulubionych"
        setTimeout(() => {
            addFromFavoritesButton.classList.add('newly-added');
            setTimeout(() => {
                addFromFavoritesButton.classList.remove('newly-added');
            }, 600);
        }, 100);
    }

    // Otwiera modal szczegółów trasy
    openRouteDetails() {
        if (typeof window.openRouteDetailsModal === 'function') {
            window.openRouteDetailsModal();
        } else {
            console.error('Funkcja window.openRouteDetailsModal nie jest dostępna');
        }
    }

    // Metoda do usuwania zaznaczonych adresów
    deleteSelectedAddresses() {
        // Sprawdź czy aplikacja jest w pełni załadowana
        if (!this.isAppFullyLoaded()) {
            alert('Aplikacja jest jeszcze ładowana. Proszę poczekać chwilę i spróbować ponownie.');
            return;
        }

        const checkboxes = this.addressTableBody.querySelectorAll('input[type="checkbox"]:checked');
        if (checkboxes.length === 0) {
            alert('Nie zaznaczono żadnych adresów do usunięcia.');
            return;
        }

        // Sprawdź czy usunięto przynajmniej jeden adres
        let addressesRemoved = false;

        checkboxes.forEach(checkbox => {
            this.deleteAddress(checkbox.dataset.addressKey);
            addressesRemoved = true;
        });

        // Jeśli usunięto przynajmniej jeden adres, zresetuj optymalizację trasy
        if (addressesRemoved) {
            // Wyczyść zoptymalizowaną trasę
            if (window.navigationManager && typeof window.navigationManager.clearOptimizedRoute === 'function') {
                window.navigationManager.clearOptimizedRoute();
            }

            // Resetuj checkbox odwracania trasy
            try {
                const reverseRouteCheckbox = document.getElementById('reverse-route-checkbox');
                if (reverseRouteCheckbox) {
                    reverseRouteCheckbox.checked = false;
                    console.log('Zresetowano checkbox odwracania trasy po usunięciu adresów');
                }
            } catch (e) {
                console.warn('Nie udało się zresetować checkboxa odwracania trasy:', e);
            }

            // Usuń wszystkie znaczniki z mapy (z wyjątkiem aktualnej pozycji)
            this.clearAllMarkersExceptCurrentLocation();

            // Resetuj statusy adresów po usunięciu zaznaczonych adresów
            this.resetAddressStatuses();
        }

        // Ukryj numery pozycji po usunięciu zaznaczonych adresów
        this.hidePositionNumbers();

        // Aktualizuj stan przycisku optymalizacji po usunięciu adresów
        this.updateOptimizeButtonState();
    }

    // Metoda do usuwania wszystkich adresów z potwierdzeniem (zoptymalizowana)
    deleteAllAddresses() {
        if (this.addresses.length === 0) {
            alert('Lista adresów jest już pusta.');
            return;
        }

        if (confirm('Czy na pewno chcesz usunąć wszystkie adresy?')) {
            this.clearAllAddresses();
            alert('Wszystkie adresy zostały usunięte.');

            // Ukryj numery pozycji po usunięciu wszystkich adresów
            this.hidePositionNumbers();

            // Aktualizuj stan przycisku optymalizacji po usunięciu wszystkich adresów
            this.updateOptimizeButtonState();
        }
    }

    // Metoda do usuwania wszystkich adresów bez potwierdzenia (dla automatycznego wczytywania)
    clearAllAddresses() {

        // POPRAWA: Wyczyść mapę poprzez mapManager zamiast ręcznego usuwania
        // To gwarantuje czyszczenie WSZYSTKICH markerów z mapy, nie tylko tych w addressMarkers
        if (this.mapManager && typeof this.mapManager.clearAllMarkersExceptCurrentLocation === 'function') {
            this.mapManager.clearAllMarkersExceptCurrentLocation();
            console.log('[TableManager.clearAllAddresses] Wyczyszczono mapę poprzez mapManager');
        } else {
            // Fallback: ręczne usuwanie jeśli mapManager nie jest dostępny
            if (this.mapManager && this.mapManager.getMap()) {
                this.addressMarkers.forEach((marker, addressKey) => {
                    this.mapManager.getMap().removeLayer(marker);
                });
            }
            this.addressMarkers.clear();
            console.log('[TableManager.clearAllAddresses] Wyczyszczono mapę (fallback)');
        }

        // Bezpośrednio czyścimy tablicę adresów i set
        this.addresses = [];
        this.addressSet.clear();
        this.addressMarkers.clear();

        // Czyścimy zawartość tbody tabeli w HTML
        if (this.addressTableBody) {
            this.addressTableBody.innerHTML = '';
        } else {
            console.error('BŁĄD: this.addressTableBody nie istnieje!');
        }

        // Regenerujemy opcje w selectach (powinny być teraz puste poza domyślnymi)
        this.regenerateSelectOptions();

        // Aktualizuj stan checkbox "Zaznacz wszystkie"
        this.updateSelectAllCheckbox();

        // Zapisujemy pustą listę adresów
        this.saveAddresses();

        // Wyczyść zoptymalizowaną trasę
        if (window.navigationManager && typeof window.navigationManager.clearOptimizedRoute === 'function') {
            window.navigationManager.clearOptimizedRoute();
        }

        // Resetuj statusy adresów
        this.resetAddressStatuses();

        // Ukryj numery pozycji po wyczyszczeniu
        this.hidePositionNumbers();
    }

    // Metoda do czyszczenia wszystkich znaczników z mapy (z wyjątkiem aktualnej pozycji)
    // Zoptymalizowana metoda odświeżania znaczników na mapie (połączone dwie poprzednie metody)
    refreshMapMarkers() {
        // Wyczyść wszystkie znaczniki z mapy (z wyjątkiem aktualnej pozycji)
        if (this.mapManager && typeof this.mapManager.clearAllMarkersExceptCurrentLocation === 'function') {
            this.mapManager.clearAllMarkersExceptCurrentLocation();
        }

        // Wyczyść lokalną mapę znaczników adresów
        this.addressMarkers.clear();

        // Usuń linię trasy z mapy
        if (this.mapManager && typeof this.mapManager.clearRoutePolyline === 'function') {
            this.mapManager.clearRoutePolyline();
        }

        // Ponownie dodaj znaczniki dla pozostałych adresów (jeśli istnieją)
        if (this.mapManager && this.addresses && this.addresses.length > 0) {
            this.addresses.forEach(addr => {
                const addressKey = addr.id || (typeof generateAddressKey === 'function'
                    ? generateAddressKey(addr.address, addr.lat, addr.lng)
                    : `${addr.address}_${addr.lat}_${addr.lng}`);

                if (typeof this.mapManager.addMarker === 'function') {
                    const marker = this.mapManager.addMarker(addr.lat, addr.lng, addr.address);
                    this.addressMarkers.set(addressKey, marker);
                }
            });
            console.log('Odświeżono znaczniki dla', this.addressMarkers.size, 'adresów');
        } else {
            console.log('Wyczyszczono mapę - brak adresów do wyświetlenia');
        }
    }

    // Metody zachowane dla kompatybilności wstecznej
    clearAllMarkersExceptCurrentLocation() {
        this.refreshMapMarkers();
    }

    recreateMarkersForRemainingAddresses() {
        if (this.addresses && this.addresses.length > 0) {
            this.refreshMapMarkers();
        }
    }

    // Aktualizacja opcji w selectach
    // POPRAWKA: Dodano pełne dane adresu (packageSettings, notes, photos, favoriteName, deliveryType)
    // do opcji w selektorach, aby były dostępne przy wyborze punktu startowego/końcowego
    updateSelectOptions(address, latitude, longitude) {
        // Znajdź pełne dane adresu w tablicy addresses
        const addressKey = typeof generateAddressKey === 'function'
            ? generateAddressKey(address, latitude, longitude)
            : `${address}_${latitude}_${longitude}`;
        
        const fullAddressData = this.addresses.find(addr => addr.id === addressKey);
        
        // Buduj obiekt opcji ze wszystkimi danymi
        const option = {
            address: address,
            lat: latitude,
            lng: longitude,
            // Dodaj packageSettings jeśli istnieje (zawiera notatki, telefon, typ paczki itp.)
            packageSettings: fullAddressData?.packageSettings || null,
            // Dodaj notatki bezpośrednio dla łatwego dostępu
            notes: fullAddressData?.packageSettings?.notes || '',
            // Dodaj zdjęcia jeśli istnieją
            photos: fullAddressData?.photos || [],
            // Dodaj nazwę ulubioną
            favoriteName: fullAddressData?.favoriteName || '',
            // Dodaj typ dostawy
            deliveryType: fullAddressData?.deliveryType || ''
        };

        const optionValue = JSON.stringify(option);

        // Sprawdź czy opcja już istnieje w selektorze punktu startowego
        const existingStartOption = Array.from(this.startPointSelect.options).find(opt => opt.value === optionValue);
        if (!existingStartOption) {
            const startOption = document.createElement('option');
            startOption.value = optionValue;
            startOption.textContent = address;
            this.startPointSelect.appendChild(startOption);
        }

        // Sprawdź czy opcja już istnieje w selektorze punktu końcowego
        const existingEndOption = Array.from(this.endPointSelect.options).find(opt => opt.value === optionValue);
        if (!existingEndOption) {
            const endOption = document.createElement('option');
            endOption.value = optionValue;
            endOption.textContent = address;
            this.endPointSelect.appendChild(endOption);
        }
    }

    // Aktualizacja tabeli po optymalizacji
    updateTable(optimizedRoute, skipSave = false) {
        // Ustaw flagę podczas aktualizacji tabeli - zapobiega cyklom z addAddressToTable
        const wasLoading = this._isLoadingAddresses;
        this._isLoadingAddresses = true;

        // Zachowaj kopię aktualnych adresów z ich czasami, ustawieniami paczek, typem dostawy i firstOnRoute
        const addressesWithData = {};

        // Używamy spójnych kluczy adresów (generateAddressKey) dla zachowania ustawień
        this.addresses.forEach(addr => {
            // Używamy tego samego klucza co w saveAddresses() i innych funkcjach
            const addressKey = addr.id || (typeof generateAddressKey === 'function'
                ? generateAddressKey(addr.address, addr.lat, addr.lng)
                : `${addr.address}_${addr.lat}_${addr.lng}`);

            addressesWithData[addressKey] = {
                timeFrom: addr.timeFrom || '',
                timeTo: addr.timeTo || '',
                packageSettings: addr.packageSettings || null,
                deliveryType: addr.deliveryType || '',
                firstOnRoute: !!addr.firstOnRoute
            };

            // Dodajemy log dla debugowania
            console.log(`[TableManager.updateTable] Zapisuję dane dla adresu: ${addr.address}, klucz: ${addressKey}`, addressesWithData[addressKey]);
        });

        // Zachowaj aktualne wartości selektorów przed wyczyszczeniem
        const currentStartPoint = this.startPointSelect.value;
        const currentEndPoint = this.endPointSelect.value;

        // POPRAWA: Wyczyść mapę poprzez mapManager zamiast ręcznego usuwania
        // To gwarantuje czyszczenie WSZYSTKICH markerów z mapy, nie tylko tych w addressMarkers
        if (this.mapManager && typeof this.mapManager.clearAllMarkersExceptCurrentLocation === 'function') {
            console.log('[TableManager.updateTable] Czyszczenie mapy poprzez mapManager.clearAllMarkersExceptCurrentLocation()');
            this.mapManager.clearAllMarkersExceptCurrentLocation();
        } else if (this.mapManager && this.mapManager.getMap()) {
            // Fallback: ręczne usuwanie jeśli clearAllMarkersExceptCurrentLocation nie jest dostępne
            console.log('[TableManager.updateTable] Czyszczenie mapy (fallback - ręczne usuwanie)');
            this.addressMarkers.forEach((marker) => {
                this.mapManager.getMap().removeLayer(marker);
            });
        }
        this.addressMarkers.clear();

        // Wyczyść tabelę
        this.addressTableBody.innerHTML = '';

        // Wyczyść listy wyboru
        this.startPointSelect.innerHTML = `
            <option value="">Wybierz punkt początkowy</option>
            <option value="current-location">Aktualna pozycja</option>
        `;
        this.endPointSelect.innerHTML = `
            <option value="">Wybierz punkt końcowy</option>
            <option value="current-location">Aktualna pozycja</option>
        `;

        // Zaktualizuj addresses z nową kolejnością
        this.addresses = [];
        this.addressSet.clear();

        // Dla każdego punktu z optymalnej trasy dodaj do tabeli i do addresses
        console.log('Aktualizacja tabeli z trasą:', optimizedRoute);
        optimizedRoute.forEach((point) => {
            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(point.address, point.lat, point.lng)
                : `${point.address}_${point.lat}_${point.lng}`;
            if (point.address !== 'Aktualna pozycja') {
                // Pobierz zapisane dane dla tego adresu, używając spójnego klucza
                const savedData = addressesWithData[addressKey] || {};
                const timeFrom = point.timeFrom || savedData.timeFrom || '';
                const timeTo = point.timeTo || savedData.timeTo || '';
                const packageSettings = point.packageSettings || savedData.packageSettings || null;
                const deliveryType = point.deliveryType || savedData.deliveryType || ''; // Nie ustawiaj domyślnie "delivery"
                const firstOnRoute = point.firstOnRoute !== undefined ? !!point.firstOnRoute : !!savedData.firstOnRoute;

                console.log(`[TableManager.updateTable] Dodawanie adresu: ${point.address}, klucz: ${addressKey}, timeFrom: ${timeFrom}, timeTo: ${timeTo}, deliveryType: ${deliveryType}, firstOnRoute: ${firstOnRoute}, packageSettings:`, packageSettings);
                console.log(`[TableManager.updateTable] Znalezione dane dla klucza ${addressKey}:`, savedData);

                this.addresses.push({
                    ...point,
                    id: addressKey,
                    timeFrom: timeFrom,
                    timeTo: timeTo,
                    packageSettings: packageSettings,
                    deliveryType: deliveryType,
                    firstOnRoute: firstOnRoute
                });

                this.addressSet.add(addressKey);

                // Przekazuj timeFrom/timeTo, packageSettings, deliveryType i firstOnRoute do addAddressToTable
                this.addAddressToTable(
                    point.address,
                    point.lat,
                    point.lng,
                    true,
                    point.returnOnBack,
                    timeFrom,
                    timeTo,
                    packageSettings,
                    deliveryType,
                    firstOnRoute
                );

                this.updateSelectOptions(point.address, point.lat, point.lng);
                console.log(`Dodano adres do tabeli: ${point.address} z ID: ${addressKey}, timeFrom: ${timeFrom}, timeTo: ${timeTo}`);
            }
        });

        // Jeśli nie ma żadnych punktów pośrednich (tylko "Aktualna pozycja"), 
        // upewnij się, że tabela jest widoczna
        if (this.addresses.length === 0) {
            // Pokaż pustą tabelę
            this.addressTableBody.innerHTML = '';
            // Pokaż kontener tabeli
            const tableContainer = this.addressTableBody.closest('.table-container');
            if (tableContainer) {
                tableContainer.style.display = 'block';
            }
        }

        // Przywróć zachowane wartości selektorów lub ustaw automatycznie jeśli nie były ustawione
        if (currentStartPoint && currentEndPoint) {
            // Przywróć zachowane wartości
            this.startPointSelect.value = currentStartPoint;
            this.endPointSelect.value = currentEndPoint;
        } else if (optimizedRoute.length >= 2) {
            // Automatycznie ustaw punkty startowe i końcowe tylko jeśli nie były wcześniej ustawione
            const firstPoint = optimizedRoute[0];
            if (firstPoint.address === 'Aktualna pozycja') {
                this.startPointSelect.value = 'current-location';
            } else {
                const firstPointValue = JSON.stringify({
                    address: firstPoint.address,
                    lat: firstPoint.lat,
                    lng: firstPoint.lng
                });
                this.startPointSelect.value = firstPointValue;
            }

            // Ustaw punkt końcowy
            const lastPoint = optimizedRoute[optimizedRoute.length - 1];
            if (lastPoint.address === 'Aktualna pozycja') {
                this.endPointSelect.value = 'current-location';
            } else {
                const lastPointValue = JSON.stringify({
                    address: lastPoint.address,
                    lat: lastPoint.lat,
                    lng: lastPoint.lng
                });
                this.endPointSelect.value = lastPointValue;
            }
        }

        // Zdejmij flagę blokującą
        this._isLoadingAddresses = wasLoading;

        // Zapisz adresy po aktualizacji (chyba że skipSave=true)
        if (!skipSave) {
            this.saveAddresses();
        }

        // Zresetuj currentAddressIndex przy aktualizacji tabeli tylko jeśli nie ma trasy w sessionStorage
        const currentRoute = sessionStorage.getItem('currentRoute');
        if (!currentRoute) {
            this.currentAddressIndex = 0;
        }

        // Pokaż przyciski przenoszenia po optymalizacji
        this.showPositionNumbers();

        // Zaktualizuj wiersze aby były przeciągalne po optymalizacji
        this.updateRowsDraggable();

        // Załaduj statusy adresów (przywróć statusy "Odwiedzony" itp.) z opóźnieniem
        setTimeout(() => {
            this.loadAddressStatuses();
        }, 100);

        console.log('Tabela została zaktualizowana, elementy arrival-time powinny istnieć');
        console.log('Liczba elementów arrival-time w DOM:', document.querySelectorAll('.arrival-time-text').length);
    }

    // Nowa funkcja do aktualizacji tabeli z istniejącymi adresami (bez czyszczenia)
    updateTableWithExistingAddresses(optimizedRoute) {
        // Nie czyścimy tabeli ani adresów - tylko aktualizujemy kolejność

        // Zachowaj kopię aktualnych adresów z ich czasami, ustawieniami paczek i typem dostawy
        const addressesWithData = {};
        this.addresses.forEach(addr => {
            // Używamy tego samego klucza co w pozostałych funkcjach
            const addressKey = addr.id || (typeof generateAddressKey === 'function'
                ? generateAddressKey(addr.address, addr.lat, addr.lng)
                : `${addr.address}_${addr.lat}_${addr.lng}`);

            addressesWithData[addressKey] = {
                timeFrom: addr.timeFrom || '',
                timeTo: addr.timeTo || '',
                packageSettings: addr.packageSettings || null,
                deliveryType: addr.deliveryType || '',
                firstOnRoute: !!addr.firstOnRoute
            };
        });

        // Zaktualizuj addresses z nową kolejnością
        this.addresses = [];
        this.addressSet.clear();

        // Dla każdego punktu z optymalnej trasy dodaj do addresses
        console.log('Aktualizacja tabeli z istniejącymi adresami:', optimizedRoute);
        optimizedRoute.forEach((point) => {
            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(point.address, point.lat, point.lng)
                : `${point.address}_${point.lat}_${point.lng}`;
            if (point.address !== 'Aktualna pozycja') {
                // Pobierz zapisane dane dla tego adresu, jeśli istnieją
                const savedData = addressesWithData[addressKey] || {};
                const timeFrom = point.timeFrom || savedData.timeFrom || '';
                const timeTo = point.timeTo || savedData.timeTo || '';
                const packageSettings = point.packageSettings || savedData.packageSettings || null;
                const deliveryType = point.deliveryType || savedData.deliveryType || ''; // Nie ustawiaj domyślnie "delivery"

                console.log(`Dodawanie adresu do tabeli: ${point.address}, timeFrom: ${timeFrom}, timeTo: ${timeTo}, deliveryType: ${deliveryType}`);

                this.addresses.push({
                    ...point,
                    id: addressKey,
                    timeFrom: timeFrom,
                    timeTo: timeTo,
                    packageSettings: packageSettings,
                    deliveryType: deliveryType,
                    favoriteName: point.favoriteName || '' // Zapewnij, że nazwa jest zapisywana
                });

                this.addressSet.add(addressKey);
                const existingRow = this.addressTableBody.querySelector(`tr[data-address-key="${addressKey}"]`);
                if (!existingRow) {
                    this.addAddressToTable(
                        point.address,
                        point.lat,
                        point.lng,
                        true,
                        point.returnOnBack,
                        timeFrom,
                        timeTo,
                        packageSettings,
                        deliveryType
                    );
                }
                console.log(`Dodano adres do tabeli: ${point.address} z ID: ${addressKey}, timeFrom: ${timeFrom}, timeTo: ${timeTo}`);
            }
        });

        // Zaktualizuj kolejność w tabeli HTML bez czyszczenia
        this.updateTableOrder();

        // Upewnij się, że wszystkie elementy arrival-time istnieją w DOM
        this.ensureArrivalTimeElementsExist(optimizedRoute);

        console.log('Zaktualizowano tabelę z istniejącymi adresami, elementy arrival-time powinny istnieć');
        console.log('Liczba elementów arrival-time w DOM:', document.querySelectorAll('.arrival-time-text').length);

        // Automatycznie ustaw punkty startowe i końcowe
        if (optimizedRoute.length >= 2) {
            // Ustaw punkt początkowy
            const firstPoint = optimizedRoute[0];
            if (firstPoint.address === 'Aktualna pozycja') {
                this.startPointSelect.value = 'current-location';
            } else {
                const firstPointValue = JSON.stringify({
                    address: firstPoint.address,
                    lat: firstPoint.lat,
                    lng: firstPoint.lng
                });
                this.startPointSelect.value = firstPointValue;
            }

            // Ustaw punkt końcowy
            const lastPoint = optimizedRoute[optimizedRoute.length - 1];
            if (lastPoint.address === 'Aktualna pozycja') {
                this.endPointSelect.value = 'current-location';
            } else {
                const lastPointValue = JSON.stringify({
                    address: lastPoint.address,
                    lat: lastPoint.lat,
                    lng: lastPoint.lng
                });
                this.endPointSelect.value = lastPointValue;
            }
        }

        // Zapisz adresy po aktualizacji
        this.saveAddresses();

        // Zresetuj currentAddressIndex przy aktualizacji tabeli tylko jeśli nie ma trasy w sessionStorage
        const currentRoute = sessionStorage.getItem('currentRoute');
        if (!currentRoute) {
            this.currentAddressIndex = 0;
        }

        // Pokaż numery pozycji
        this.showPositionNumbers();

        // Zaktualizuj wiersze aby były przeciągalne
        this.updateRowsDraggable();
    }

    // Nowa metoda do ustawiania czasu dla adresu
    // Metoda wyświetlająca dialog do edycji czasu
    showTimeEditDialog(addressKey, currentTimeFrom, currentTimeTo) {
        console.log(`Pokazuję dialog edycji czasu dla adresu ${addressKey}`);

        // Sprawdź, czy dialog już istnieje i usuń go
        const existingDialog = document.getElementById('time-edit-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        // Utwórz dialog
        const dialog = document.createElement('div');
        dialog.id = 'time-edit-dialog';
        dialog.className = 'time-edit-dialog';

        // Utwórz nagłówek dialogu
        const header = document.createElement('div');
        header.className = 'dialog-header';
        header.textContent = 'Edytuj czas';

        // Utwórz przycisk zamknięcia
        const closeButton = document.createElement('button');
        closeButton.className = 'dialog-close-button';
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', () => {
            dialog.remove();
        });
        header.appendChild(closeButton);

        // Utwórz zawartość dialogu
        const content = document.createElement('div');
        content.className = 'dialog-content';

        // Pole wyboru godziny OD
        const timeFromLabel = document.createElement('label');
        timeFromLabel.htmlFor = 'dialog-time-from';
        timeFromLabel.className = 'address-time-label';
        timeFromLabel.textContent = 'Godzina od (opcjonalnie):';

        const timeFromInput = document.createElement('input');
        timeFromInput.type = 'time';
        timeFromInput.id = 'dialog-time-from';
        timeFromInput.className = 'address-time-input';
        timeFromInput.value = currentTimeFrom || '';

        // Pole wyboru godziny DO
        const timeToLabel = document.createElement('label');
        timeToLabel.htmlFor = 'dialog-time-to';
        timeToLabel.className = 'address-time-label';
        timeToLabel.textContent = 'Godzina do (opcjonalnie):';

        const timeToInput = document.createElement('input');
        timeToInput.type = 'time';
        timeToInput.id = 'dialog-time-to';
        timeToInput.className = 'address-time-input';
        timeToInput.value = currentTimeTo || '';

        // Przyciski akcji
        const actions = document.createElement('div');
        actions.className = 'dialog-actions';

        const cancelButton = document.createElement('button');
        cancelButton.className = 'dialog-button cancel-button';
        cancelButton.textContent = 'Anuluj';
        cancelButton.addEventListener('click', () => {
            dialog.remove();
        });

        const saveButton = document.createElement('button');
        saveButton.className = 'dialog-button save-button';
        saveButton.textContent = 'Zapisz';
        saveButton.addEventListener('click', () => {
            const newTimeFrom = timeFromInput.value;
            const newTimeTo = timeToInput.value;
            this.setAddressTime(addressKey, newTimeFrom, newTimeTo);
            dialog.remove();

            // Pokaż powiadomienie o sukcesie
            if (typeof Android !== 'undefined' && Android !== null && typeof Android.showToast === 'function') {
                Android.showToast('Czas został zaktualizowany');
            }
        });

        // Dodaj elementy do dialogu
        content.appendChild(timeFromLabel);
        content.appendChild(timeFromInput);
        content.appendChild(timeToLabel);
        content.appendChild(timeToInput);

        actions.appendChild(cancelButton);
        actions.appendChild(saveButton);

        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(actions);

        // Dodaj dialog do dokumentu
        document.body.appendChild(dialog);

        // Pokaż dialog z animacją
        setTimeout(() => {
            dialog.classList.add('visible');
        }, 10);
    }

    // Metoda do ustawiania czasu dla adresu
    setAddressTime(addressKey, timeFrom, timeTo) {
        console.log(`Ustawianie czasu dla adresu ${addressKey}: od ${timeFrom} do ${timeTo}`);

        // Znajdź adres w tablicy adresów
        const addr = this.addresses.find(a => a.id === addressKey);
        if (addr) {
            // Aktualizuj pola timeFrom i timeTo
            addr.timeFrom = timeFrom || '';
            addr.timeTo = timeTo || '';

            // Aktualizuj wyświetlany tekst z czasem
            const timeInfoElement = document.getElementById(`time-info-${addressKey}`);
            if (timeInfoElement) {
                if (timeFrom && timeTo) {
                    timeInfoElement.textContent = `Godzina od–do: ${timeFrom} - ${timeTo}`;
                } else if (timeFrom) {
                    timeInfoElement.textContent = `Godzina od: ${timeFrom}`;
                } else if (timeTo) {
                    timeInfoElement.textContent = `Godzina do: ${timeTo}`;
                } else {
                    timeInfoElement.textContent = 'Godzina od–do: -';
                }
            }

            // Zapisz zmiany
            this.saveAddresses();

            // Zaktualizuj szacunkowe czasy przyjazdu
            if (this.optimizedRoute && this.optimizedRoute.length > 0) {
                this.updateEstimatedArrivalTimes();
            }

            return true;
        }

        return false;
    }

    // Metoda do sprawdzania i naprawiania wyświetlania czasów "od do" dla wszystkich adresów
    ensureAddressTimesAreDisplayed() {
        console.log('=== ensureAddressTimesAreDisplayed START ===');

        // Iteruj przez wszystkie adresy w tablicy
        this.addresses.forEach(addr => {
            const addressKey = addr.id;
            const timeFromStr = addr.timeFrom || '';
            const timeToStr = addr.timeTo || '';

            console.log(`Sprawdzam czasy dla adresu: ${addr.address}`);
            console.log(`ID: ${addressKey}`);
            console.log(`Czas od: ${timeFromStr || 'brak'}`);
            console.log(`Czas do: ${timeToStr || 'brak'}`);

            // Znajdź element z informacją o czasie
            const timeInfoElement = document.getElementById(`time-info-${addressKey}`);
            if (timeInfoElement) {
                console.log(`Znaleziono element time-info dla adresu ${addr.address}`);
                console.log(`Aktualny tekst: "${timeInfoElement.textContent}"`);

                // Aktualizuj tekst informacji o czasie
                if (timeFromStr || timeToStr) {
                    if (timeFromStr && timeToStr) {
                        timeInfoElement.textContent = `Godzina od–do: ${timeFromStr} - ${timeToStr}`;
                    } else if (timeFromStr) {
                        timeInfoElement.textContent = `Godzina od: ${timeFromStr}`;
                    } else if (timeToStr) {
                        timeInfoElement.textContent = `Godzina do: ${timeToStr}`;
                    }
                } else {
                    timeInfoElement.textContent = 'Godzina od–do: -';
                }

                console.log(`Zaktualizowano tekst na: "${timeInfoElement.textContent}"`);
            } else {
                console.warn(`Nie znaleziono elementu time-info dla adresu ${addr.address}`);

                // Znajdź wiersz tabeli dla tego adresu
                const row = this.addressTableBody.querySelector(`tr[data-address-key="${addressKey}"]`);
                if (row) {
                    console.log(`Znaleziono wiersz dla adresu ${addr.address}`);

                    // Znajdź komórkę adresu
                    const addressCell = row.cells[1];
                    if (addressCell) {
                        console.log(`Znaleziono komórkę adresu dla ${addr.address}`);

                        // Znajdź kontener adresu
                        let addressContainer = addressCell.querySelector('.address-container');
                        if (addressContainer) {
                            console.log(`Znaleziono kontener adresu dla ${addr.address}`);

                            // Sprawdź, czy istnieje kontener czasu
                            let timeContainer = addressContainer.querySelector('.address-time-container');
                            if (!timeContainer) {
                                console.log(`Tworzę kontener czasu dla ${addr.address}`);

                                // Utwórz kontener czasu
                                timeContainer = document.createElement('div');
                                timeContainer.className = 'address-time-container';

                                // Utwórz element informacji o czasie
                                const timeInfo = document.createElement('div');
                                timeInfo.className = 'address-time-info';
                                timeInfo.id = `time-info-${addressKey}`;

                                // Ustaw tekst informacji o czasie
                                if (timeFromStr || timeToStr) {
                                    if (timeFromStr && timeToStr) {
                                        timeInfo.textContent = `Godzina od–do: ${timeFromStr} - ${timeToStr}`;
                                    } else if (timeFromStr) {
                                        timeInfo.textContent = `Godzina od: ${timeFromStr}`;
                                    } else if (timeToStr) {
                                        timeInfo.textContent = `Godzina do: ${timeToStr}`;
                                    }
                                } else {
                                    timeInfo.textContent = 'Godzina od–do: -';
                                }

                                timeContainer.appendChild(timeInfo);
                                addressContainer.appendChild(timeContainer);

                                console.log(`Dodano kontener czasu dla ${addr.address}`);
                            }
                        } else {
                            console.warn(`Nie znaleziono kontenera adresu dla ${addr.address}`);
                        }
                    } else {
                        console.warn(`Nie znaleziono komórki adresu dla ${addr.address}`);
                    }
                } else {
                    console.warn(`Nie znaleziono wiersza dla adresu ${addr.address}`);
                }
            }
        });

        console.log('=== ensureAddressTimesAreDisplayed END ===');
    }

    // Metoda do aktualizacji nazwy adresu w istniejącym wierszu tabeli
    updateAddressName(addressKey, newName) {
        console.log(`Aktualizuję nazwę adresu ${addressKey} na "${newName}"`);

        // Znajdź adres w tablicy adresów
        const addr = this.addresses.find(a => a.id === addressKey);
        if (addr) {
            // Zaktualizuj pole favoriteName w tablicy adresów
            addr.favoriteName = newName || '';

            // Znajdź wiersz tabeli
            const row = this.addressTableBody.querySelector(`tr[data-address-key="${addressKey}"]`);
            if (row) {
                // Znajdź element z tekstem adresu
                const addressText = row.querySelector('.address-text');
                if (addressText) {
                    // Zaktualizuj wyświetlany tekst
                    if (newName && newName.trim() !== '') {
                        addressText.textContent = `${addr.address} (${newName})`;
                    } else {
                        addressText.textContent = addr.address;
                    }

                    console.log(`Zaktualizowano tekst adresu w tabeli na: ${addressText.textContent}`);
                    return true;
                }
            }
        }

        return false;
    }

    // Nowa metoda do zapisywania adresów
    saveAddresses() {
        console.log(`[TableManager.saveAddresses] === ROZPOCZĘCIE ZAPISU ADRESÓW ===`);
        console.log(`[TableManager.saveAddresses] Liczba adresów do zapisania: ${this.addresses.length}`);
        console.log(`[TableManager.saveAddresses] Czy Android jest dostępny: ${typeof Android !== 'undefined' && Android !== null}`);

        if (typeof Android !== 'undefined' && Android !== null) {
            try {
                // Upewnij się, że wszystkie adresy mają poprawnie zapisane wszystkie pola
                const addressesToSave = this.addresses.map((addr, index) => {
                    const deliveryType = addr.deliveryType || '';

                    // Przygotuj zdjęcia (max 2, tylko poprawne data:image/jpeg;base64)
                    let photos = [];
                    if (Array.isArray(addr.photos)) {
                        photos = addr.photos
                            .filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,'))
                            .slice(0, 2);
                    }

                    console.log(`[TableManager.saveAddresses] Adres ${index + 1}/${this.addresses.length}: ${addr.address}`);
                    console.log(`[TableManager.saveAddresses]   ID: ${addr.id}`);
                    console.log(`[TableManager.saveAddresses]   deliveryType: "${deliveryType}"`);
                    console.log(`[TableManager.saveAddresses]   timeFrom: "${addr.timeFrom}"`);
                    console.log(`[TableManager.saveAddresses]   timeTo: "${addr.timeTo}"`);
                    console.log(`[TableManager.saveAddresses]   firstOnRoute: ${addr.firstOnRoute}`);
                    console.log(`[TableManager.saveAddresses]   packageSettings: ${addr.packageSettings ? 'ustawione' : 'null'}`);
                    console.log(`[TableManager.saveAddresses]   photosCount: ${photos.length}`);

                    return {
                        ...addr,
                        timeFrom: addr.timeFrom || '',
                        timeTo: addr.timeTo || '',
                        packageSettings: addr.packageSettings || null,
                        deliveryType: deliveryType,
                        firstOnRoute: !!addr.firstOnRoute,
                        // Dodaj pole photos tylko gdy są zdjęcia
                        ...(photos.length > 0 ? { photos } : {})
                    };
                });
                const addressesJson = JSON.stringify(addressesToSave);
                console.log(`[TableManager.saveAddresses] === JSON DO WYSŁANIA ===`);
                console.log(`[TableManager.saveAddresses] Długość JSON: ${addressesJson.length}`);
                console.log(`[TableManager.saveAddresses] Treść JSON:`, addressesJson);
                console.log(`[TableManager.saveAddresses] === WYWOŁYWANIE Android.saveAddresses ===`);
                Android.saveAddresses(addressesJson);
                console.log(`[TableManager.saveAddresses] === Android.saveAddresses WYKONANY ===`);
            } catch (error) {
                console.error(`[TableManager.saveAddresses] BŁĄD PODCZAS ZAPISYWANIA:`, error);
            }
        } else {
            console.warn(`[TableManager.saveAddresses] Android nie jest dostępny - adresy NIE będą zapisane!`);
        }
        console.log(`[TableManager.saveAddresses] === ZAKOŃCZENIE ZAPISU ADRESÓW ===`);
    }

    // Nowa metoda do wczytywania zapisanych adresów
    loadSavedAddresses(addressesJson, retryCount = 0, maxRetries = 10) {
        // Zapobiegnij równoległemu wczytywaniu lub cyklom
        if (this._isLoadingAddresses) {
            console.log(`[TableManager.loadSavedAddresses] -> Wczytywanie już trwa, pomijam`);
            return;
        }

        // Sprawdź czy adresy są już załadowane i zgodne - unikaj niepotrzebnego przeładowania
        try {
            const parsedAddresses = JSON.parse(addressesJson || '[]');
            if (this.addresses.length > 0 && parsedAddresses.length === this.addresses.length) {
                // Sprawdź czy wszystkie adresy już istnieją
                const allExist = parsedAddresses.every(addr => {
                    const key = addr.id || `${addr.address}_${addr.lat}_${addr.lng}`;
                    return this.addressSet.has(key);
                });
                if (allExist) {
                    console.log(`[TableManager.loadSavedAddresses] -> Adresy już są załadowane (${this.addresses.length}), pomijam`);
                    return;
                }
            }
        } catch (e) {
            // Ignoruj błędy parsowania - kontynuuj normalnie
        }

        console.log(`[TableManager.loadSavedAddresses] === ROZPOCZĘCIE WCZYTYWANIA ADRESÓW ===`);
        console.log(`[TableManager.loadSavedAddresses] Próba: ${retryCount + 1}/${maxRetries}`);
        console.log(`[TableManager.loadSavedAddresses] addressesJson typ: ${typeof addressesJson}`);
        console.log(`[TableManager.loadSavedAddresses] addressesJson długość: ${addressesJson ? addressesJson.length : 'null'}`);
        console.log(`[TableManager.loadSavedAddresses] addressesJson treść:`, addressesJson);

        try {
            console.log(`[TableManager.loadSavedAddresses] -> Rozpoczęcie wczytywania zapisanych adresów`);

            // Sprawdź czy nie przekroczono maksymalnej liczby prób
            if (retryCount >= maxRetries) {
                console.error(`[TableManager.loadSavedAddresses] -> Przekroczono maksymalną liczbę prób (${maxRetries}), przerywam wczytywanie adresów`);
                return;
            }

            // Sprawdź czy aplikacja jest w pełni gotowa przed wczytywaniem adresów
            if (!this.isAppFullyLoaded()) {
                console.warn(`[TableManager.loadSavedAddresses] -> Aplikacja nie jest jeszcze w pełni gotowa, opóźniam wczytywanie adresów (próba ${retryCount + 1}/${maxRetries})`);
                // Spróbuj ponownie za 500ms
                setTimeout(() => {
                    this.loadSavedAddresses(addressesJson, retryCount + 1, maxRetries);
                }, 500);
                return;
            }

            // Dodatkowe sprawdzenie czy wszystkie niezbędne elementy DOM są dostępne
            if (!this.addressTableBody || !document.getElementById('address-table')) {
                console.warn(`[TableManager.loadSavedAddresses] -> Elementy DOM nie są jeszcze dostępne, opóźniam wczytywanie adresów (próba ${retryCount + 1}/${maxRetries})`);
                // Spróbuj ponownie za 300ms
                setTimeout(() => {
                    this.loadSavedAddresses(addressesJson, retryCount + 1, maxRetries);
                }, 300);
                return;
            }

            const loadedAddresses = JSON.parse(addressesJson);
            console.log(`[TableManager.loadSavedAddresses] -> Sparsowane adresy | count: ${loadedAddresses.length}`);

            // Ustaw flagę blokującą - zapobiega cyklom saveAddresses/silentOptimizeRoute
            this._isLoadingAddresses = true;

            // Wyczyść istniejące adresy i znaczniki
            this.addresses = [];
            this.addressSet.clear();
            this.addressTableBody.innerHTML = '';

            // Wyczyść istniejące znaczniki z mapy
            if (this.mapManager && this.mapManager.getMap()) {
                this.addressMarkers.forEach((marker) => {
                    this.mapManager.getMap().removeLayer(marker);
                });
            }
            this.addressMarkers.clear();

            this.regenerateSelectOptions(); // Wyczyść i przygotuj selecty

            // Dodaj wczytane adresy
            loadedAddresses.forEach(addr => {
                const addressKey = addr.id || (typeof generateAddressKey === 'function'
                    ? generateAddressKey(addr.address, addr.lat, addr.lng)
                    : `${addr.address}_${addr.lat}_${addr.lng}`);

                console.log(`[TableManager.loadSavedAddresses] === WCZYTYWANIE ADRESU ===`);
                console.log(`[TableManager.loadSavedAddresses] Adres: ${addr.address}`);
                console.log(`[TableManager.loadSavedAddresses] ID: ${addressKey}`);
                console.log(`[TableManager.loadSavedAddresses] Czas od: ${addr.timeFrom || 'brak'}`);
                console.log(`[TableManager.loadSavedAddresses] Czas do: ${addr.timeTo || 'brak'}`);
                console.log(`[TableManager.loadSavedAddresses] Powrót: ${!!addr.returnOnBack}`);
                console.log(`[TableManager.loadSavedAddresses] Typ dostawy: ${addr.deliveryType || ''}`);
                console.log(`[TableManager.loadSavedAddresses] Pierwszy na trasie: ${!!addr.firstOnRoute}`);
                console.log(`[TableManager.loadSavedAddresses] Zdjęcia (count): ${Array.isArray(addr.photos) ? addr.photos.length : 0}`);

                const timeFromStr = addr.timeFrom !== undefined && addr.timeFrom !== null ? String(addr.timeFrom) : '';
                const timeToStr = addr.timeTo !== undefined && addr.timeTo !== null ? String(addr.timeTo) : '';
                const deliveryTypeStr = addr.deliveryType || '';
                const firstOnRouteFlag = !!addr.firstOnRoute;

                this.addAddressToTable(
                    addr.address,
                    addr.lat,
                    addr.lng,
                    false,
                    !!addr.returnOnBack,
                    timeFromStr,
                    timeToStr,
                    addr.packageSettings || null,
                    deliveryTypeStr,
                    firstOnRouteFlag
                );

                const addedAddr = this.addresses.find(a => a.id === addressKey);
                if (addedAddr) {
                    if (addr.packageSettings) {
                        addedAddr.packageSettings = addr.packageSettings;
                        console.log(`[TableManager.loadSavedAddresses] Przywrócono ustawienia paczki:`, addr.packageSettings);
                    }
                    // Przywróć zdjęcia jeśli są
                    if (Array.isArray(addr.photos) && addr.photos.length > 0) {
                        addedAddr.photos = addr.photos
                            .filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,'))
                            .slice(0, 2);
                        console.log(`[TableManager.loadSavedAddresses] Przywrócono ${addedAddr.photos.length} zdjęć`);
                    }

                    console.log(`[TableManager.loadSavedAddresses] Adres dodany do tablicy adresów:`);
                    console.log(`[TableManager.loadSavedAddresses] ID: ${addedAddr.id}`);
                    console.log(`[TableManager.loadSavedAddresses] Czas od: ${addedAddr.timeFrom || 'brak'}`);
                    console.log(`[TableManager.loadSavedAddresses] Czas do: ${addedAddr.timeTo || 'brak'}`);
                    console.log(`[TableManager.loadSavedAddresses] Ustawienia paczki: ${addedAddr.packageSettings ? 'tak' : 'brak'}`);
                    console.log(`[TableManager.loadSavedAddresses] Zdjęcia: ${Array.isArray(addedAddr.photos) ? addedAddr.photos.length : 0}`);
                } else {
                    console.warn(`[TableManager.loadSavedAddresses] Adres nie został dodany do tablicy adresów!`);
                }
            });

            // Nie wycentruj automatycznie mapy na wszystkich adresach po ich załadowaniu
            // Każdy nowo dodany adres będzie centrowany indywidualnie w funkcji addMarker
            // Dzięki temu unikniemy centrowania na wszystkich adresach jednocześnie
            console.log('Załadowano', this.addressMarkers.size, 'adresów bez automatycznego centrowania na wszystkich');

            // Ukryj przyciski przenoszenia po wczytaniu adresów
            this.hidePositionNumbers();

            // Zdejmij flagę blokującą
            this._isLoadingAddresses = false;

            // Zapisz adresy raz po zakończeniu wczytywania wszystkich
            this.saveAddresses();

            // Dodaj opóźnienie i sprawdź, czy czasy "od do" są poprawnie wyświetlane
            setTimeout(() => {
                this.ensureAddressTimesAreDisplayed();
            }, 1000);

            console.log(`[TableManager.loadSavedAddresses] -> Zakończono wczytywanie zapisanych adresów | totalAddresses: ${this.addresses.length}`);
        } catch (error) {
            console.error(`[TableManager.loadSavedAddresses] -> Błąd podczas wczytywania adresów | error: ${error.message}`);
            // Zawsze zdejmij flagę, nawet przy błędzie
            this._isLoadingAddresses = false;
        }
    }

    // Dodaj pole do śledzenia aktualnego adresu (indeks)
    currentAddressIndex = 0;

    // Metoda do regeneracji opcji w selectach po usunięciu adresu
    regenerateSelectOptions() {
        console.log(`[TableManager.regenerateSelectOptions] -> Rozpoczęcie regeneracji opcji w selectach`);

        // Zapamiętaj wybrane wartości
        const selectedStartValue = this.startPointSelect.value;
        const selectedEndValue = this.endPointSelect.value;
        console.log(`[TableManager.regenerateSelectOptions] -> Zapamiętane wartości | start: ${selectedStartValue}, end: ${selectedEndValue}`);

        // Wyczyść obecne opcje (poza domyślnymi)
        this.startPointSelect.innerHTML = `
            <option value="">Wybierz punkt początkowy</option>
            <option value="current-location">Aktualna pozycja</option>
        `;
        this.endPointSelect.innerHTML = `
            <option value="">Wybierz punkt końcowy</option>
            <option value="current-location">Aktualna pozycja</option>
        `;
        console.log(`[TableManager.regenerateSelectOptions] -> Wyczyszczono obecne opcje`);

        // Dodaj ponownie opcje na podstawie aktualnej listy adresów
        this.addresses.forEach(addr => {
            this.updateSelectOptions(addr.address, addr.lat, addr.lng);
        });
        console.log(`[TableManager.regenerateSelectOptions] -> Dodano ponownie opcje | addressesCount: ${this.addresses.length}`);

        // Przywróć poprzednio wybrane wartości, jeśli nadal istnieją
        if (Array.from(this.startPointSelect.options).some(opt => opt.value === selectedStartValue)) {
            this.startPointSelect.value = selectedStartValue;
            console.log(`[TableManager.regenerateSelectOptions] -> Przywrócono wartość startową | value: ${selectedStartValue}`);
        }
        if (Array.from(this.endPointSelect.options).some(opt => opt.value === selectedEndValue)) {
            this.endPointSelect.value = selectedEndValue;
            console.log(`[TableManager.regenerateSelectOptions] -> Przywrócono wartość końcową | value: ${selectedEndValue}`);
        }

        console.log(`[TableManager.regenerateSelectOptions] -> Zakończono regenerację opcji w selectach`);
    }

    // Funkcja do obliczania i wyświetlania szacunkowych godzin przyjazdu
    // durations - macierz czasów przejazdu z OSRM (w sekundach)
    // locationToIndexMap - mapowanie punktu na indeks w macierzy
    // allLocations - lista wszystkich punktów w kolejności macierzy
    calculateAndDisplayArrivalTimes(optimizedRoute, durations, locationToIndexMap, allLocations, startTime = null, stopTimeMinutes = 0) {
        console.log('--- [TableManager] calculateAndDisplayArrivalTimes START ---');
        if (!optimizedRoute || optimizedRoute.length < 2 || !durations || !locationToIndexMap || !allLocations) {
            console.warn('[TableManager] calculateAndDisplayArrivalTimes: Brak danych do obliczenia godzin przyjazdu');
            return;
        }
        if (!startTime) {
            startTime = new Date();
            console.log('[TableManager] Ustawienie czasu rozpoczęcia na teraz:', startTime.toLocaleTimeString());
        }

        // Minimalny czas obsługi na punkcie (minuty) - nawet gdy stopTimeMinutes = 0
        const MIN_SERVICE_TIME_MINUTES = 3;

        // Generuj deterministyczny czas obsługi dla każdego punktu
        // Każdy punkt ma swój unikalny czas obsługi bazujący na adresie i indeksie
        const getServiceTimeMinutes = (address, baseMinutes, pointIndex) => {
            // Hash z adresu + indeks dla deterministycznej wariacji
            let hash = pointIndex * 7919;
            for (let j = 0; j < address.length; j++) {
                hash = ((hash << 5) - hash) + address.charCodeAt(j);
                hash = hash & hash;
            }
            // Wariacja 0-3 minuty dodatkowe
            const variation = (Math.abs(hash) % 100) / 100;
            const extraMinutes = variation * 3;
            // Minimum MIN_SERVICE_TIME_MINUTES nawet gdy baseMinutes = 0
            return Math.max(MIN_SERVICE_TIME_MINUTES, baseMinutes) + extraMinutes;
        };

        let cumulativeSeconds = 0;
        let deliveryIndex = 0; // Licznik punktów dostawy

        // Sprawdź czy punkt początkowy ustawiony w selektorze to "Aktualna pozycja"
        const isStartPointCurrentLocation = this.startPointSelect && this.startPointSelect.value === 'current-location';
        console.log(`[TableManager] Punkt początkowy to "Aktualna pozycja": ${isStartPointCurrentLocation}`);

        // Znajdź punkt startowy (pierwszy element który nie jest "Aktualna pozycja")
        let startPointIndex = -1;
        for (let idx = 0; idx < optimizedRoute.length; idx++) {
            if (optimizedRoute[idx].address !== 'Aktualna pozycja') {
                startPointIndex = idx;
                break;
            }
        }

        // Jeśli punkt początkowy to "Aktualna pozycja", nie wyświetlaj "Start" dla pierwszego rzeczywistego adresu
        if (isStartPointCurrentLocation) {
            startPointIndex = -1; // Ignoruj wyświetlanie "Start"
            console.log('[TableManager] Punkt początkowy to "Aktualna pozycja" - nie będzie wyświetlany "Start"');
        }

        console.log(`[TableManager] Indeks punktu startowego: ${startPointIndex}`);

        for (let i = 0; i < optimizedRoute.length; i++) {
            const point = optimizedRoute[i];
            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(point.address, point.lat, point.lng)
                : `${point.address}_${point.lat}_${point.lng}`;

            console.log(`[TableManager] Analiza punktu ${i}: ${point.address}, klucz: ${addressKey}`);

            // Pomijamy "Aktualna pozycja" w obliczeniach czasu dla tabeli
            if (point.address === 'Aktualna pozycja') {
                console.log('[TableManager] Pomijanie "Aktualna pozycja" w obliczeniach czasu przyjazdu.');
                continue;
            }

            // Znajdź element po ID
            const arrivalTimeElement = document.getElementById(`arrival-time-${addressKey}`);

            if (!arrivalTimeElement) {
                console.warn(`[TableManager] Nie znaleziono elementu arrival-time-${addressKey}`);
            }

            // Punkt startowy trasy - wyświetl "Start" zamiast czasu przyjazdu
            if (i === startPointIndex) {
                console.log('[TableManager] Punkt startowy - wyświetlam "Start".');
                if (arrivalTimeElement) {
                    arrivalTimeElement.textContent = '📍 Start';
                    arrivalTimeElement.style.display = 'block';
                    arrivalTimeElement.classList.remove('arrival-time-ok', 'arrival-time-warning', 'arrival-time-error');
                    arrivalTimeElement.classList.add('arrival-time-start');
                    arrivalTimeElement.setAttribute('data-start', 'true');
                }
                deliveryIndex++;
                continue;
            }

            // Dodaj czas przejazdu od poprzedniego punktu
            const prev = optimizedRoute[i - 1];

            // Czas przejazdu z macierzy
            const fromIdx = locationToIndexMap.get(prev);
            const toIdx = locationToIndexMap.get(point);

            console.log(`[TableManager] Przejazd: ${prev.address} (idx ${fromIdx}) -> ${point.address} (idx ${toIdx})`);

            if (fromIdx !== undefined && toIdx !== undefined &&
                fromIdx >= 0 && toIdx >= 0 &&
                fromIdx < durations.length && toIdx < durations.length &&
                durations[fromIdx] && durations[fromIdx][toIdx] !== undefined) {

                const travelSec = durations[fromIdx][toIdx];
                if (typeof travelSec === 'number' && !isNaN(travelSec) && travelSec >= 0) {
                    cumulativeSeconds += travelSec;
                    console.log(`[TableManager] Dodano ${travelSec}s (${Math.round(travelSec / 60)} min) przejazdu. Suma: ${cumulativeSeconds}s`);
                }
            } else {
                console.warn(`[TableManager] Brak danych w macierzy dla przejazdu ${prev.address} -> ${point.address}`);
            }

            // Czas obsługi poprzedniego punktu (tylko dla punktów dostawy, nie dla punktu startowego)
            const isPrevStartPoint = (i === 1); // Poprzedni punkt to punkt startowy
            if (!isPrevStartPoint && prev.address !== 'Aktualna pozycja' && deliveryIndex > 0) {
                const serviceMinutes = getServiceTimeMinutes(prev.address || '', stopTimeMinutes, deliveryIndex - 1);
                cumulativeSeconds += serviceMinutes * 60;
                console.log(`[TableManager] Dodano ${Math.round(serviceMinutes * 60)}s obsługi punktu. Suma: ${cumulativeSeconds}s`);
            }

            // Oblicz szacunkowy czas przyjazdu
            const arrivalTime = new Date(startTime.getTime() + cumulativeSeconds * 1000);
            const arrivalTimeString = arrivalTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

            // Pobierz widełki czasowe dla adresu
            const timeFrom = point.timeFrom || '';
            const timeTo = point.timeTo || '';
            let inRange = true;

            // Sprawdź czy czas mieści się w widełkach
            if (timeFrom || timeTo) {
                const arrivalMinutes = this.timeToMinutes(arrivalTimeString);

                if (timeFrom && timeTo) {
                    const fromMinutes = this.timeToMinutes(timeFrom);
                    const toMinutes = this.timeToMinutes(timeTo);
                    if (fromMinutes <= toMinutes) {
                        inRange = arrivalMinutes >= fromMinutes && arrivalMinutes <= toMinutes;
                    } else {
                        inRange = arrivalMinutes >= fromMinutes || arrivalMinutes <= toMinutes;
                    }
                } else if (timeFrom) {
                    inRange = arrivalMinutes >= this.timeToMinutes(timeFrom);
                } else if (timeTo) {
                    inRange = arrivalMinutes <= this.timeToMinutes(timeTo);
                }
            }

            // Wyświetl
            if (arrivalTimeElement) {
                arrivalTimeElement.textContent = `~${arrivalTimeString}`;
                arrivalTimeElement.style.display = 'block';
                arrivalTimeElement.classList.remove('arrival-time-start');
                arrivalTimeElement.removeAttribute('data-start');
                console.log(`[TableManager] Zaktualizowano element DOM dla ${addressKey}: ${arrivalTimeString} (W widełkach: ${inRange})`);

                // Ustaw kolor
                arrivalTimeElement.classList.remove('arrival-time-ok', 'arrival-time-warning', 'arrival-time-error');
                if (timeFrom || timeTo) {
                    if (inRange) {
                        arrivalTimeElement.classList.add('arrival-time-ok');
                    } else {
                        arrivalTimeElement.classList.add('arrival-time-warning');
                    }
                }
            }

            // Zwiększ licznik punktów dostawy
            deliveryIndex++;
        }
        console.log('--- [TableManager] calculateAndDisplayArrivalTimes END ---');
    }

    // Funkcja pomocnicza do obliczania odległości między dwoma punktami (wzór Haversine)
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Promień Ziemi w km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c * 1000; // Zwróć w metrach
    }

    // Funkcja do ukrywania wszystkich szacunkowych godzin przyjazdu
    hideAllArrivalTimes() {
        const arrivalTimeElements = document.querySelectorAll('.arrival-time-text');
        arrivalTimeElements.forEach(element => {
            element.style.display = 'none';
        });
    }

    // Funkcja do upewnienia się, że wszystkie elementy arrival-time istnieją w DOM
    ensureArrivalTimeElementsExist(optimizedRoute) {
        console.log('Sprawdzam i tworzę elementy arrival-time dla trasy:', optimizedRoute);

        if (!optimizedRoute || optimizedRoute.length < 2) {
            return;
        }

        optimizedRoute.forEach((point) => {
            if (point.address === 'Aktualna pozycja') {
                return;
            }

            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(point.address, point.lat, point.lng)
                : `${point.address}_${point.lat}_${point.lng}`;
            const arrivalTimeElement = document.getElementById(`arrival-time-${addressKey}`);

            console.log(`Sprawdzam element arrival-time-${addressKey} dla adresu: ${point.address}`);

            // Jeśli element nie istnieje, znajdź odpowiedni wiersz w tabeli i dodaj element
            if (!arrivalTimeElement) {
                console.log(`Element nie istnieje, szukam wiersza dla ${addressKey}`);
                const row = this.addressTableBody.querySelector(`tr[data-address-key="${addressKey}"]`);
                if (row) {
                    console.log(`Znaleziono wiersz, dodaję element arrival-time`);
                    const addressCell = row.cells[1];
                    if (addressCell) {
                        // Sprawdź czy istnieje kontener adresu
                        let addressContainer = addressCell.querySelector('.address-container');
                        if (!addressContainer) {
                            console.log(`Tworzę kontener adresu dla ${point.address}`);

                            // Znajdź adres w tablicy adresów, aby pobrać informacje o czasie
                            const addr = this.addresses.find(a => a.id === addressKey);
                            if (!addr) {
                                console.warn(`Nie znaleziono adresu w tablicy dla ${addressKey}`);
                                return;
                            }

                            // Utwórz kontener adresu
                            addressContainer = document.createElement('div');
                            addressContainer.className = 'address-container';

                            // Przenieś istniejący tekst adresu do nowego kontenera
                            const addressText = document.createElement('div');
                            addressText.className = 'address-text';
                            addressText.textContent = point.address;
                            addressContainer.appendChild(addressText);

                            // Dodaj element czasu przyjazdu
                            const arrivalTimeText = document.createElement('div');
                            arrivalTimeText.className = 'arrival-time-text';
                            arrivalTimeText.id = `arrival-time-${addressKey}`;
                            arrivalTimeText.style.display = 'none';
                            addressContainer.appendChild(arrivalTimeText);

                            // Dodaj kontener czasu
                            const timeContainer = document.createElement('div');
                            timeContainer.className = 'address-time-container';

                            // Dodaj informacje o czasie
                            const timeInfo = document.createElement('div');
                            timeInfo.className = 'address-time-info';
                            timeInfo.id = `time-info-${addressKey}`;

                            // Pobierz wartości czasu z obiektu adresu
                            const timeFromStr = addr.timeFrom || '';
                            const timeToStr = addr.timeTo || '';

                            console.log(`Odtwarzam element time-info dla adresu ${point.address}: timeFrom=${timeFromStr}, timeTo=${timeToStr}`);

                            // Ustaw tekst informacji o czasie
                            if (timeFromStr || timeToStr) {
                                if (timeFromStr && timeToStr) {
                                    timeInfo.textContent = `Godzina od–do: ${timeFromStr} - ${timeToStr}`;
                                } else if (timeFromStr) {
                                    timeInfo.textContent = `Godzina od: ${timeFromStr}`;
                                } else if (timeToStr) {
                                    timeInfo.textContent = `Godzina do: ${timeToStr}`;
                                }
                            } else {
                                timeInfo.textContent = 'Godzina od–do: -';
                            }

                            timeContainer.appendChild(timeInfo);
                            addressContainer.appendChild(timeContainer);

                            // Wyczyść komórkę i dodaj nowy kontener
                            addressCell.innerHTML = '';
                            addressCell.appendChild(addressContainer);
                        }

                        // Sprawdź czy istnieje element arrival-time
                        let arrivalTimeText = addressContainer.querySelector('.arrival-time-text');
                        if (!arrivalTimeText) {
                            console.log(`Tworzę element arrival-time dla ${point.address}`);
                            arrivalTimeText = document.createElement('div');
                            arrivalTimeText.className = 'arrival-time-text';
                            arrivalTimeText.id = `arrival-time-${addressKey}`;
                            arrivalTimeText.style.display = 'none';

                            // Dodaj element na początku kontenera adresu, aby nie zakłócać innych elementów
                            if (addressContainer.firstChild) {
                                addressContainer.insertBefore(arrivalTimeText, addressContainer.firstChild);
                            } else {
                                addressContainer.appendChild(arrivalTimeText);
                            }
                        }
                    }
                } else {
                    console.warn(`Nie znaleziono wiersza dla ${addressKey}`);
                }
            } else {
                console.log(`Element arrival-time już istnieje dla ${point.address}`);
            }
        });
    }

    // Metoda do resetowania indeksu na początek nawigacji
    resetNavigationIndex() {
        // Sprawdź czy pierwszy adres w tabeli to "Aktualna pozycja"
        const rows = this.addressTableBody.querySelectorAll('tr');
        if (rows.length > 0) {
            const firstRowText = rows[0].querySelector('td')?.textContent?.trim();
            if (firstRowText === 'Aktualna pozycja') {
                // Jeśli pierwszy adres to "Aktualna pozycja", zacznij od drugiego adresu
                this.currentAddressIndex = 1;
            } else {
                // Jeśli pierwszy adres to konkretny adres, zacznij od niego
                this.currentAddressIndex = 0;
            }
        } else {
            this.currentAddressIndex = 0;
        }
    }

    // Dodaj metodę do oznaczania aktualnego adresu kolorem
    markCurrentAddress(color) {
        // FUNKCJONALNOŚĆ WYŁĄCZONA: Usunięto funkcjonalność statusów adresów
        console.log(`[TableManager.markCurrentAddress] -> WYŁĄCZONE: Funkcjonalność oznaczania adresów kolorem została usunięta | color: ${color}, currentAddressIndex: ${this.currentAddressIndex}`);

        // Aktualizuj tekst przycisku nawigacji jeśli NavigationManager jest dostępny
        if (window.navigationManager && typeof window.navigationManager.updateNavigationButtonText === 'function') {
            window.navigationManager.updateNavigationButtonText();
        }
    }

    // Dodaj metodę do oznaczania adresu kolorem na podstawie tekstu adresu
    markAddressByText(addressText, color) {
        // FUNKCJONALNOŚĆ WYŁĄCZONA: Usunięto funkcjonalność statusów adresów
        console.log(`[TableManager.markAddressByText] -> WYŁĄCZONE: Funkcjonalność oznaczania adresów kolorem została usunięta | addressText: ${addressText}, color: ${color}`);

        // Aktualizuj tekst przycisku nawigacji jeśli NavigationManager jest dostępny
        if (window.navigationManager && typeof window.navigationManager.updateNavigationButtonText === 'function') {
            window.navigationManager.updateNavigationButtonText();
        }

        return false; // Zwróć false, ponieważ nie znaleziono adresu (funkcjonalność wyłączona)
    }

    // Dodaj metodę do przechodzenia do kolejnego adresu (bez uruchamiania nawigacji)
    goToNextAddress() {
        const rows = this.addressTableBody.querySelectorAll('tr');
        if (rows.length === 0) return false;
        // Przesuń indeks do przodu
        this.currentAddressIndex++;
        if (this.currentAddressIndex >= rows.length) {
            this.currentAddressIndex = rows.length - 1;
            return false; // Koniec listy - wszystkie adresy odwiedzone
        }
        // Nawigacja będzie uruchomiona przez MainActivity po otrzymaniu nowych danych adresu
        return true; // Są jeszcze adresy do odwiedzenia
    }

    // Dodaj metodę do sprawdzania, czy wszystkie adresy zostały odwiedzone
    areAllAddressesVisited() {
        const rows = this.addressTableBody.querySelectorAll('tr');
        return this.currentAddressIndex >= rows.length - 1;
    }

    // Dodaj metodę do pobierania bieżącego adresu jako JSON
    getCurrentAddressJson() {
        if (this.addresses && this.addresses.length > this.currentAddressIndex) {
            const addr = this.addresses[this.currentAddressIndex];
            const result = {
                address: addr.address,
                lat: addr.lat,
                lng: addr.lng
            };

            // Dodaj ustawienia paczki jeśli istnieją
            if (addr.packageSettings) {
                result.packageSettings = addr.packageSettings;
            }

            // Dodaj typ dostawy/odbioru jeśli istnieje
            if (addr.deliveryType) {
                result.deliveryType = addr.deliveryType;
            }

            return JSON.stringify(result);
        }
        return "";
    }

    // Inicjalizacja funkcjonalności "Zaznacz wszystkie"
    initSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        if (!selectAllCheckbox) {
            console.error('Checkbox "Zaznacz wszystkie" nie został znaleziony');
            return;
        }

        // Obsługa kliknięcia w checkbox "Zaznacz wszystkie"
        selectAllCheckbox.addEventListener('change', (event) => {
            const isChecked = event.target.checked;
            this.toggleAllAddresses(isChecked);
        });
    }

    // Metoda do zaznaczania/odznaczania wszystkich adresów
    toggleAllAddresses(isChecked) {
        const checkboxes = this.addressTableBody.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    }

    // Metoda do aktualizacji stanu checkbox "Zaznacz wszystkie" na podstawie zaznaczonych elementów
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        if (!selectAllCheckbox) return;

        // Wybierz checkboxy do usuwania
        const checkboxes = this.addressTableBody.querySelectorAll('input[type="checkbox"]');
        const checkedCheckboxes = this.addressTableBody.querySelectorAll('input[type="checkbox"]:checked');

        if (checkboxes.length === 0) {
            // Brak checkboxów - odznacz "Zaznacz wszystkie"
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCheckboxes.length === checkboxes.length) {
            // Wszystkie checkboxy zaznaczone
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCheckboxes.length > 0) {
            // Częściowo zaznaczone checkboxy
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            // Żadne checkboxy nie zaznaczone
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }

    // Inicjalizacja przycisku resetowania statusów adresów
    initResetStatusButton() {
        // FUNKCJONALNOŚĆ WYŁĄCZONA: Usunięto funkcjonalność statusów adresów
        console.log('[TableManager.initResetStatusButton] -> WYŁĄCZONE: Funkcjonalność resetowania statusów została usunięta');

        // Ukryj przycisk resetowania na stałe
        this.hideResetButton();
    }

    // Funkcja do resetowania statusów wszystkich adresów
    resetAddressStatuses() {
        console.log('Resetuję statusy wszystkich adresów');

        // Wyczyść statusy w Android (UŻYWA DZIAŁAJĄCEJ FUNKCJI KOTLIN!)
        if (typeof Android !== 'undefined' && Android.clearAllAddressStatuses) {
            try {
                Android.clearAllAddressStatuses();
            } catch (e) {
                console.error('Błąd podczas czyszczenia statusów w Android:', e);
            }
        }

        // Wyczyść statusy w JS
        this.addresses.forEach(addr => {
            addr.status = 'BRAK';
            const row = this.addressTableBody.querySelector(`tr[data-address-key="${addr.id}"]`);
            if (row) {
                const statusElement = row.querySelector('.address-status');
                if (statusElement) {
                    statusElement.textContent = '';
                    statusElement.className = 'address-status';
                }
            }
        });

        this.hideResetButton();
        console.log('Zresetowano statusy wszystkich adresów');
    }

    // Funkcja do pokazywania przycisku resetowania
    showResetButton() {
        const resetContainer = document.getElementById('reset-status-container');
        if (resetContainer) {
            resetContainer.style.display = 'block';
        }
    }

    // Funkcja do ukrywania przycisku resetowania
    hideResetButton() {
        const resetContainer = document.getElementById('reset-status-container');
        if (resetContainer) {
            resetContainer.style.display = 'none';
        }
    }

    // Funkcja do sprawdzania czy jakiś adres ma status (jest kolorowany)
    checkForColoredAddresses() {
        // FUNKCJONALNOŚĆ WYŁĄCZONA: Usunięto funkcjonalność statusów adresów
        console.log(`[TableManager.checkForColoredAddresses] -> WYŁĄCZONE: Funkcjonalność sprawdzania kolorowanych adresów została usunięta`);

        // Zawsze ukryj przycisk resetowania, ponieważ nie ma kolorowanych adresów
        this.hideResetButton();

        return false; // Zawsze zwróć false, ponieważ nie ma kolorowanych adresów
    }

    // Gettery
    getAddresses() {
        return this.addresses;
    }

    getStartPointSelect() {
        return this.startPointSelect;
    }

    getEndPointSelect() {
        return this.endPointSelect;
    }

    // Metoda do przeniesienia adresu w górę
    moveAddressUp(addressKey) {
        console.log(`[TableManager] moveAddressUp: Próba przeniesienia adresu w górę. Klucz: ${addressKey}`);
        // Sprawdź czy trasa została zoptymalizowana
        if (!this.isRouteOptimized()) {
            console.log('[TableManager] moveAddressUp: Nie można przenieść adresu w górę - trasa nie została zoptymalizowana');
            return;
        }

        const currentIndex = this.addresses.findIndex(addr => addr.id === addressKey);
        console.log(`[TableManager] moveAddressUp: Aktualny indeks: ${currentIndex}`);

        if (currentIndex <= 0) {
            console.log('[TableManager] moveAddressUp: Adres jest już na początku listy lub nie znaleziono.');
            return;
        }

        // Zamień elementy w tablicy adresów
        console.log(`[TableManager] moveAddressUp: Zamiana adresu z indeksem ${currentIndex} na ${currentIndex - 1}`);
        [this.addresses[currentIndex], this.addresses[currentIndex - 1]] =
            [this.addresses[currentIndex - 1], this.addresses[currentIndex]];

        // Zaktualizuj tabelę HTML
        this.updateTableOrder();

        // Zaktualizuj mapę i znaczniki
        this.updateMapAndMarkers();

        // Zapisz zmiany
        this.saveAddresses();

        // Zaktualizuj szacunkowe czasy przyjazdu po przeniesieniu
        console.log('[TableManager] moveAddressUp: Wywoływanie updateArrivalTimesAfterReorder()...');
        this.updateArrivalTimesAfterReorder();
    }

    // Metoda do przeniesienia adresu w dół
    moveAddressDown(addressKey) {
        console.log(`[TableManager] moveAddressDown: Próba przeniesienia adresu w dół. Klucz: ${addressKey}`);
        // Sprawdź czy trasa została zoptymalizowana
        if (!this.isRouteOptimized()) {
            console.log('[TableManager] moveAddressDown: Nie można przenieść adresu w dół - trasa nie została zoptymalizowana');
            return;
        }

        const currentIndex = this.addresses.findIndex(addr => addr.id === addressKey);
        console.log(`[TableManager] moveAddressDown: Aktualny indeks: ${currentIndex}`);

        if (currentIndex < 0 || currentIndex >= this.addresses.length - 1) {
            console.log('[TableManager] moveAddressDown: Adres jest już na końcu listy lub nie znaleziono.');
            return;
        }

        // Zamień elementy w tablicy adresów
        console.log(`[TableManager] moveAddressDown: Zamiana adresu z indeksem ${currentIndex} na ${currentIndex + 1}`);
        [this.addresses[currentIndex], this.addresses[currentIndex + 1]] =
            [this.addresses[currentIndex + 1], this.addresses[currentIndex]];

        // Zaktualizuj tabelę HTML
        this.updateTableOrder();

        // Zaktualizuj mapę i znaczniki
        this.updateMapAndMarkers();

        // Zapisz zmiany
        this.saveAddresses();

        // Zaktualizuj szacunkowe czasy przyjazdu po przeniesieniu
        console.log('[TableManager] moveAddressDown: Wywoływanie updateArrivalTimesAfterReorder()...');
        this.updateArrivalTimesAfterReorder();
    }

    // Metoda do aktualizacji kolejności w tabeli HTML
    updateTableOrder() {
        const rows = Array.from(this.addressTableBody.querySelectorAll('tr'));

        // Usuń wszystkie wiersze z tabeli
        rows.forEach(row => row.remove());

        // Dodaj wiersze w nowej kolejności
        this.addresses.forEach(addr => {
            // Przekazujemy również timeFrom i timeTo, aby nie znikały przy zmianie kolejności
            this.addAddressToTable(
                addr.address,
                addr.lat,
                addr.lng,
                true,
                addr.returnOnBack,
                addr.timeFrom || '',  // Przekazujemy timeFrom jeśli istnieje
                addr.timeTo || '',    // Przekazujemy timeTo jeśli istnieje
                addr.packageSettings || null,  // Przekazujemy packageSettings jeśli istnieją
                addr.deliveryType || '',  // Przekazujemy deliveryType jeśli istnieje
                addr.firstOnRoute || false  // Przekazujemy firstOnRoute jeśli istnieje
            );
        });

        // Pokaż numery pozycji po odbudowaniu tabeli z aktualizacją widoczności
        this.showPositionNumbers();

        // Zaktualizuj wiersze aby były przeciągalne
        this.updateRowsDraggable();

        // Dodaj opóźnienie i sprawdź, czy czasy "od do" są poprawnie wyświetlane
        setTimeout(() => {
            this.ensureAddressTimesAreDisplayed();
        }, 500);
    }

    // Funkcja pomocnicza do konwersji czasu w formacie "HH:MM" na liczbę minut
    timeToMinutes(timeString) {
        if (!timeString) return 0;

        // Obsługa formatu "HH:MM"
        const parts = timeString.split(':');
        if (parts.length === 2) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            return hours * 60 + minutes;
        }
        return 0;
    }

    /**
     * Asynchronicznie przelicza czasy przyjazdu po każdej zmianie kolejności adresów.
     * Pobiera nową macierz czasów przejazdu z serwera OSRM i wyświetla aktualne godziny przyjazdu.
     * Dzięki temu użytkownik zawsze widzi poprawne czasy po ręcznym przestawieniu adresów.
     */
    async updateArrivalTimesAfterReorder() {
        console.log('=== [TableManager] updateArrivalTimesAfterReorder START ===');
        if (!window.navigationManager) {
            console.warn('[TableManager] updateArrivalTimesAfterReorder: NavigationManager nie jest dostępny - nie można zaktualizować czasów przyjazdu');
            return;
        }

        console.log('[TableManager] updateArrivalTimesAfterReorder: Budowanie trasy z aktualnej kolejności...');
        const newRoute = this.buildRouteFromCurrentOrder();
        if (!newRoute || newRoute.length < 2) {
            console.warn('[TableManager] updateArrivalTimesAfterReorder: Nie można zbudować trasy z aktualnej kolejności (zbyt mało punktów).');
            return;
        }
        console.log('[TableManager] updateArrivalTimesAfterReorder: Liczba punktów w nowej trasie:', newRoute.length);

        this.ensureArrivalTimeElementsExist(newRoute);

        try {
            console.log('[TableManager] updateArrivalTimesAfterReorder: Wywoływanie getCompleteMatrix(newRoute)...');
            // SPRAWDZENIE CZY getCompleteMatrix ISTNIEJE
            if (typeof getCompleteMatrix !== 'function') {
                console.error('[TableManager] BŁĄD: Funkcja getCompleteMatrix NIE JEST ZDEFINIOWANA! To jest przyczyną braku aktualizacji czasów.');
                if (typeof showAndroidNotification === 'function') {
                    showAndroidNotification('Błąd systemowy: Brak funkcji getCompleteMatrix.', 'error');
                }
                return;
            }

            // Pobierz nową macierz czasów przejazdu z serwera (OSRM/MapBox przez proxy PHP)
            const matrixResult = await getCompleteMatrix(newRoute);
            console.log('[TableManager] updateArrivalTimesAfterReorder: Otrzymano wynik z macierzy:', matrixResult);

            if (!matrixResult || !matrixResult.durations) {
                console.error('[TableManager] updateArrivalTimesAfterReorder: Wynik z OSRM nie zawiera pola durations!');
                return;
            }

            const { durations } = matrixResult;

            // Zbuduj mapowanie lokalizacji
            const locationToIndexMap = new Map();
            newRoute.forEach((location, idx) => {
                locationToIndexMap.set(location, idx);
            });
            console.log('[TableManager] updateArrivalTimesAfterReorder: Mapowanie lokalizacji zakończone.');

            // Pobierz aktualny czas stopu z formularza
            let stopTimeMinutes = 0;
            const stopTimeSelect = document.getElementById('stop-time-select');
            if (stopTimeSelect) {
                const parsedValue = parseInt(stopTimeSelect.value, 10);
                stopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
            }
            console.log('[TableManager] updateArrivalTimesAfterReorder: Czas postoju (min):', stopTimeMinutes);

            // Pobierz wybraną godzinę startu dla precyzyjnych obliczeń
            let startTimeForCalc = null;
            const startTimeSelect = document.getElementById('start-time-select');
            if (startTimeSelect && startTimeSelect.value) {
                const [hours, minutes] = startTimeSelect.value.split(':').map(Number);
                const today = new Date();
                startTimeForCalc = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);

                // Jeśli wybrana godzina jest w przeszłości (np. przed chwilą), ustaw na jutro
                if (startTimeForCalc < today) {
                    startTimeForCalc.setDate(startTimeForCalc.getDate() + 1);
                }
                console.log('[TableManager] updateArrivalTimesAfterReorder: Używam wybranej godziny startu:', startTimeSelect.value);
            } else {
                console.log('[TableManager] updateArrivalTimesAfterReorder: Godzina startu nieustawiona (Teraz).');
            }

            // Przelicz i wyświetl czasy przyjazdu
            console.log('[TableManager] updateArrivalTimesAfterReorder: Wywoływanie calculateAndDisplayArrivalTimes()...');
            this.calculateAndDisplayArrivalTimes(
                newRoute,
                durations,
                locationToIndexMap,
                newRoute, // allLocations = newRoute
                startTimeForCalc,
                stopTimeMinutes
            );

            // HISTORIA PRZEJAZDÓW - aktualizuj pointsSnapshot po zmianie pozycji adresu
            if (typeof Android !== 'undefined' && Android.rhUpdatePointsSnapshot) {
                try {
                    const updatedSnapshot = newRoute
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
                    console.log('[RideHistory] Zaktualizowano pointsSnapshot po zmianie pozycji adresu:', updatedSnapshot.length, 'punktów');
                } catch (e) {
                    console.error('[RideHistory] Błąd aktualizacji pointsSnapshot:', e);
                }
            }
        } catch (error) {
            console.error('[TableManager] Błąd podczas pobierania macierzy czasów (getCompleteMatrix):', error);
            // Wyświetl powiadomienie dla użytkownika (jeśli jest taka funkcja)
            if (typeof showAndroidNotification === 'function') {
                showAndroidNotification('Błąd połączenia z serwerem macierzy. Sprawdź internet.', 'error');
            }
        }
        console.log('=== [TableManager] updateArrivalTimesAfterReorder END ===');
    }

    // Nowa metoda do tworzenia mapowania dla zmienionej trasy
    createNewLocationToIndexMap(newRoute, allLocations) {
        const newLocationToIndexMap = new Map();

        console.log('Tworzę nowe mapowanie dla trasy:', newRoute);
        console.log('Oryginalne lokalizacje:', allLocations);

        // Dla każdego punktu w nowej trasie, znajdź odpowiadający mu punkt w allLocations
        newRoute.forEach((newPoint, newIndex) => {
            console.log(`Szukam mapowania dla punktu ${newIndex}: ${newPoint.address} (${newPoint.lat}, ${newPoint.lng})`);

            // Znajdź punkt w allLocations o tych samych współrzędnych
            // Zwiększona tolerancja dla małych różnic w współrzędnych
            const matchingLocation = allLocations.find(location =>
                Math.abs(location.lat - newPoint.lat) < 0.00001 &&
                Math.abs(location.lng - newPoint.lng) < 0.00001
            );

            if (matchingLocation) {
                // Znajdź indeks tego punktu w allLocations
                const originalIndex = allLocations.indexOf(matchingLocation);
                if (originalIndex !== -1) {
                    newLocationToIndexMap.set(newPoint, originalIndex);
                    console.log(`✓ Zmapowano ${newPoint.address} na indeks ${originalIndex}`);
                } else {
                    console.warn(`✗ Nie znaleziono indeksu dla ${newPoint.address}`);
                }
            } else {
                console.warn(`✗ Nie znaleziono pasującego punktu dla ${newPoint.address} (${newPoint.lat}, ${newPoint.lng})`);
                // Sprawdź wszystkie lokalizacje dla debugowania
                allLocations.forEach((loc, idx) => {
                    const latDiff = Math.abs(loc.lat - newPoint.lat);
                    const lngDiff = Math.abs(loc.lng - newPoint.lng);
                    console.log(`  Lokalizacja ${idx}: ${loc.address} (${loc.lat}, ${loc.lng}) - różnica: lat=${latDiff}, lng=${lngDiff}`);
                });
            }
        });

        console.log('Utworzono nowe mapowanie:', newLocationToIndexMap);
        return newLocationToIndexMap;
    }

    // Nowa metoda do budowania trasy z aktualnej kolejności adresów
    buildRouteFromCurrentOrder() {
        const newRoute = [];
        // Pobierz aktualne punkty startowe i końcowe z selectów
        const startPointValue = this.startPointSelect.value;
        const endPointValue = this.endPointSelect.value;
        let useDefaultPoints = false;
        if (!startPointValue || !endPointValue) {
            useDefaultPoints = true;
        }
        // Dodaj punkt początkowy
        if (useDefaultPoints || startPointValue === 'current-location') {
            const currentPos = this.mapManager.getCurrentPosition();
            if (currentPos.lat !== null && currentPos.lng !== null) {
                newRoute.push({
                    address: 'Aktualna pozycja',
                    lat: currentPos.lat,
                    lng: currentPos.lng
                });
            }
        } else {
            try {
                const startPoint = JSON.parse(startPointValue);
                newRoute.push(startPoint);
            } catch (e) {
                console.error('Błąd parsowania punktu początkowego:', e);
                return null;
            }
        }
        // Dodaj punkty pośrednie w nowej kolejności
        this.addresses.forEach(addr => {
            // Pomiń jeśli to punkt startowy lub końcowy (tylko jeśli nie używamy domyślnych punktów)
            if (!useDefaultPoints) {
                const addrKey = `${addr.address}_${addr.lat}_${addr.lng}`;
                if (startPointValue !== 'current-location' && addrKey === startPointValue) {
                    return;
                }
                if (endPointValue !== 'current-location' && addrKey === endPointValue) {
                    return;
                }
            }
            // Dodaj wszystkie istotne pola, w tym timeFrom, timeTo, packageSettings, id i inne ustawienia
            const routeItem = {
                address: addr.address,
                lat: addr.lat,
                lng: addr.lng,
                returnOnBack: addr.returnOnBack,
                timeFrom: addr.timeFrom,
                timeTo: addr.timeTo
            };

            // Zachowaj ID adresu dla poprawnego mapowania ustawień
            const addressKey = `${addr.address}_${addr.lat}_${addr.lng}`;
            if (addr.id || addressKey) {
                routeItem.id = addr.id || addressKey;
            }

            // Zachowaj ustawienia paczki jeśli istnieją
            if (addr.packageSettings) {
                routeItem.packageSettings = addr.packageSettings;
            }

            // Zachowaj typ dostawy
            if (addr.deliveryType) {
                routeItem.deliveryType = addr.deliveryType;
            }

            // Zachowaj informację czy adres jest pierwszy na trasie
            if (addr.firstOnRoute !== undefined) {
                routeItem.firstOnRoute = addr.firstOnRoute;
            }

            // Zachowaj nazwę ulubionego adresu
            if (addr.favoriteName) {
                routeItem.favoriteName = addr.favoriteName;
            }

            // Zachowaj notatki jeśli istnieją
            if (addr.notes && typeof addr.notes === 'string') {
                routeItem.notes = addr.notes;
            }

            // Zachowaj zdjęcia jeśli istnieją (z walidacją base64 JPEG)
            if (Array.isArray(addr.photos) && addr.photos.length > 0) {
                const validatedPhotos = addr.photos
                    .filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,'))
                    .slice(0, 2);
                if (validatedPhotos.length > 0) {
                    routeItem.photos = validatedPhotos;
                }
            }

            newRoute.push(routeItem);
        });
        // Dodaj punkt końcowy
        if (useDefaultPoints || endPointValue === 'current-location') {
            const currentPos = this.mapManager.getCurrentPosition();
            if (currentPos.lat !== null && currentPos.lng !== null) {
                newRoute.push({
                    address: 'Aktualna pozycja',
                    lat: currentPos.lat,
                    lng: currentPos.lng
                });
            }
        } else {
            try {
                const endPoint = JSON.parse(endPointValue);
                newRoute.push(endPoint);
            } catch (e) {
                console.error('Błąd parsowania punktu końcowego:', e);
                return null;
            }
        }
        return newRoute;
    }

    // Metoda do aktualizacji mapy i znaczników po zmianie kolejności
    updateMapAndMarkers() {
        if (!this.mapManager) return;

        // Pobierz aktualne punkty startowe i końcowe z selectów
        const startPointValue = this.startPointSelect.value;
        const endPointValue = this.endPointSelect.value;

        // Znajdź adresy startowe i końcowe w tablicy adresów
        let startAddress = null;
        let endAddress = null;

        if (startPointValue && startPointValue !== 'current-location') {
            startAddress = this.addresses.find(addr =>
                `${addr.address}_${addr.lat}_${addr.lng}` === startPointValue
            );
        }

        if (endPointValue && endPointValue !== 'current-location') {
            endAddress = this.addresses.find(addr =>
                `${addr.address}_${addr.lat}_${addr.lng}` === endPointValue
            );
        }

        // Usuń tylko znaczniki pośrednie (nie startowe i końcowe)
        this.addressMarkers.forEach((marker, addressKey) => {
            const addr = this.addresses.find(a => a.id === addressKey);
            if (addr && addr !== startAddress && addr !== endAddress) {
                if (this.mapManager.getMap()) {
                    this.mapManager.getMap().removeLayer(marker);
                }
                this.addressMarkers.delete(addressKey);
            }
        });

        // Aktualizuj tylko znaczniki pośrednie (zachowując startowe i końcowe)
        let intermediateIndex = 1; // Numeracja zaczyna się od 1 dla punktów pośrednich
        this.addresses.forEach((addr, index) => {
            // Pomiń jeśli to adres startowy lub końcowy
            if (addr === startAddress || addr === endAddress) {
                return;
            }

            // Usuń stary znacznik jeśli istnieje
            if (this.addressMarkers.has(addr.id)) {
                const oldMarker = this.addressMarkers.get(addr.id);
                if (this.mapManager.getMap()) {
                    this.mapManager.getMap().removeLayer(oldMarker);
                }
            }

            // Utwórz nowy numerowany znacznik dla punktu pośredniego
            const marker = this.mapManager.createNumberedMarker(addr.lat, addr.lng, intermediateIndex);
            marker.bindPopup(addr.address);
            marker.addTo(this.mapManager.getMap());
            this.addressMarkers.set(addr.id, marker);

            // Zwiększ indeks dla następnego punktu pośredniego
            intermediateIndex++;
        });

        // WAŻNE: Aktualizuj trasę na mapie z nową kolejnością adresów
        this.updateRouteAfterReorder();

        // Usunięto automatyczne centrowanie mapy po zmianie kolejności adresów
        // (wcześniej było tutaj wywołanie centerMapOnAllAddresses)
    }

    // Nowa metoda do aktualizacji trasy po przeniesieniu adresów
    updateRouteAfterReorder() {
        // Sprawdź czy NavigationManager jest dostępny
        if (!window.navigationManager) {
            console.warn('NavigationManager nie jest dostępny - nie można zaktualizować trasy');
            return;
        }

        const navigationManager = window.navigationManager;

        // Pobierz aktualne punkty startowe i końcowe
        const startPointValue = this.startPointSelect.value;
        const endPointValue = this.endPointSelect.value;

        // Jeśli nie ma wybranych punktów, użyj domyślnych wartości
        let useDefaultPoints = false;
        if (!startPointValue || !endPointValue) {
            useDefaultPoints = true;
        }

        // Przygotuj nową trasę z aktualną kolejnością adresów
        const newRoute = [];

        // Dodaj punkt początkowy
        if (useDefaultPoints || startPointValue === 'current-location') {
            const currentPos = this.mapManager.getCurrentPosition();
            if (currentPos.lat !== null && currentPos.lng !== null) {
                newRoute.push({
                    address: 'Aktualna pozycja',
                    lat: currentPos.lat,
                    lng: currentPos.lng
                });
            }
        } else {
            try {
                const startPoint = JSON.parse(startPointValue);
                newRoute.push(startPoint);
            } catch (e) {
                console.error('Błąd parsowania punktu początkowego:', e);
                return;
            }
        }

        // Dodaj punkty pośrednie w nowej kolejności
        this.addresses.forEach(addr => {
            // Pomiń jeśli to punkt startowy lub końcowy (tylko jeśli nie używamy domyślnych punktów)
            if (!useDefaultPoints) {
                const addrKey = `${addr.address}_${addr.lat}_${addr.lng}`;
                if (startPointValue !== 'current-location' && addrKey === startPointValue) {
                    return;
                }
                if (endPointValue !== 'current-location' && addrKey === endPointValue) {
                    return;
                }
            }

            // Dodaj wszystkie istotne pola, w tym timeFrom, timeTo, packageSettings, id i inne ustawienia
            const routeItem = {
                address: addr.address,
                lat: addr.lat,
                lng: addr.lng,
                returnOnBack: addr.returnOnBack,
                timeFrom: addr.timeFrom,
                timeTo: addr.timeTo
            };

            // Zachowaj ID adresu dla poprawnego mapowania ustawień
            const addressKey = `${addr.address}_${addr.lat}_${addr.lng}`;
            if (addr.id || addressKey) {
                routeItem.id = addr.id || addressKey;
            }

            // Zachowaj ustawienia paczki jeśli istnieją
            if (addr.packageSettings) {
                routeItem.packageSettings = addr.packageSettings;
            }

            // Zachowaj typ dostawy
            if (addr.deliveryType) {
                routeItem.deliveryType = addr.deliveryType;
            }

            // Zachowaj informację czy adres jest pierwszy na trasie
            if (addr.firstOnRoute !== undefined) {
                routeItem.firstOnRoute = addr.firstOnRoute;
            }

            // Zachowaj nazwę ulubionego adresu
            if (addr.favoriteName) {
                routeItem.favoriteName = addr.favoriteName;
            }

            // Zachowaj notatki jeśli istnieją
            if (addr.notes && typeof addr.notes === 'string') {
                routeItem.notes = addr.notes;
            }

            // Zachowaj zdjęcia jeśli istnieją (z walidacją base64 JPEG)
            if (Array.isArray(addr.photos) && addr.photos.length > 0) {
                const validatedPhotos = addr.photos
                    .filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,'))
                    .slice(0, 2);
                if (validatedPhotos.length > 0) {
                    routeItem.photos = validatedPhotos;
                }
            }

            newRoute.push(routeItem);
        });

        // Dodaj punkt końcowy
        if (useDefaultPoints || endPointValue === 'current-location') {
            const currentPos = this.mapManager.getCurrentPosition();
            if (currentPos.lat !== null && currentPos.lng !== null) {
                newRoute.push({
                    address: 'Aktualna pozycja',
                    lat: currentPos.lat,
                    lng: currentPos.lng
                });
            }
        } else {
            try {
                const endPoint = JSON.parse(endPointValue);
                newRoute.push(endPoint);
            } catch (e) {
                console.error('Błąd parsowania punktu końcowego:', e);
                return;
            }
        }

        // Zaktualizuj dane w NavigationManager
        navigationManager.optimizedRouteData = newRoute;

        // Zapisz nową trasę za pomocą StorageManager
        if (typeof window.storageManager !== 'undefined') {
            window.storageManager.saveOptimizedRoute(
                JSON.stringify(newRoute),
                JSON.stringify(navigationManager.optimizationResult || {
                    optimizedDistance: 0,
                    route: newRoute
                })
            );
        } else {
            // Fallback do sessionStorage jeśli StorageManager nie jest dostępny
            try {
                sessionStorage.setItem('optimizedRouteData', JSON.stringify(newRoute));
            } catch (e) {
                console.warn('Nie można zapisać trasy w sessionStorage:', e);
            }
        }

        // Narysuj nową trasę na mapie
        if (this.mapManager && typeof this.mapManager.drawRoute === 'function') {
            this.mapManager.drawRoute(newRoute, false).then(roadDistance => {
                // Aktualizuj informacje o trasie
                if (navigationManager && typeof navigationManager.displayRouteInfo === 'function') {
                    // Przygotuj dane optymalizacji (uproszczone)
                    const optimizationResult = {
                        optimizedDistance: roadDistance || 0,
                        route: newRoute
                    };
                    // Pobierz aktualny czas stopu z interfejsu
                    let stopTimeMinutes = 5; // Wartość domyślna
                    const stopTimeSelect = document.getElementById('stop-time-select');
                    if (stopTimeSelect) {
                        const parsedValue = parseInt(stopTimeSelect.value, 10);
                        stopTimeMinutes = !isNaN(parsedValue) ? parsedValue : 0;
                    }
                    navigationManager.displayRouteInfo(optimizationResult, roadDistance, newRoute.length, stopTimeMinutes);
                }

                // Zaktualizuj dane w trwałym magazynie z rzeczywistą odległością
                if (typeof window.storageManager !== 'undefined') {
                    window.storageManager.saveOptimizedRoute(
                        JSON.stringify(newRoute),
                        JSON.stringify({
                            optimizedDistance: roadDistance || 0,
                            route: newRoute
                        })
                    );
                } else {
                    // Fallback do sessionStorage jeśli StorageManager nie jest dostępny
                    try {
                        sessionStorage.setItem('optimizedRouteData', JSON.stringify(newRoute));
                    } catch (e) {
                        console.warn('Błąd podczas aktualizacji trasy w trwałym magazynie:', e);
                    }
                }

                // Zaktualizuj pływające okienko jeśli nawigacja jest aktywna
                this.updateOverlayAfterReorder(newRoute);
            }).catch(error => {
                console.error('Błąd podczas rysowania trasy:', error);
            });
        } else {
            console.warn('MapManager lub funkcja drawRoute nie jest dostępna');
        }
    }

    // Nowa metoda do aktualizacji pływającego okienka po przeniesieniu adresów
    updateOverlayAfterReorder(newRoute) {
        // Sprawdź czy nawigacja jest aktywna (czy jest zapisany indeks trasy)
        const currentRouteIndex = sessionStorage.getItem('currentRouteIndex');
        if (!currentRouteIndex || currentRouteIndex === 'null' || currentRouteIndex === 'undefined') {
            return; // Nawigacja nie jest aktywna
        }

        const routeIndex = parseInt(currentRouteIndex);
        if (isNaN(routeIndex) || routeIndex < 0 || routeIndex >= newRoute.length) {
            console.warn('Nieprawidłowy indeks trasy:', routeIndex, 'dla trasy o długości:', newRoute.length);
            return;
        }

        // Pobierz aktualny adres z nowej trasy
        const currentAddress = newRoute[routeIndex];
        if (!currentAddress) {
            console.warn('Nie można znaleźć adresu dla indeksu:', routeIndex);
            return;
        }

        // Przygotuj dane do wysłania w broadcast
        const broadcastData = {
            action: 'ACTION_UPDATE_OVERLAY_ADDRESS',
            address: currentAddress.address,
            latitude: currentAddress.lat,
            longitude: currentAddress.lng
        };

        // Wyślij broadcast do aktualizacji pływającego okienka
        if (typeof Android !== 'undefined' && Android !== null && typeof Android.sendBroadcast === 'function') {
            try {
                Android.sendBroadcast(JSON.stringify(broadcastData));
            } catch (error) {
                console.error('Błąd podczas wysyłania broadcast:', error);
            }
        } else {
            console.warn('Android interface lub sendBroadcast nie jest dostępny');
        }
    }

    // Metoda do pokazania przycisków przenoszenia (po optymalizacji)
    showPositionNumbers() {
        const positionCells = this.addressTableBody.querySelectorAll('.position-number-cell');

        positionCells.forEach((cell) => {
            cell.style.display = 'table-cell';

            const row = cell.closest('tr');
            if (!row) return;

            const addressKey = row.dataset.addressKey || row.getAttribute('data-address-key');
            if (!addressKey) return;

            const addressIndex = this.addresses.findIndex(addr => addr.id === addressKey);

            const positionButton = cell.querySelector('.position-number-button');
            if (positionButton) {
                // Ustaw numer pozycji (indeks + 1)
                positionButton.textContent = (addressIndex + 1).toString();
            }
        });

        // Pokaż nagłówek dla kolumny pozycji
        const positionHeader = this.addressTableBody.closest('table').querySelector('th.position-header');
        if (positionHeader) {
            positionHeader.style.display = 'table-cell';
        }

        // Zaktualizuj wiersze aby były przeciągalne
        this.updateRowsDraggable();
    }

    // Metoda do ukrycia numerów pozycji
    hidePositionNumbers() {
        const positionCells = this.addressTableBody.querySelectorAll('.position-number-cell');
        positionCells.forEach(cell => {
            cell.style.display = 'none';
        });

        // Ukryj nagłówek dla kolumny pozycji
        const positionHeader = this.addressTableBody.closest('table').querySelector('th.position-header');
        if (positionHeader) {
            positionHeader.style.display = 'none';
        }

        // Zaktualizuj wiersze aby nie były przeciągalne
        this.updateRowsDraggable();
    }

    // Funkcja wyświetlająca selektor pozycji dla danego adresu
    showPositionSelector(addressKey) {
        // Sprawdź czy trasa została zoptymalizowana
        if (!this.isRouteOptimized()) {
            alert('Aby zmienić pozycję adresu, najpierw zoptymalizuj trasę.');
            return;
        }

        // Znajdź aktualną pozycję adresu
        const currentIndex = this.addresses.findIndex(addr => addr.id === addressKey);
        if (currentIndex === -1) {
            console.error('Nie znaleziono adresu o kluczu:', addressKey);
            return;
        }

        // Utwórz dialog z listą pozycji
        const dialog = document.createElement('div');
        dialog.className = 'position-selector-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #007bff;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 10000;
            max-height: 80vh;
            max-width: 90vw;
            width: 450px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

        // Dodaj tytuł
        const title = document.createElement('h3');
        title.textContent = 'Wybierz nową pozycję:';
        title.style.cssText = 'margin: 0 0 15px 0; color: #333; text-align: center;';
        dialog.appendChild(title);

        // Dodaj informację o aktualnej pozycji
        const currentInfo = document.createElement('p');
        currentInfo.textContent = `Aktualna pozycja: ${currentIndex + 1}`;
        currentInfo.style.cssText = 'margin: 0 0 15px 0; color: #666; text-align: center; font-weight: bold;';
        dialog.appendChild(currentInfo);

        // Dodaj pole wyszukiwania jeśli jest więcej niż 5 adresów
        let searchInput = null;
        if (this.addresses.length > 5) {
            const searchContainer = document.createElement('div');
            searchContainer.style.cssText = 'margin-bottom: 15px;';

            searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Wyszukaj adres...';
            searchInput.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                font-size: 14px;
                box-sizing: border-box;
                outline: none;
                transition: border-color 0.2s;
            `;

            // Dodaj efekt focus
            searchInput.addEventListener('focus', () => {
                searchInput.style.borderColor = '#007bff';
            });

            searchInput.addEventListener('blur', () => {
                searchInput.style.borderColor = '#ddd';
            });

            searchContainer.appendChild(searchInput);
            dialog.appendChild(searchContainer);
        }

        // Utwórz listę pozycji jako scrollowalną listę
        const positionList = document.createElement('div');
        positionList.style.cssText = `
            display: flex; 
            flex-direction: column; 
            gap: 4px;
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 8px;
            background: #fafafa;
            flex: 1;
        `;

        // Tablica wszystkich elementów pozycji dla wyszukiwania
        const allPositionItems = [];

        // Dodaj opcje pozycji z adresami
        for (let i = 0; i < this.addresses.length; i++) {
            if (i === currentIndex) continue; // Pomiń aktualną pozycję

            const positionItem = document.createElement('div');
            positionItem.style.cssText = `
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                flex-direction: column;
                gap: 4px;
            `;

            // Numer pozycji
            const positionNumber = document.createElement('div');
            positionNumber.textContent = `Pozycja ${i + 1}`;
            positionNumber.style.cssText = `
                font-weight: bold;
                color: #007bff;
                font-size: 14px;
            `;

            // Adres
            const addressText = document.createElement('div');
            const address = this.addresses[i];
            addressText.textContent = address.address || 'Nieznany adres';
            addressText.style.cssText = `
                color: #333;
                font-size: 13px;
                word-wrap: break-word;
                line-height: 1.3;
            `;

            // Dodaj informacje o czasie jeśli są dostępne
            if (address.timeFrom || address.timeTo) {
                const timeInfo = document.createElement('div');
                const timeText = [];
                if (address.timeFrom) timeText.push(`od ${address.timeFrom}`);
                if (address.timeTo) timeText.push(`do ${address.timeTo}`);
                timeInfo.textContent = `⏰ ${timeText.join(' ')}`;
                timeInfo.style.cssText = `
                    color: #666;
                    font-size: 11px;
                    font-style: italic;
                `;
                positionItem.appendChild(timeInfo);
            }

            positionItem.appendChild(positionNumber);
            positionItem.appendChild(addressText);

            // Dodaj efekt hover
            positionItem.addEventListener('mouseenter', () => {
                positionItem.style.background = '#e3f2fd';
                positionItem.style.borderColor = '#007bff';
                positionItem.style.transform = 'translateY(-1px)';
                positionItem.style.boxShadow = '0 2px 8px rgba(0,123,255,0.2)';
            });

            positionItem.addEventListener('mouseleave', () => {
                positionItem.style.background = 'white';
                positionItem.style.borderColor = '#ddd';
                positionItem.style.transform = 'translateY(0)';
                positionItem.style.boxShadow = 'none';
            });

            // Dodaj obsługę kliknięcia
            positionItem.addEventListener('click', () => {
                this.moveAddressToPosition(addressKey, i);
                document.body.removeChild(dialog);
                document.body.removeChild(overlay);
            });

            // Dodaj element do tablicy dla wyszukiwania
            allPositionItems.push({
                element: positionItem,
                address: address.address || '',
                position: i + 1
            });

            positionList.appendChild(positionItem);
        }

        // Dodaj funkcjonalność wyszukiwania
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();

                allPositionItems.forEach(item => {
                    const addressMatch = item.address.toLowerCase().includes(searchTerm);
                    const positionMatch = item.position.toString().includes(searchTerm);

                    if (searchTerm === '' || addressMatch || positionMatch) {
                        item.element.style.display = 'flex';
                    } else {
                        item.element.style.display = 'none';
                    }
                });

                // Sprawdź czy są widoczne elementy
                const visibleItems = allPositionItems.filter(item =>
                    item.element.style.display !== 'none'
                );

                // Pokaż komunikat jeśli brak wyników
                let noResultsMsg = positionList.querySelector('.no-results-message');
                if (visibleItems.length === 0 && searchTerm !== '') {
                    if (!noResultsMsg) {
                        noResultsMsg = document.createElement('div');
                        noResultsMsg.className = 'no-results-message';
                        noResultsMsg.textContent = 'Nie znaleziono pasujących adresów';
                        noResultsMsg.style.cssText = `
                            text-align: center;
                            color: #666;
                            font-style: italic;
                            padding: 20px;
                        `;
                        positionList.appendChild(noResultsMsg);
                    }
                    noResultsMsg.style.display = 'block';
                } else if (noResultsMsg) {
                    noResultsMsg.style.display = 'none';
                }
            });
        }

        dialog.appendChild(positionList);

        // Dodaj przycisk anuluj
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Anuluj';
        cancelButton.style.cssText = `
            margin-top: 15px;
            padding: 8px 20px;
            border: 1px solid #6c757d;
            border-radius: 4px;
            background: #6c757d;
            color: white;
            cursor: pointer;
            width: 100%;
        `;

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
        });

        dialog.appendChild(cancelButton);

        // Utwórz overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        `;

        // Dodaj obsługę kliknięcia na overlay
        overlay.addEventListener('click', () => {
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
        });

        // Dodaj do DOM
        document.body.appendChild(overlay);
        document.body.appendChild(dialog);
    }

    // Funkcja przenoszenia adresu na określoną pozycję
    moveAddressToPosition(addressKey, newPosition) {
        // Znajdź aktualną pozycję adresu
        const currentIndex = this.addresses.findIndex(addr => addr.id === addressKey);
        if (currentIndex === -1) {
            console.error('Nie znaleziono adresu o kluczu:', addressKey);
            return;
        }

        // Usuń adres z aktualnej pozycji
        const addressToMove = this.addresses.splice(currentIndex, 1)[0];

        // Wstaw adres na nową pozycję
        this.addresses.splice(newPosition, 0, addressToMove);

        // Aktualizuj kolejność w tabeli HTML
        this.updateTableOrder();

        // Aktualizuj mapę i znaczniki
        this.updateMapAndMarkers();

        // Zapisz zmiany
        this.saveAddresses();

        // Aktualizuj szacunkowe czasy przyjazdu
        this.updateArrivalTimesAfterReorder();

        console.log(`Adres ${addressKey} został przeniesiony na pozycję ${newPosition + 1}`);
    }

    // Metoda sprawdzająca czy aplikacja jest w pełni załadowana
    isAppFullyLoaded() {
        // Sprawdź czy wszystkie kluczowe komponenty są dostępne i zainicjalizowane
        const hasOptiDrogApp = window.optiDrogApp &&
            window.optiDrogApp.mapManager &&
            window.optiDrogApp.tableManager &&
            window.optiDrogApp.navigationManager;

        // Sprawdź czy mapa jest zainicjalizowana
        const hasMap = this.mapManager &&
            this.mapManager.map &&
            typeof this.mapManager.addMarker === 'function';

        // Sprawdź czy nie trwa obecnie ładowanie trasy z sessionStorage
        const isLoadingRoute = sessionStorage.getItem('loadRouteId') !== null;

        // Sprawdź czy ładowanie trasy nie trwa zbyt długo (powyżej 10 sekund)
        const loadRouteTimestamp = sessionStorage.getItem('loadRouteTimestamp');
        const isLoadingTooLong = loadRouteTimestamp &&
            (Date.now() - parseInt(loadRouteTimestamp)) > 10000;

        // Sprawdź czy nie ma aktywnej operacji ładowania trasy
        const isWaitingForRouteLoad = document.querySelector('.loading-overlay') !== null;

        // Sprawdź czy wszystkie skrypty są załadowane
        const hasRequiredClasses = typeof MapManager !== 'undefined' &&
            typeof NavigationManager !== 'undefined' &&
            typeof RouteStorage !== 'undefined';

        // Dodatkowe sprawdzenie - czy nie ma aktywnego procesu optymalizacji
        const isOptimizing = document.getElementById('optimize-route') &&
            document.getElementById('optimize-route').disabled &&
            document.getElementById('optimize-route').textContent.includes('...');

        // Jeśli ładowanie trwa zbyt długo, wyczyść flagę
        if (isLoadingTooLong) {
            console.warn('Ładowanie trasy trwa zbyt długo, czyszczę flagę');
            sessionStorage.removeItem('loadRouteId');
            sessionStorage.removeItem('loadRouteTimestamp');
            // Po wyczyszczeniu flag, sprawdź ponownie status ładowania
            const isLoadingRouteAfterCleanup = sessionStorage.getItem('loadRouteId') !== null;
            return hasOptiDrogApp &&
                hasMap &&
                !isLoadingRouteAfterCleanup &&
                !isWaitingForRouteLoad &&
                hasRequiredClasses &&
                !isOptimizing;
        }

        console.log('Sprawdzanie stanu aplikacji:', {
            hasOptiDrogApp,
            hasMap,
            isLoadingRoute,
            isLoadingTooLong,
            isWaitingForRouteLoad,
            hasRequiredClasses,
            isOptimizing,
            loadRouteTimestamp: loadRouteTimestamp ? new Date(parseInt(loadRouteTimestamp)).toLocaleTimeString() : 'brak'
        });

        // Aplikacja jest gotowa jeśli wszystkie komponenty są dostępne,
        // nie trwa ładowanie trasy i nie ma aktywnej optymalizacji
        return hasOptiDrogApp &&
            hasMap &&
            !isLoadingRoute &&
            !isLoadingTooLong &&
            !isWaitingForRouteLoad &&
            hasRequiredClasses &&
            !isOptimizing;
    }

    // Metoda do sprawdzania czy trasa została zoptymalizowana
    isRouteOptimized() {
        // Sprawdź czy NavigationManager jest dostępny i ma zoptymalizowaną trasę
        if (window.navigationManager &&
            window.navigationManager.optimizedRouteData &&
            window.navigationManager.optimizedRouteData.length > 0) {
            return true;
        }
        return false;
    }

    // Metoda do aktualizacji stanu przycisku optymalizacji
    updateOptimizeButtonState() {
        // Sprawdź czy NavigationManager jest dostępny i ma funkcję sprawdzania przycisku
        if (window.navigationManager &&
            typeof window.navigationManager.checkOptimizeButton === 'function') {
            // Wywołaj funkcję sprawdzania przycisku optymalizacji
            window.navigationManager.checkOptimizeButton();
        } else {
            console.warn('NavigationManager lub funkcja checkOptimizeButton nie jest dostępna');
        }
    }

    /**
     * Zoptymalizowana metoda czyszczenia wszystkich danych aplikacji
     * Korzysta z nowej metody clearAllAppData w Kotlin
     */
    clearAllAppData() {
        try {
            // Sprawdź czy Android WebAppInterface jest dostępny
            if (typeof Android !== 'undefined' && Android.clearAllAppData) {
                // Wywołaj zoptymalizowaną metodę Kotlin
                const success = Android.clearAllAppData();

                if (success) {
                    console.log('Wszystkie dane aplikacji zostały pomyślnie wyczyszczone');

                    // Wyczyść lokalne dane JavaScript
                    this.addresses = [];
                    this.addressSet.clear();

                    // Wyczyść tabelę adresów
                    if (this.addressTableBody) {
                        this.addressTableBody.innerHTML = '';
                    }

                    // Zresetuj selektory punktów
                    this.regenerateSelectOptions();

                    // Ukryj numery pozycji i przyciski
                    this.hidePositionNumbers();
                    this.hideResetButton();

                    // Aktualizuj stan przycisku optymalizacji
                    this.updateOptimizeButtonState();

                    // Wyczyść mapę jeśli dostępna
                    if (this.mapManager) {
                        this.mapManager.clearAllMarkersExceptCurrentLocation();
                        this.mapManager.clearRoute();
                    }

                    // Wyczyść dane nawigacji jeśli dostępne
                    if (window.navigationManager) {
                        window.navigationManager.clearNavigationData();
                    }

                    return true;
                } else {
                    console.error('Błąd podczas czyszczenia danych aplikacji');
                    return false;
                }
            } else {
                console.error('Android WebAppInterface nie jest dostępny');
                return false;
            }
        } catch (error) {
            console.error('Błąd podczas wywoływania clearAllAppData:', error);
            return false;
        }
    }

    // === FUNKCJONALNOŚĆ PRZECIĄGANIA (DRAG AND DROP) ===

    // Inicjalizacja funkcjonalności przeciągania dla wierszy tabeli
    initializeDragAndDrop() {
        const tableBody = document.getElementById('addressesTableBody') || this.addressTableBody;
        if (!tableBody) {
            console.warn('Nie znaleziono ciała tabeli do inicjalizacji przeciągania');
            return;
        }

        // Dodaj event listeners dla tabeli
        tableBody.addEventListener('dragstart', this.handleDragStart.bind(this));
        tableBody.addEventListener('dragover', this.handleDragOver.bind(this));
        tableBody.addEventListener('drop', this.handleDrop.bind(this));
        tableBody.addEventListener('dragend', this.handleDragEnd.bind(this));
        tableBody.addEventListener('dragenter', this.handleDragEnter.bind(this));
        tableBody.addEventListener('dragleave', this.handleDragLeave.bind(this));

        console.log('Zainicjalizowano funkcjonalność przeciągania dla tabeli');
    }

    // Aktualizuje wiersze aby były przeciągalne
    updateRowsDraggable() {
        const tableBody = document.getElementById('addressesTableBody') || this.addressTableBody;
        if (!tableBody) return;

        const rows = tableBody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            // Pomijaj wiersz nagłówka
            if (row.parentElement.tagName === 'THEAD') return;

            // Wiersze są przeciągalne tylko po optymalizacji trasy
            if (this.isRouteOptimized()) {
                row.draggable = true;
                row.dataset.index = index;

                // Dodaj klasę dla stylizacji
                row.classList.add('draggable-row');

                // Znajdź komórkę z numerem pozycji i dodaj ikonę przeciągania
                const positionCell = row.querySelector('.position-number-cell');
                if (positionCell) {
                    // Dodaj ikonę przeciągania
                    if (!positionCell.querySelector('.drag-icon')) {
                        const dragIcon = document.createElement('span');
                        dragIcon.className = 'drag-icon';
                        dragIcon.innerHTML = '⋮⋮';
                        dragIcon.style.cssText = `
                            cursor: grab;
                            color: #666;
                            font-size: 12px;
                            margin-right: 5px;
                            user-select: none;
                            display: inline-block;
                            vertical-align: middle;
                        `;
                        const positionButton = positionCell.querySelector('.position-number-button');
                        if (positionButton) {
                            positionButton.style.display = 'inline-flex';
                            positionButton.style.alignItems = 'center';
                            positionButton.insertBefore(dragIcon, positionButton.firstChild);
                        }
                    }
                }
            } else {
                // Wyłącz przeciąganie jeśli trasa nie jest zoptymalizowana
                row.draggable = false;
                row.classList.remove('draggable-row');

                // Usuń ikonę przeciągania
                const dragIcon = row.querySelector('.drag-icon');
                if (dragIcon) {
                    dragIcon.remove();
                }
            }
        });
    }

    // Obsługa rozpoczęcia przeciągania
    handleDragStart(e) {
        // Upewnij się, że przeciągany element to wiersz tabeli
        if (e.target.tagName !== 'TR') return;

        // Sprawdź czy trasa jest zoptymalizowana – jeśli nie, blokujemy przeciąganie
        if (!this.isRouteOptimized()) {
            e.preventDefault();
            return;
        }

        const draggedRow = e.target;
        draggedRow.classList.add('dragging');

        // Zachowaj oryginalny indeks przeciąganego wiersza (potrzebny do obliczenia przesunięcia)
        this.dragOriginalIndex = parseInt(draggedRow.dataset.index);

        // Ustaw typ operacji na "move"
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedRow.dataset.index);

        // Utwórz wiersz placeholder (miejsce docelowe) – na początku nie wstawiamy go do DOM
        this.placeholderRow = document.createElement('tr');
        this.placeholderRow.className = 'drag-placeholder';
        // Tworzymy jedną komórkę obejmującą cały wiersz aby wizualnie zaznaczyć miejsce
        const colSpan = draggedRow.children.length;
        this.placeholderRow.innerHTML = `<td colspan="${colSpan}" style="
                border:2px dashed #4CAF50;
                background:rgba(76,175,80,0.08);
                height:${draggedRow.getBoundingClientRect().height}px;
            "></td>`;

        // Utwórz pływającą etykietę z informacją o nowej pozycji
        this.createDragBadge('Nowa pozycja: ' + (this.dragOriginalIndex + 1));
        // Ustaw jej początkową pozycję nad przeciąganym wierszem (środek)
        this.updateDragBadgePosition();

        // Zmień kursor na grabbing dla efektu wizualnego
        e.target.style.cursor = 'grabbing';

        console.log('Rozpoczęto przeciąganie wiersza (indeks oryginalny):', this.dragOriginalIndex);
    }

    // Obsługa przeciągania nad obszarem tabeli – wyznaczanie dynamicznej docelowej pozycji
    handleDragOver(e) {
        // Zapobiegaj domyślnej akcji, aby możliwe było upuszczenie
        if (e.preventDefault) e.preventDefault();

        e.dataTransfer.dropEffect = 'move';

        const draggingRow = document.querySelector('.dragging');
        if (!draggingRow) return false;

        const tableBody = document.getElementById('addressesTableBody') || this.addressTableBody;
        if (!tableBody) return false;

        // Wyznacz element, przed którym potencjalnie wstawimy placeholder
        const afterElement = this.getDragAfterElement(tableBody, e.clientY);

        // Wstaw lub przenieś placeholder w odpowiednie miejsce
        if (!this.placeholderRow) {
            // Bezpieczeństwo – jeśli z jakiegoś powodu nie ma placeholdera, utwórz go ponownie
            this.placeholderRow = document.createElement('tr');
            this.placeholderRow.className = 'drag-placeholder';
            const colSpan = draggingRow.children.length;
            this.placeholderRow.innerHTML = `<td colspan="${colSpan}" style="
                    border:2px dashed #4CAF50;
                    background:rgba(76,175,80,0.08);
                    height:${draggingRow.getBoundingClientRect().height}px;
                "></td>`;
        }

        // Usuwamy poprzednią pozycję placeholdera jeśli był wstawiony
        if (this.placeholderRow.parentElement !== tableBody) {
            // nic – zostanie wstawiony
        }

        if (afterElement == null) {
            // Wstaw na koniec
            if (this.placeholderRow.parentElement !== tableBody || this.placeholderRow.nextSibling) {
                tableBody.appendChild(this.placeholderRow);
            } else {
                // już jest na końcu
            }
        } else {
            // Wstaw przed element docelowy
            if (afterElement !== this.placeholderRow) {
                tableBody.insertBefore(this.placeholderRow, afterElement);
            }
        }

        // Oblicz indeks placeholdera w aktualnym układzie
        const placeholderIndex = Array.from(tableBody.children).indexOf(this.placeholderRow);

        // Oblicz przewidywany nowy indeks po przeniesieniu (uwzględnia przesunięcie gdy element idzie w dół)
        let predictedIndex = placeholderIndex;
        if (placeholderIndex > this.dragOriginalIndex) {
            // Jeśli docelowe miejsce jest niżej, po usunięciu oryginalnego wiersza wszystko się przesunie o 1 w górę
            predictedIndex = placeholderIndex - 1;
        }

        // Aktualizuj treść badge (1-based index dla użytkownika)
        if (this.dragBadge) {
            this.dragBadge.textContent = 'Nowa pozycja: ' + (predictedIndex + 1);
            // Ustaw położenie nad placeholderem (centrowanie)
            this.updateDragBadgePosition();
        }

        return false;
    }

    // Obsługa upuszczenia elementu – finalizacja przeniesienia
    handleDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();

        const tableBody = document.getElementById('addressesTableBody') || this.addressTableBody;
        const draggedRow = document.querySelector('.dragging');
        if (!draggedRow || !tableBody) return false;

        // Jeżeli nie ma placeholdera traktujemy jak brak zmiany
        if (!this.placeholderRow) {
            console.log('Brak placeholdera – anuluję zmianę kolejności');
            return false;
        }

        // Oblicz finalny indeks na podstawie pozycji placeholdera
        const placeholderIndex = Array.from(tableBody.children).indexOf(this.placeholderRow);
        let finalIndex = placeholderIndex;
        if (placeholderIndex > this.dragOriginalIndex) {
            finalIndex = placeholderIndex - 1;
        }

        console.log(`Upuszczono wiersz. Oryginalny indeks: ${this.dragOriginalIndex}, docelowy indeks: ${finalIndex}`);

        // Przenieś wiersz w DOM przed placeholder (placeholder zaraz usuniemy)
        tableBody.insertBefore(draggedRow, this.placeholderRow);

        // Usuń placeholder z DOM
        this.removePlaceholder();

        // Jeśli indeks się zmienił – zaktualizuj strukturę danych
        if (finalIndex !== this.dragOriginalIndex) {
            this.updateAddressOrderFromDrag(this.dragOriginalIndex, finalIndex).catch(err => {
                console.error('Błąd w updateAddressOrderFromDrag:', err);
            });
        } else {
            console.log('Indeks nie uległ zmianie – brak aktualizacji danych.');
        }

        // Usuń badge informacyjny
        this.removeDragBadge();

        return false;
    }

    // Obsługa zakończenia przeciągania (jeśli użytkownik np. anulował operację)
    handleDragEnd(e) {
        const draggedRow = document.querySelector('.dragging');
        if (draggedRow) {
            draggedRow.classList.remove('dragging');
            draggedRow.style.cursor = '';
        }

        // Usuń potencjalny placeholder jeśli istnieje (anulacja / zakończenie bez drop)
        this.removePlaceholder();

        // Usuń badge informacyjny
        this.removeDragBadge();

        // Usuń wszystkie klasy pomocnicze
        const allRows = document.querySelectorAll('.draggable-row');
        allRows.forEach(row => row.classList.remove('drag-over'));

        this.dragOriginalIndex = null;

        console.log('Zakończono przeciąganie (clean-up)');
    }

    // Obsługa wejścia na element przeciągany
    handleDragEnter(e) {
        if (e.target.tagName === 'TR' && !e.target.classList.contains('dragging')) {
            e.target.classList.add('drag-over');
        }
    }

    // Obsługa opuszczenia elementu przeciąganego
    handleDragLeave(e) {
        if (e.target.tagName === 'TR') {
            e.target.classList.remove('drag-over');
        }
    }

    // === POMOCNICZE FUNKCJE DO BADGE I PLACEHOLDER ===

    // Tworzy pływającą etykietę z informacją o docelowej pozycji
    createDragBadge(initialText) {
        // Jeśli już istnieje – usuń aby odtworzyć
        this.removeDragBadge();

        const badge = document.createElement('div');
        badge.className = 'drag-position-badge';
        badge.textContent = initialText;
        badge.style.cssText = `
                position:fixed;
                top:0;
                left:0;
                background:rgba(0,0,0,0.80);
                color:#fff;
                padding:6px 10px;
                border-radius:6px;
                font-size:13px;
                font-family:Arial, sans-serif;
                font-weight:500;
                z-index:9999;
                pointer-events:none;
                box-shadow:0 4px 10px rgba(0,0,0,0.35);
                transition:background .15s, transform .15s;
                white-space:nowrap;
            `;
        document.body.appendChild(badge);
        this.dragBadge = badge;
    }

    // Aktualizuje położenie etykiety bazując na położeniu placeholdera lub przeciąganego wiersza
    updateDragBadgePosition() {
        if (!this.dragBadge) return;

        // Element docelowy do centrowania – preferujemy placeholder, jeśli istnieje
        let targetRow = this.placeholderRow;
        if (!targetRow) {
            // Jeśli placeholder jeszcze nie wstawiony, użyj aktualnie przeciąganego wiersza
            targetRow = document.querySelector('.dragging');
        }
        if (!targetRow) return;

        const rect = targetRow.getBoundingClientRect();
        const badgeWidth = this.dragBadge.offsetWidth;
        const badgeHeight = this.dragBadge.offsetHeight;

        // Wyliczamy pozycję: powyżej wiersza (6px odstępu), wycentrowane horyzontalnie
        const top = rect.top - badgeHeight - 6;
        const left = rect.left + (rect.width / 2) - (badgeWidth / 2);

        this.dragBadge.style.top = (top < 4 ? 4 : top) + 'px'; // zabezpieczenie przed wyjściem poza górną krawędź
        this.dragBadge.style.left = (left < 4 ? 4 : left) + 'px';
    }

    // Usuwa badge jeśli istnieje
    removeDragBadge() {
        if (this.dragBadge && this.dragBadge.parentElement) {
            this.dragBadge.parentElement.removeChild(this.dragBadge);
        }
        this.dragBadge = null;
    }

    // Usuwa placeholder wiersza z tabeli
    removePlaceholder() {
        if (this.placeholderRow && this.placeholderRow.parentElement) {
            this.placeholderRow.parentElement.removeChild(this.placeholderRow);
        }
        this.placeholderRow = null;
    }

    // Pomocnicza funkcja do określenia pozycji wstawienia (ignorujemy placeholder)
    getDragAfterElement(container, y) {
        // Pobieramy wszystkie wiersze poza aktualnie przeciąganym i placeholderem
        const draggableElements = [...container.querySelectorAll('tr:not(.dragging):not(.drag-placeholder)')];

        // Identyfikujemy najbliższy element powyżej aktualnej pozycji kursora
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2; // offset < 0 oznacza że kursor jest nad połową wiersza

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // Aktualizuje kolejność adresów po przeciągnięciu
    async updateAddressOrderFromDrag(oldIndex, newIndex) {
        console.log(`Aktualizuję kolejność adresów: ${oldIndex} -> ${newIndex}`);

        try {
            if (!this.addresses || this.addresses.length === 0) {
                console.warn('Nie ma adresów do przeniesienia');
                return;
            }

            // Przenieś adres ze starej na nową pozycję
            const [movedAddress] = this.addresses.splice(oldIndex, 1);
            this.addresses.splice(newIndex, 0, movedAddress);

            console.log('Przeniesiono adres:', movedAddress);

            // Zaktualizuj numery pozycji
            this.addresses.forEach((address, index) => {
                address.position = index + 1;
            });

            console.log('Zaktualizowano numery pozycji');

            // Zaktualizuj tablicę adresów w TableManager
            this.updateRowsDraggable();

            console.log('Wywoływanie updatePositionNumbers...');
            // Zaktualizuj numery pozycji w przyciskach
            this.updatePositionNumbers();

            console.log('Wywoływanie updateMapAndMarkers...');
            // Zaktualizuj mapę i znaczniki
            this.updateMapAndMarkers();

            console.log('Wywoływanie saveAddresses...');
            // Zapisz zmiany
            this.saveAddresses();

            console.log('Wywoływanie updateArrivalTimesAfterReorder...');
            // Aktualizuj szacunkowe czasy przyjazdu - czekaj aż się skończy!
            await this.updateArrivalTimesAfterReorder();

            console.log('Zaktualizowano kolejność adresów po przeciągnięciu');
        } catch (error) {
            console.error('Błąd podczas aktualizacji kolejności adresów:', error);
        }
    }

    // Aktualizuje numery pozycji w przyciskach
    updatePositionNumbers() {
        const tableBody = document.getElementById('addressesTableBody') || this.addressTableBody;
        if (!tableBody) return;

        const rows = tableBody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            const positionButton = row.querySelector('.position-number-button');
            if (positionButton) {
                // Zachowaj ikonę przeciągania jeśli istnieje
                const dragIcon = positionButton.querySelector('.drag-icon');
                if (dragIcon) {
                    // Usuń stary tekst, zachowując ikonę
                    while (positionButton.lastChild !== dragIcon) {
                        positionButton.removeChild(positionButton.lastChild);
                    }
                    // Dodaj nowy numer pozycji po ikonie
                    const numberText = document.createTextNode(' ' + (index + 1).toString());
                    positionButton.appendChild(numberText);
                } else {
                    // Jeśli nie ma ikony, ustaw normalnie
                    positionButton.textContent = (index + 1).toString();
                }
            }
        });
    }
}

// Eksport klasy globalnie
window.TableManager = TableManager;
