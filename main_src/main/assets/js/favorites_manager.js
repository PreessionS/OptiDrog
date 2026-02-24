/**
 * FavoritesManager - zarządzanie ulubionymi adresami z użyciem localStorage
 * Funkcjonalność:
 * - Trwałe przechowywanie ulubionych w localStorage (bez Android bridge)
 * - Modal z listą ulubionych (dodawanie do mapy/tabeli oraz usuwanie)
 * - Integracja z TableManager (gwiazdki przy adresach)
 * 
 * AKTUALIZACJA: Obsługa adresów bez ulic w formacie "NUMER, MIEJSCOWOŚĆ"
 * - Dodano funkcję detectAddressFormat() do rozpoznawania formatu adresu
 * - Zaktualizowano funkcje ekstrakcji danych z adresu (extractCityFromAddress, extractStreetFromAddress, extractStreetNameFromAddress)
 * - Zmodyfikowano filterFavorites() do poprawnego filtrowania adresów bez ulic
 * - Dodano specjalną opcję "Adresy bez ulicy (tylko numer)" w filtrze ulic
 */
/**
 * FavoritesManager - zarządzanie ulubionymi adresami z użyciem localStorage
 * Funkcjonalność:
 * - Trwałe przechowywanie ulubionych w localStorage (bez Android bridge)
 * - Modal z listą ulubionych (dodawanie do mapy/tabeli oraz usuwanie)
 * - Integracja z TableManager (gwiazdki przy adresach)
 */
class FavoritesManager {
    constructor() {
        // Klucz localStorage dla ulubionych
        this.STORAGE_KEY = 'optiDrogFavorites';
        // Bieżąca lista ulubionych (tablica obiektów)
        this.favorites = [];
        // Referencje do menedżerów
        this.mapManager = null;
        this.tableManager = null;
        this.addressSearchManager = null;
        // Flaga stanu modala
        this.modalOpen = false;
        // Inicjalne wczytanie ulubionych z Android lub localStorage
        this.favorites = this.loadFavorites();
    }

    // Inicjalizacja z referencjami do modułów aplikacji i podpięciem zdarzeń UI
    init(mapManager, tableManager, addressSearchManager) {
        this.mapManager = mapManager || null;
        this.tableManager = tableManager || null;
        this.addressSearchManager = addressSearchManager || null;

        // Podłącz obsługę przycisku "Dodaj z ulubionych" jeśli istnieje
        const favBtn = document.getElementById('add-from-favorites-button');
        if (favBtn) {
            favBtn.addEventListener('click', () => this.openFavoritesModal());
        }

        // Dodaj globalny listener ESC do zamykania modala
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalOpen) {
                this.closeFavoritesModal();
            }
        });
    }

    // Pobiera ulubione z localStorage
    loadFavorites() {
        try {
            // 1) Preferuj trwały magazyn po stronie Androida, jeśli dostępny
            if (typeof Android !== 'undefined' && Android !== null && typeof Android.loadFavorites === 'function') {
                const json = Android.loadFavorites();
                const parsed = json ? JSON.parse(json) : [];
                if (Array.isArray(parsed)) {
                    // Migracja danych dla starszych wpisów - dodaj puste pole 'name' jeśli nie istnieje
                    const migratedFavorites = parsed.map(item => {
                        if (item && typeof item.id === 'string' && item.name === undefined) {
                            return { ...item, name: '' };
                        }
                        return item;
                    });

                    // Zsynchronizuj localStorage jako kopię zapasową
                    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(migratedFavorites)); } catch { }
                    return migratedFavorites.filter(item => item && typeof item.id === 'string');
                }
                return [];
            }
            // 2) Fallback: użyj localStorage (np. w przeglądarce)
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                // Migracja danych dla starszych wpisów - dodaj puste pole 'name' jeśli nie istnieje
                const migratedFavorites = parsed.map(item => {
                    if (item && typeof item.id === 'string' && item.name === undefined) {
                        return { ...item, name: '' };
                    }
                    return item;
                });
                return migratedFavorites.filter(item => item && typeof item.id === 'string');
            }
            return [];
        } catch (e) {
            console.error('[FavoritesManager] Błąd podczas wczytywania ulubionych:', e);
            return [];
        }
    }

    // Zapisuje ulubione do localStorage
    saveFavorites() {
        try {
            const json = JSON.stringify(this.favorites);
            // 1) Zapisz trwale przez Android WebAppInterface, jeśli dostępny
            if (typeof Android !== 'undefined' && Android !== null && typeof Android.saveFavorites === 'function') {
                const ok = Android.saveFavorites(json);
                if (!ok) {
                    console.warn('[FavoritesManager] Android.saveFavorites zwrócił false, używam fallback localStorage');
                    try { localStorage.setItem(this.STORAGE_KEY, json); } catch { }
                } else {
                    // Trzymaj też kopię w localStorage jako cache/fallback
                    try { localStorage.setItem(this.STORAGE_KEY, json); } catch { }
                }
            } else {
                // 2) Fallback: localStorage
                localStorage.setItem(this.STORAGE_KEY, json);
            }
        } catch (e) {
            console.error('[FavoritesManager] Błąd podczas zapisywania ulubionych:', e);
        }
    }

    // Zwraca kopię listy ulubionych
    getFavorites() {
        return [...this.favorites];
    }

    // Pobiera nazwę ulubionego adresu po ID
    getFavoriteName(id) {
        console.log(`[FavoritesManager] Szukam nazwy dla ID: ${id} wśród ${this.favorites.length} ulubionych`);
        const favorite = this.favorites.find(f => f.id === id);
        const name = favorite ? favorite.name : '';
        console.log(`[FavoritesManager] Znaleziono ulubiony: ${JSON.stringify(favorite)}`);
        console.log(`[FavoritesManager] Pobieram nazwę dla ID ${id}: ${name}`);
        return name;
    }

    // Przeciążona metoda pobierająca nazwę na podstawie adresu i współrzędnych
    getFavoriteNameByCoords(address, lat, lng) {
        const addressKey = generateAddressKey(address, lat, lng);
        return this.getFavoriteName(addressKey);
    }

    // Przeciążona metoda pobierająca nazwę na podstawie adresu i współrzędnych
    getFavoriteNameByCoords(address, lat, lng) {
        const addressKey = generateAddressKey(address, lat, lng);
        console.log(`[FavoritesManager] Pobieram nazwę dla adresu ${address} (${lat}, ${lng}) -> klucz: ${addressKey}`);
        return this.getFavoriteName(addressKey);
    }

    // Sprawdza, czy dany ID (addressKey) jest oznaczony jako ulubiony
    isFavorite(id) {
        return this.favorites.some(f => f.id === id);
    }

    // Przeciążona metoda sprawdzająca ulubiony status na podstawie adresu i współrzędnych
    isFavoriteByCoords(address, lat, lng) {
        const addressKey = generateAddressKey(address, lat, lng);
        console.log(`[FavoritesManager] Sprawdzam ulubiony status dla adresu ${address} (${lat}, ${lng}) -> klucz: ${addressKey}`);
        const isFav = this.isFavorite(addressKey);
        console.log(`[FavoritesManager] Wynik: ${isFav}`);
        return isFav;
    }

    // Dodaje adres do ulubionych (jeśli jeszcze nie istnieje)
    addFavorite(fav) {
        // fav: { id, address, lat, lng, timeFrom?, timeTo?, deliveryType?, firstOnRoute?, name? }
        if (!fav || !fav.address || typeof fav.lat === 'undefined' || typeof fav.lng === 'undefined') return false;

        // Generuj spójny klucz adresu, nawet jeśli id nie zostało dostarczone
        const addressKey = generateAddressKey(fav.address, fav.lat, fav.lng);
        const idToUse = fav.id ? String(fav.id) : addressKey;

        if (this.isFavorite(idToUse)) return true; // już istnieje

        // Upewnij się, że liczby są liczbami
        const lat = Number(fav.lat);
        const lng = Number(fav.lng);
        const item = {
            id: idToUse,
            address: fav.address,
            lat: isNaN(lat) ? 0 : lat,
            lng: isNaN(lng) ? 0 : lng,
            timeFrom: fav.timeFrom ? String(fav.timeFrom) : '',
            timeTo: fav.timeTo ? String(fav.timeTo) : '',
            deliveryType: fav.deliveryType ? String(fav.deliveryType) : '',
            firstOnRoute: !!fav.firstOnRoute,
            name: fav.name ? String(fav.name) : '' // Dodanie pola nazwy (opcjonalne)
        };
        this.favorites.push(item);
        this.saveFavorites();
        return true;
    }

    // Usuwa adres z ulubionych po ID
    removeFavorite(id) {
        const before = this.favorites.length;
        this.favorites = this.favorites.filter(f => f.id !== id);
        const changed = this.favorites.length !== before;
        if (changed) {
            this.saveFavorites();
            // Zaktualizuj gwiazdkę w tabeli, jeśli wiersz jest widoczny
            this.updateStarInTableRow(id, false);
        }
        return changed;
    }

    // Przełącza stan ulubionego dla danego adresu; zwraca true jeśli po zmianie jest ulubiony
    toggleFavorite(fav) {
        if (!fav || !fav.id) return this.isFavorite('');
        if (this.isFavorite(fav.id)) {
            this.removeFavorite(fav.id);
            return false;
        }
        this.addFavorite(fav);
        return true;
    }

    // Otwiera modal do dodawania/edycji nazwy dla ulubionego adresu
    openFavoriteNameModal(favData, callback) {
        // favData: { id, address, lat, lng, existingName? }
        if (!favData || !favData.id) return;

        // Sprawdź czy modal już nie jest otwarty
        if (document.getElementById('favorite-name-modal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'favorite-name-modal';

        // Zamknięcie po kliknięciu w tło
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeFavoriteNameModal();
            }
        });

        const content = document.createElement('div');
        content.className = 'modal-content favorite-name-modal-content';

        // Nagłówek
        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = 'Nazwa ulubionego adresu';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-button';
        closeBtn.title = 'Zamknij';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => this.closeFavoriteNameModal());
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Treść
        const body = document.createElement('div');
        body.className = 'modal-body';

        // Informacja o adresie
        const addressInfo = document.createElement('div');
        addressInfo.className = 'favorite-address-info';
        addressInfo.textContent = favData.address;
        body.appendChild(addressInfo);

        // Pole do wprowadzania nazwy
        const nameContainer = document.createElement('div');
        nameContainer.className = 'favorite-name-container';

        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Nazwa (opcjonalne):';
        nameLabel.htmlFor = 'favorite-name-input';
        nameContainer.appendChild(nameLabel);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'favorite-name-input';
        nameInput.className = 'favorite-name-input';
        nameInput.placeholder = 'np. Magazyn, Biuro, Dom klienta';
        nameInput.maxLength = 50; // Ograniczenie długości nazwy
        nameInput.value = favData.existingName || '';

        nameContainer.appendChild(nameInput);
        body.appendChild(nameContainer);

        // Stopka
        const footer = document.createElement('div');
        footer.className = 'modal-footer favorite-name-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'secondary';
        cancelBtn.textContent = 'Anuluj';
        cancelBtn.addEventListener('click', () => this.closeFavoriteNameModal());

        const saveBtn = document.createElement('button');
        saveBtn.className = 'primary';
        saveBtn.textContent = 'Zapisz';
        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (callback) {
                callback(favData.id, name);
            }
            this.closeFavoriteNameModal();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Dodaj obsługę klawisza Enter
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const name = nameInput.value.trim();
                if (callback) {
                    callback(favData.id, name);
                }
                this.closeFavoriteNameModal();
            }
        });
    }

    // Zamyka modal nazwy ulubionego adresu
    closeFavoriteNameModal() {
        const modal = document.getElementById('favorite-name-modal');
        if (modal && modal.parentElement) {
            modal.parentElement.removeChild(modal);
        }
    }

    // Aktualizuje nazwę istniejącego ulubionego adresu
    updateFavoriteName(id, name) {
        const favorite = this.favorites.find(f => f.id === id);
        if (!favorite) return false;

        favorite.name = name || '';
        this.saveFavorites();

        // Synchronizacja z TableManager
        if (this.tableManager && typeof this.tableManager.updateAddressName === 'function') {
            this.tableManager.updateAddressName(id, favorite.name);
        }

        return true;
    }

    // Rozpoznaje format adresu
    detectAddressFormat(address) {
        if (!address || typeof address !== 'string') return 'unknown';

        // Format: NUMER, MIEJSCOWOŚĆ (np. "9, Zwartówko")
        if (/^\s*\d+[a-zA-Z\/]*\s*,\s*[A-ZŁŚĆŻŹĆÓŃa-złśćżźąęóń]/.test(address)) {
            return 'number_city';
        }

        // Format standardowy: Ulica Numer, Miasto
        if (/[A-ZŁŚĆŻŹĆÓŃa-złśćżźąęóń].*\d+.*,\s*[A-ZŁŚĆŻŹĆÓŃa-złśćżźąęóń]/.test(address)) {
            return 'street_city';
        }

        // Format: Miasto, Ulica Numer
        if (/[A-ZŁŚĆŻŹĆÓŃa-złśćżźąęóń].*,\s*[A-ZŁŚĆŻŹĆÓŃa-złśćżźąęóń]/.test(address)) {
            return 'city_street';
        }

        return 'unknown';
    }

    // Wyodrębnia miasto z adresu
    extractCityFromAddress(address) {
        if (!address || typeof address !== 'string') return '';

        const format = this.detectAddressFormat(address);

        switch (format) {
            case 'number_city':
                // Dla formatu "NUMER, MIEJSCOWOŚĆ" - miasto jest po przecinku
                const match = address.match(/^\s*\d+[a-zA-Z\/]*\s*,\s*([^,]+)$/);
                return match ? match[1].trim() : '';

            case 'street_city':
            case 'city_street':
                // Standardowe formaty polskich adresów
                // Ulica Numer, Miasto
                // Ulica Numer, Kod Pocztowy Miasto
                // Miasto, Ulica Numer

                const patterns = [
                    /,\s*([^,]+)$/, // Wszystko po ostatnim przecinku
                    /,\s*\d{2}-\d{3}\s+([^,]+)$/, // Po kodzie pocztowym
                    /([A-ZŁŚĆŻŹĆÓŃa-złśćżźąęóń]+)\s*,\s*[A-ZŁŚĆŻŹĆÓŃa-złśćżźąęóń]/ // Miasto przed ulicą
                ];

                for (const pattern of patterns) {
                    const patternMatch = address.match(pattern);
                    if (patternMatch && patternMatch[1]) {
                        return patternMatch[1].trim();
                    }
                }
                break;
        }

        return '';
    }

    // Wyodrębnia ulicę z adresu
    extractStreetFromAddress(address) {
        if (!address || typeof address !== 'string') return '';

        const format = this.detectAddressFormat(address);

        switch (format) {
            case 'number_city':
                // Dla formatu "NUMER, MIEJSCOWOŚĆ" - nie ma ulicy, zwróć numer
                const numberMatch = address.match(/^\s*(\d+[a-zA-Z\/]*)\s*,/);
                return numberMatch ? numberMatch[1].trim() : '';

            case 'street_city':
            case 'city_street':
                // Usuń miasto i kod pocztowy, aby uzyskać ulicę
                let street = address;

                // Usuń kod pocztowy i miasto
                street = street.replace(/,\s*\d{2}-\d{3}\s+[^,]+$/, '');
                street = street.replace(/,\s*[^,]+$/, '');

                return street.trim();
        }

        return '';
    }

    // Wyodrębnia samą nazwę ulicy (bez numeru)
    extractStreetNameFromAddress(address) {
        if (!address || typeof address !== 'string') return '';

        const format = this.detectAddressFormat(address);

        switch (format) {
            case 'number_city':
                // Dla formatu "NUMER, MIEJSCOWOŚĆ" - nie ma nazwy ulicy, zwróć pusty string
                return '';

            case 'street_city':
            case 'city_street':
                // Usuń miasto i kod pocztowy, aby uzyskać ulicę
                let street = address;

                // Usuń kod pocztowy i miasto
                street = street.replace(/,\s*\d{2}-\d{3}\s+[^,]+$/, '');
                street = street.replace(/,\s*[^,]+$/, '');

                // Usuń numer budynku
                street = street.replace(/\s+\d+[a-zA-Z\/]*\s*$/, '');

                return street.trim();
        }

        return '';
    }

    // Pobiera unikalne miasta z ulubionych
    getUniqueCities() {
        const cities = new Set();
        this.favorites.forEach(fav => {
            const city = this.extractCityFromAddress(fav.address);
            if (city) cities.add(city);
        });
        return Array.from(cities).sort();
    }

    // Pobiera unikalne ulice dla danego miasta
    getUniqueStreetsForCity(city) {
        const streets = new Set();
        this.favorites.forEach(fav => {
            const favCity = this.extractCityFromAddress(fav.address);
            if (favCity === city) {
                const street = this.extractStreetFromAddress(fav.address);
                if (street) streets.add(street);
            }
        });
        return Array.from(streets).sort();
    }

    // Pobiera unikalne nazwy ulic (bez numerów) dla danego miasta
    getUniqueStreetNamesForCity(city) {
        const streetNames = new Set();
        this.favorites.forEach(fav => {
            const favCity = this.extractCityFromAddress(fav.address);
            if (favCity === city) {
                const streetName = this.extractStreetNameFromAddress(fav.address);
                if (streetName) streetNames.add(streetName);
            }
        });
        return Array.from(streetNames).sort();
    }

    // Filtruje ulubione według miasta i ulicy
    filterFavorites(city = '', street = '') {
        return this.favorites.filter(fav => {
            const favCity = this.extractCityFromAddress(fav.address);
            const favStreet = this.extractStreetFromAddress(fav.address);
            const favStreetName = this.extractStreetNameFromAddress(fav.address);
            const addressFormat = this.detectAddressFormat(fav.address);

            const cityMatch = !city || favCity === city;

            // Jeśli street jest puste, nie filtruj po ulicy
            // Jeśli street zawiera tylko nazwę ulicy (bez numeru), dopasuj po nazwie ulicy
            // Jeśli street zawiera pełną ulicę (z numerem), dopasuj po pełnej ulicy
            let streetMatch = !street;
            if (street) {
                if (street === '__NUMBER_ONLY__') {
                    // Specjalna opcja dla adresów bez ulic
                    streetMatch = addressFormat === 'number_city';
                } else if (addressFormat === 'number_city') {
                    // Dla adresów "NUMER, MIEJSCOWOŚĆ" porównuj numer
                    streetMatch = favStreet === street;
                } else if (!street.match(/\d+[a-zA-Z\/]*\s*$/)) {
                    // To jest nazwa ulicy (bez numeru)
                    streetMatch = favStreetName === street;
                } else {
                    // To jest pełna ulica (z numerem)
                    streetMatch = favStreet === street;
                }
            }

            return cityMatch && streetMatch;
        });
    }

    // Otwiera modal z listą ulubionych
    openFavoritesModal() {
        if (this.modalOpen) return;
        this.modalOpen = true;
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'favorites-modal';

        // Zamknięcie po kliknięciu w tło
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeFavoritesModal();
        });

        const content = document.createElement('div');
        content.className = 'modal-content';

        // Nagłówek
        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = 'Ulubione adresy';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-button';
        closeBtn.title = 'Zamknij';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => this.closeFavoritesModal());
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Sekcja filtrowania
        const filterSection = document.createElement('div');
        filterSection.className = 'favorites-filter-section';

        // Filtr miasta
        const cityFilterContainer = document.createElement('div');
        cityFilterContainer.className = 'favorites-filter-group';
        const cityLabel = document.createElement('label');
        cityLabel.className = 'favorites-filter-label';
        cityLabel.textContent = 'Miasto:';
        cityLabel.htmlFor = 'city-filter';
        const citySelect = document.createElement('select');
        citySelect.className = 'favorites-filter-select';
        citySelect.id = 'city-filter';

        // Dodaj opcję placeholder (zamiast "Wszystko")
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = 'Wybierz miasto';
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        citySelect.appendChild(placeholderOption);

        // Dodaj dostępne miasta
        const cities = this.getUniqueCities();
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            citySelect.appendChild(option);
        });

        cityFilterContainer.appendChild(cityLabel);
        cityFilterContainer.appendChild(citySelect);

        // Filtr ulicy
        const streetFilterContainer = document.createElement('div');
        streetFilterContainer.className = 'favorites-filter-group';
        const streetLabel = document.createElement('label');
        streetLabel.className = 'favorites-filter-label';
        streetLabel.textContent = 'Ulica:';
        streetLabel.htmlFor = 'street-filter';
        const streetSelect = document.createElement('select');
        streetSelect.className = 'favorites-filter-select';
        streetSelect.id = 'street-filter';

        // Dodaj opcję "Wszystko"
        const allStreetsOption = document.createElement('option');
        allStreetsOption.value = '';
        allStreetsOption.textContent = 'Wszystko';
        streetSelect.appendChild(allStreetsOption);

        // Nie dodawaj ulic domyślnie - wymagaj wyboru miasta
        // Pozostaw tylko opcję "Wszystko" (ale wyłączoną)
        allStreetsOption.disabled = true;

        streetFilterContainer.appendChild(streetLabel);
        streetFilterContainer.appendChild(streetSelect);

        // Aktualizuj ulice przy zmianie miasta
        citySelect.addEventListener('change', () => {
            // Wyczyść aktualne opcje ulic
            streetSelect.innerHTML = '';

            // Dodaj opcję "Wszystko"
            const allStreetsOption = document.createElement('option');
            allStreetsOption.value = '';
            allStreetsOption.textContent = 'Wszystko';
            streetSelect.appendChild(allStreetsOption);

            // Dodaj nazwy ulic dla wybranego miasta
            if (citySelect.value) {
                // Sprawdź czy są adresy bez ulic dla tego miasta
                const hasNumberOnlyAddresses = this.favorites.some(fav => {
                    const favCity = this.extractCityFromAddress(fav.address);
                    const format = this.detectAddressFormat(fav.address);
                    return favCity === citySelect.value && format === 'number_city';
                });

                // Dodaj specjalną opcję dla adresów bez ulic jeśli istnieją
                if (hasNumberOnlyAddresses) {
                    const numberOnlyOption = document.createElement('option');
                    numberOnlyOption.value = '__NUMBER_ONLY__';
                    numberOnlyOption.textContent = 'Adresy bez ulicy (tylko numer)';
                    streetSelect.appendChild(numberOnlyOption);
                }

                const streetNames = this.getUniqueStreetNamesForCity(citySelect.value);
                streetNames.forEach(streetName => {
                    const option = document.createElement('option');
                    option.value = streetName;
                    option.textContent = streetName;
                    streetSelect.appendChild(option);
                });
            }

            // Zaktualizuj listę i statystyki
            this.updateFavoritesList(citySelect.value, streetSelect.value, list);
            this.updateFilterStats(citySelect.value, streetSelect.value);
        });

        // Aktualizuj listę i statystyki przy zmianie ulicy
        streetSelect.addEventListener('change', () => {
            this.updateFavoritesList(citySelect.value, streetSelect.value, list);
            this.updateFilterStats(citySelect.value, streetSelect.value);
        });

        // Kontener dla kontrolek filtrowania
        const filterControls = document.createElement('div');
        filterControls.className = 'favorites-filter-controls';
        filterControls.appendChild(cityFilterContainer);
        filterControls.appendChild(streetFilterContainer);

        // Nagłówek sekcji filtrowania
        const filterHeader = document.createElement('div');
        filterHeader.className = 'favorites-filter-header';
        filterHeader.textContent = 'Filtruj ulubione';

        // Statystyki filtrowania
        const filterStats = document.createElement('div');
        filterStats.className = 'favorites-filter-stats';
        filterStats.id = 'filter-stats';
        filterStats.textContent = 'Wybierz miasto, aby wyświetlić ulubione adresy.';

        // Zbuduj sekcję filtrowania
        filterSection.appendChild(filterHeader);
        filterSection.appendChild(filterControls);
        filterSection.appendChild(filterStats);

        // Treść
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.appendChild(filterSection);

        const list = document.createElement('div');
        list.className = 'favorites-list';

        // Domyślnie nie wyświetlaj adresów - wymagaj wyboru miasta
        const empty = document.createElement('div');
        empty.className = 'favorites-empty';
        //empty.textContent = 'Wybierz miasto, aby wyświetlić ulubione adresy.';
        list.appendChild(empty);
        body.appendChild(list);

        // Stopka
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const closeFooterBtn = document.createElement('button');
        closeFooterBtn.className = 'secondary';
        closeFooterBtn.textContent = 'Zamknij';
        closeFooterBtn.addEventListener('click', () => this.closeFavoritesModal());
        footer.appendChild(closeFooterBtn);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    // Renderuje listę ulubionych
    renderFavoritesList(items, listContainer) {
        listContainer.innerHTML = '';

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'favorites-empty';
            empty.textContent = 'Brak ulubionych pasujących do filtrów.';
            listContainer.appendChild(empty);
            return;
        }

        items.forEach((fav) => {
            const row = document.createElement('div');
            row.className = 'favorite-item';

            // Kliknięcie w cały wiersz dodaje adres do mapy/tabeli
            row.addEventListener('click', (e) => {
                // Nie reaguj na kliknięcie przycisku "Usuń"
                if ((e.target && e.target.closest('.favorite-remove')) || (e.target && e.target.classList.contains('favorite-remove'))) {
                    return;
                }
                this.addFavoriteToTable(fav);
            });

            const main = document.createElement('div');
            main.className = 'favorite-main';
            // Dodaj nazwę ulubionego adresu, jeśli istnieje
            const displayName = fav.name ? `${fav.address} (${fav.name})` : fav.address;
            main.innerHTML = `
                <div class="favorite-address">${displayName}</div>
                <div class="favorite-details">${fav.lat.toFixed(6)}, ${fav.lng.toFixed(6)}</div>
            `;

            const actions = document.createElement('div');
            actions.className = 'favorite-actions';
            const editBtn = document.createElement('button');
            editBtn.className = 'favorite-edit';
            editBtn.title = 'Edytuj nazwę';
            editBtn.textContent = 'Edytuj';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openFavoriteNameModal({
                    id: fav.id,
                    address: fav.address,
                    lat: fav.lat,
                    lng: fav.lng,
                    existingName: fav.name || ''
                }, (id, newName) => {
                    this.updateFavoriteName(id, newName);
                    // Odśwież listę w modalu
                    const citySelect = document.getElementById('city-filter');
                    const streetSelect = document.getElementById('street-filter');
                    const listContainer = document.querySelector('.favorites-list');
                    if (citySelect && streetSelect && listContainer) {
                        this.updateFavoritesList(citySelect.value, streetSelect.value, listContainer);
                    }
                });
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'favorite-remove';
            removeBtn.title = 'Usuń z ulubionych';
            removeBtn.textContent = 'Usuń';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const removed = this.removeFavorite(fav.id);
                if (removed) {
                    // Usuń wiersz z UI
                    row.remove();
                    // Pokaż toast na Androidzie jeśli dostępne
                    try {
                        if (typeof Android !== 'undefined' && Android.showToast) {
                            Android.showToast('Usunięto z ulubionych');
                        }
                    } catch { }
                    // Zaktualizuj filtry, ponieważ zmieniła się lista
                    this.updateFilters();
                    // Jeśli lista pusta, pokaż komunikat
                    if (this.getFavorites().length === 0) {
                        listContainer.innerHTML = '<div class="favorites-empty">Brak zapisanych ulubionych.</div>';
                    }
                }
            });

            actions.appendChild(editBtn);
            actions.appendChild(removeBtn);
            row.appendChild(main);
            row.appendChild(actions);
            listContainer.appendChild(row);
        });

        // Zaktualizuj statystyki filtrowania
        const citySelect = document.getElementById('city-filter');
        const streetSelect = document.getElementById('street-filter');
        if (citySelect && streetSelect) {
            this.updateFilterStats(citySelect.value, streetSelect.value);
        }
    }

    // Aktualizuje listę ulubionych na podstawie filtrów
    updateFavoritesList(city, street, listContainer) {
        const filteredItems = this.filterFavorites(city, street);
        this.renderFavoritesList(filteredItems, listContainer);
    }

    // Aktualizuje statystyki filtrowania
    updateFilterStats(city, street) {
        const statsElement = document.getElementById('filter-stats');
        if (!statsElement) return;

        const filteredItems = this.filterFavorites(city, street);
        const totalItems = this.favorites.length;

        let statsText = '';
        if (!city) {
            statsText = 'Wybierz miasto, aby wyświetlić ulubione adresy.';
        } else if (!street) {
            statsText = `Wyświetlanie adresów z miasta: ${city} (${filteredItems.length})`;
        } else if (street === '__NUMBER_ONLY__') {
            statsText = `Wyświetlanie adresów bez ulic z miasta: ${city} (${filteredItems.length})`;
        } else {
            statsText = `Wyświetlanie adresów: ${city}, ${street} (${filteredItems.length})`;
        }

        statsElement.textContent = statsText;
    }

    // Aktualizuje opcje filtrów po zmianie listy ulubionych
    updateFilters() {
        const citySelect = document.getElementById('city-filter');
        const streetSelect = document.getElementById('street-filter');

        if (!citySelect || !streetSelect) return;

        const currentCity = citySelect.value;
        const currentStreet = streetSelect.value;

        // Zaktualizuj opcje miast
        citySelect.innerHTML = '';
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = 'Wybierz miasto';
        placeholderOption.disabled = true;
        citySelect.appendChild(placeholderOption);

        const cities = this.getUniqueCities();
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            citySelect.appendChild(option);
        });

        // Przywróć poprzednio wybrane miasto, jeśli nadal istnieje
        if (cities.includes(currentCity)) {
            citySelect.value = currentCity;
        } else {
            // Ustaw placeholder jeśli miasto nie istnieje
            citySelect.value = '';
        }

        // Zaktualizuj opcje ulic
        streetSelect.innerHTML = '';
        const allStreetsOption = document.createElement('option');
        allStreetsOption.value = '';
        allStreetsOption.textContent = 'Wszystko';
        streetSelect.appendChild(allStreetsOption);

        if (citySelect.value) {
            // Sprawdź czy są adresy bez ulic dla tego miasta
            const hasNumberOnlyAddresses = this.favorites.some(fav => {
                const favCity = this.extractCityFromAddress(fav.address);
                const format = this.detectAddressFormat(fav.address);
                return favCity === citySelect.value && format === 'number_city';
            });

            // Dodaj specjalną opcję dla adresów bez ulic jeśli istnieją
            if (hasNumberOnlyAddresses) {
                const numberOnlyOption = document.createElement('option');
                numberOnlyOption.value = '__NUMBER_ONLY__';
                numberOnlyOption.textContent = 'Adresy bez ulicy (tylko numer)';
                streetSelect.appendChild(numberOnlyOption);
            }

            const streetNames = this.getUniqueStreetNamesForCity(citySelect.value);
            streetNames.forEach(streetName => {
                const option = document.createElement('option');
                option.value = streetName;
                option.textContent = streetName;
                streetSelect.appendChild(option);
            });

            // Przywróć poprzednio wybraną ulicę, jeśli nadal istnieje
            if (streetNames.includes(currentStreet) || currentStreet === '__NUMBER_ONLY__') {
                streetSelect.value = currentStreet;
            } else {
                streetSelect.value = '';
            }
        }

        // Zaktualizuj statystyki
        this.updateFilterStats(citySelect.value, streetSelect.value);
    }

    // Zamyka modal
    closeFavoritesModal() {
        const modal = document.getElementById('favorites-modal');
        if (modal && modal.parentElement) {
            modal.parentElement.removeChild(modal);
        }
        this.modalOpen = false;
    }

    // Dodaje ulubiony adres do mapy/tabeli i zamyka modal
    addFavoriteToTable(fav) {
        if (!fav) return;
        try {
            // Najpierw dodaj marker na mapę (jeśli dostępny)
            if (this.mapManager && typeof this.mapManager.addMarker === 'function') {
                this.mapManager.addMarker(fav.lat, fav.lng, fav.address);
            }
            // Dodaj do tabeli przy użyciu TableManager
            if (this.tableManager && typeof this.tableManager.addAddressToTable === 'function') {
                this.tableManager.addAddressToTable(
                    fav.address,
                    fav.lat,
                    fav.lng,
                    false, // clearExisting
                    false, // returnOnBack
                    fav.timeFrom || '',
                    fav.timeTo || '',
                    null, // packageSettings
                    fav.deliveryType || '',
                    !!fav.firstOnRoute,
                    fav.name || '' // Przekazanie nazwy ulubionego adresu
                );
            }
            // Zamknij modal po dodaniu
            this.closeFavoritesModal();
            // Potwierdzenie na Androidzie jeśli dostępne
            try {
                if (typeof Android !== 'undefined' && Android.showToast) {
                    Android.showToast('Dodano z ulubionych');
                }
            } catch { }
        } catch (e) {
            console.error('[FavoritesManager] Błąd podczas dodawania ulubionego do tabeli:', e);
            alert('Wystąpił błąd podczas dodawania adresu z ulubionych');
        }
    }

    // Aktualizuje gwiazdkę w wierszu tabeli (jeśli jest w DOM)
    updateStarInTableRow(addressKey, isActive) {
        try {
            const row = document.querySelector(`tr[data-address-key="${addressKey}"]`);
            if (!row) return;
            const starBtn = row.querySelector('.favorite-star');
            if (!starBtn) return;
            if (isActive) {
                starBtn.classList.add('active');
                starBtn.textContent = '★';
                starBtn.title = 'Usuń z ulubionych';
            } else {
                starBtn.classList.remove('active');
                starBtn.textContent = '☆';
                starBtn.title = 'Dodaj do ulubionych';
            }
        } catch { }
    }
}

// Utwórz i wyeksponuj globalną instancję
if (!window.favoritesManager) {
    window.favoritesManager = new FavoritesManager();
}

// Eksport dla CommonJS (jeśli wymagane przez inne narzędzia)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FavoritesManager;
}