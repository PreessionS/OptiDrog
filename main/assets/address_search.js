// Moduł wyszukiwania i zarządzania adresami - Nominatim z ulepszonym formatowaniem
class AddressSearchManager {
    constructor(mapManager, tableManager) {
        this.mapManager = mapManager;
        this.tableManager = tableManager;
        this.currentQuery = '';
        this.searchTimeout = null;
        this.isBatchProcessing = false;
        this.batchCancelRequested = false;
        this.initEventListeners();
    }

    // Inicjalizacja nasłuchiwaczy zdarzeń
    initEventListeners() {
        const addressInput = document.getElementById('address-input');
        const voiceButton = document.getElementById('voice-button');

        if (!addressInput) {
            console.error('Element wyszukiwania nie został znaleziony');
            return;
        }

        console.log('AddressSearchManager - nasłuchiwacze zdarzeń zainicjalizowane');

        if (voiceButton) {
            voiceButton.addEventListener('click', () => {
                this.startVoiceRecognition();
            });
        }

        addressInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.currentQuery = query;

            if (query.length < 3) {
                this.hideSuggestions();
                return;
            }

            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                if (query === this.currentQuery && !this.isBatchProcessing) {
                    this.searchAddresses(query);
                }
            }, 300);
        });

        addressInput.addEventListener('blur', () => {
            setTimeout(() => {
                this.hideSuggestions();
            }, 200);
        });

        addressInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const address = addressInput.value;
                if (address && !this.isBatchProcessing) {
                    this.hideSuggestions();
                    this.searchAddress(address);
                }
            }
        });
    }

    // Główna funkcja wyszukiwania adresów
    async searchAddress(address) {
        console.log('Wyszukiwanie adresu:', address);

        if (!address || address.trim() === '') {
            this.hideSuggestions();
            return;
        }

        const words = address.trim().split(/\s+/);
        const isPotentialBatch = words.length >= 3;
        if (isPotentialBatch) {
            this.isBatchProcessing = true;
        }

        try {
            this.showLoading();

            if (address.startsWith('MAP_SEARCH:')) {
                const coords = address.replace('MAP_SEARCH:', '').split(',');
                if (coords.length === 2) {
                    const lat = parseFloat(coords[0]);
                    const lon = parseFloat(coords[1]);
                    this.isBatchProcessing = false;
                    await this.reverseGeocode(lat, lon);
                    return;
                }
            }

            if (isPotentialBatch) {
                const parsedAddresses = this.parseMultipleAddresses(address);
                if (parsedAddresses.length > 1) {
                    console.log('Wykryto wzorzec hurtowego dodawania adresów');
                    this.hideLoading();
                    await this.searchAndAddMultipleAddresses(address);
                    return;
                } else if (parsedAddresses.length === 1 && words.length >= 4) {
                    console.log('Możliwy wzorzec ulic bez numerów, próbuję hurtowe dodawanie');
                    this.hideLoading();
                    await this.searchAndAddMultipleAddresses(address);
                    return;
                }
            }

            this.isBatchProcessing = false;
            await this.searchSingleAddress(address);

        } catch (error) {
            console.error('Błąd podczas wyszukiwania:', error);
            this.showError('Wystąpił błąd podczas wyszukiwania adresów');
            this.isBatchProcessing = false;
        } finally {
            this.hideLoading();
        }
    }

    // Wyszukiwanie pojedynczego adresu
    async searchSingleAddress(address) {
        console.log('Wyszukiwanie pojedynczego adresu:', address);
        await this.searchAddresses(address);
    }

    // Wyszukiwanie adresów dla podpowiedzi
    async searchAddresses(query) {
        console.log('Wyszukiwanie podpowiedzi dla:', query);
        this.showLoading();

        try {
            let url = `https://optidrog.pl/address_search.php?format=json&q=${encodeURIComponent(query)}&limit=20&addressdetails=1`;

            // Dodaj bias lokalizacji jeśli pozycja użytkownika jest dostępna
            if (this.mapManager && this.mapManager.currentLat !== null && this.mapManager.currentLng !== null) {
                const userLat = this.mapManager.currentLat;
                const userLng = this.mapManager.currentLng;
                const delta = 0.5;
                const left = userLng - delta;
                const right = userLng + delta;
                const bottom = userLat - delta;
                const top = userLat + delta;
                url += `&viewbox=${left},${top},${right},${bottom}&bounded=0`;
            }

            console.log('URL zapytania proxy:', url);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Address Search App'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data && data.length > 0) {
                const filteredAndSortedData = this.filterAndSortResults(data, query);
                this.displaySuggestions(filteredAndSortedData);
            } else {
                if (!this.isBatchProcessing) {
                    this.showError('Nie znaleziono adresów lub wprowadzasz hurtowo.');
                }
            }

        } catch (error) {
            console.error('Błąd wyszukiwania:', error);
            this.showError('Wystąpił błąd podczas wyszukiwania adresów');
        }
    }

    // Pobieranie ikony na podstawie typu miejsca
    getPlaceIcon(item) {
        const category = item.class || item.category || '';
        const type = item.type || '';

        // POI / Firmy / Sklepy
        if (category === 'shop' || category === 'amenity') {
            switch (type) {
                case 'supermarket':
                case 'grocery':
                case 'convenience':
                    return '🛒';
                case 'restaurant':
                case 'fast_food':
                case 'food_court':
                    return '🍽️';
                case 'cafe':
                case 'coffee':
                    return '☕';
                case 'bar':
                case 'pub':
                    return '🍺';
                case 'pharmacy':
                    return '💊';
                case 'hospital':
                case 'clinic':
                case 'doctors':
                    return '🏥';
                case 'bank':
                case 'atm':
                    return '🏦';
                case 'fuel':
                case 'gas_station':
                    return '⛽';
                case 'hotel':
                case 'hostel':
                case 'motel':
                    return '🏨';
                case 'school':
                case 'kindergarten':
                case 'college':
                case 'university':
                    return '🏫';
                case 'bakery':
                    return '🥖';
                case 'butcher':
                    return '🥩';
                case 'clothes':
                case 'clothing':
                case 'fashion':
                    return '👕';
                case 'electronics':
                case 'computer':
                case 'mobile_phone':
                    return '📱';
                case 'furniture':
                    return '🪑';
                case 'hardware':
                case 'doityourself':
                    return '🔧';
                case 'hairdresser':
                case 'beauty':
                    return '💇';
                case 'car':
                case 'car_repair':
                    return '🚗';
                case 'florist':
                    return '💐';
                case 'optician':
                    return '👓';
                case 'jewelry':
                    return '💍';
                case 'sports':
                    return '⚽';
                case 'books':
                case 'stationery':
                    return '📚';
                case 'toys':
                    return '🧸';
                case 'pet':
                case 'veterinary':
                    return '🐾';
                default:
                    return '🏪';
            }
        }

        // Miejsca
        if (category === 'place' || category === 'boundary') {
            switch (type) {
                case 'city':
                case 'town':
                    return '🏙️';
                case 'village':
                case 'hamlet':
                case 'suburb':
                case 'neighbourhood':
                    return '🏘️';
                case 'country':
                    return '🌍';
                case 'state':
                case 'region':
                    return '🗺️';
                case 'county':
                case 'administrative':
                    return '🏛️';
                default:
                    return '📍';
            }
        }

        // Drogi / Ulice
        if (category === 'highway') {
            return '🛣️';
        }

        // Budynki / Adresy
        if (category === 'building' || type === 'house' || type === 'residential') {
            return '🏠';
        }

        // Transport
        if (category === 'railway' || category === 'public_transport') {
            return '🚉';
        }

        if (category === 'aeroway') {
            return '✈️';
        }

        // Turystyka
        if (category === 'tourism') {
            switch (type) {
                case 'hotel':
                case 'hostel':
                case 'motel':
                case 'guest_house':
                    return '🏨';
                case 'museum':
                    return '🏛️';
                case 'attraction':
                case 'viewpoint':
                    return '🎯';
                case 'camp_site':
                case 'caravan_site':
                    return '⛺';
                default:
                    return '🏖️';
            }
        }

        // Rekreacja
        if (category === 'leisure') {
            switch (type) {
                case 'park':
                case 'garden':
                    return '🌳';
                case 'playground':
                    return '🎠';
                case 'sports_centre':
                case 'stadium':
                case 'fitness_centre':
                    return '🏟️';
                case 'swimming_pool':
                    return '🏊';
                default:
                    return '🎪';
            }
        }

        // Domyślna ikona
        return '📍';
    }

    // Tłumaczenie nazw krajów na polski
    translateCountry(countryName, countryCode) {
        const countryTranslations = {
            // Popularne kraje
            'germany': 'Niemcy',
            'deutschland': 'Niemcy',
            'netherlands': 'Holandia',
            'nederland': 'Holandia',
            'france': 'Francja',
            'united kingdom': 'Wielka Brytania',
            'czech republic': 'Czechy',
            'czechia': 'Czechy',
            'česko': 'Czechy',
            'slovakia': 'Słowacja',
            'slovensko': 'Słowacja',
            'ukraine': 'Ukraina',
            'україна': 'Ukraina',
            'belarus': 'Białoruś',
            'беларусь': 'Białoruś',
            'lithuania': 'Litwa',
            'lietuva': 'Litwa',
            'russia': 'Rosja',
            'россия': 'Rosja',
            'austria': 'Austria',
            'österreich': 'Austria',
            'italy': 'Włochy',
            'italia': 'Włochy',
            'spain': 'Hiszpania',
            'españa': 'Hiszpania',
            'portugal': 'Portugalia',
            'belgium': 'Belgia',
            'belgië': 'Belgia',
            'belgique': 'Belgia',
            'switzerland': 'Szwajcaria',
            'schweiz': 'Szwajcaria',
            'suisse': 'Szwajcaria',
            'sweden': 'Szwecja',
            'sverige': 'Szwecja',
            'norway': 'Norwegia',
            'norge': 'Norwegia',
            'denmark': 'Dania',
            'danmark': 'Dania',
            'finland': 'Finlandia',
            'suomi': 'Finlandia',
            'hungary': 'Węgry',
            'magyarország': 'Węgry',
            'romania': 'Rumunia',
            'românia': 'Rumunia',
            'bulgaria': 'Bułgaria',
            'българия': 'Bułgaria',
            'croatia': 'Chorwacja',
            'hrvatska': 'Chorwacja',
            'slovenia': 'Słowenia',
            'slovenija': 'Słowenia',
            'greece': 'Grecja',
            'ελλάδα': 'Grecja',
            'turkey': 'Turcja',
            'türkiye': 'Turcja',
            'ireland': 'Irlandia',
            'éire': 'Irlandia',
            'united states': 'USA',
            'united states of america': 'USA',
            'canada': 'Kanada',
            'australia': 'Australia',
            'japan': 'Japonia',
            '日本': 'Japonia',
            'china': 'Chiny',
            '中国': 'Chiny',
            'india': 'Indie',
            'brazil': 'Brazylia',
            'brasil': 'Brazylia',
            'mexico': 'Meksyk',
            'méxico': 'Meksyk',
            'argentina': 'Argentyna',
            'south africa': 'RPA',
            'egypt': 'Egipt',
            'مصر': 'Egipt',
            'morocco': 'Maroko',
            'المغرب': 'Maroko',
            'israel': 'Izrael',
            'ישראל': 'Izrael',
            'saudi arabia': 'Arabia Saudyjska',
            'united arab emirates': 'ZEA',
            'luxembourg': 'Luksemburg',
            'malta': 'Malta',
            'cyprus': 'Cypr',
            'κύπρος': 'Cypr',
            'iceland': 'Islandia',
            'ísland': 'Islandia',
            'estonia': 'Estonia',
            'eesti': 'Estonia',
            'latvia': 'Łotwa',
            'latvija': 'Łotwa',
            'serbia': 'Serbia',
            'србија': 'Serbia',
            'montenegro': 'Czarnogóra',
            'црна гора': 'Czarnogóra',
            'bosnia and herzegovina': 'Bośnia i Hercegowina',
            'north macedonia': 'Macedonia Północna',
            'albania': 'Albania',
            'shqipëria': 'Albania',
            'kosovo': 'Kosowo',
            'moldova': 'Mołdawia'
        };

        // Sprawdź po nazwie (lowercase)
        const nameLower = (countryName || '').toLowerCase().trim();
        if (countryTranslations[nameLower]) {
            return countryTranslations[nameLower];
        }

        // Sprawdź po kodzie kraju
        const codeTranslations = {
            'de': 'Niemcy',
            'nl': 'Holandia',
            'fr': 'Francja',
            'gb': 'Wielka Brytania',
            'uk': 'Wielka Brytania',
            'cz': 'Czechy',
            'sk': 'Słowacja',
            'ua': 'Ukraina',
            'by': 'Białoruś',
            'lt': 'Litwa',
            'ru': 'Rosja',
            'at': 'Austria',
            'it': 'Włochy',
            'es': 'Hiszpania',
            'pt': 'Portugalia',
            'be': 'Belgia',
            'ch': 'Szwajcaria',
            'se': 'Szwecja',
            'no': 'Norwegia',
            'dk': 'Dania',
            'fi': 'Finlandia',
            'hu': 'Węgry',
            'ro': 'Rumunia',
            'bg': 'Bułgaria',
            'hr': 'Chorwacja',
            'si': 'Słowenia',
            'gr': 'Grecja',
            'tr': 'Turcja',
            'ie': 'Irlandia',
            'us': 'USA',
            'ca': 'Kanada',
            'au': 'Australia',
            'jp': 'Japonia',
            'cn': 'Chiny',
            'in': 'Indie',
            'br': 'Brazylia',
            'mx': 'Meksyk',
            'ar': 'Argentyna',
            'za': 'RPA',
            'eg': 'Egipt',
            'ma': 'Maroko',
            'il': 'Izrael',
            'sa': 'Arabia Saudyjska',
            'ae': 'ZEA',
            'lu': 'Luksemburg',
            'mt': 'Malta',
            'cy': 'Cypr',
            'is': 'Islandia',
            'ee': 'Estonia',
            'lv': 'Łotwa',
            'rs': 'Serbia',
            'me': 'Czarnogóra',
            'ba': 'Bośnia i Hercegowina',
            'mk': 'Macedonia Północna',
            'al': 'Albania',
            'xk': 'Kosowo',
            'md': 'Mołdawia'
        };

        const codeLower = (countryCode || '').toLowerCase();
        if (codeTranslations[codeLower]) {
            return codeTranslations[codeLower];
        }

        // Jeśli nie znaleziono tłumaczenia, zwróć oryginalną nazwę
        return countryName;
    }

    // Tłumaczenie kategorii/typu na polski
    translateCategory(item) {
        const category = item.class || item.category || '';
        const type = item.type || '';

        const translations = {
            // Sklepy
            'supermarket': 'Supermarket',
            'grocery': 'Sklep spożywczy',
            'convenience': 'Sklep convenience',
            'bakery': 'Piekarnia',
            'butcher': 'Sklep mięsny',
            'greengrocer': 'Warzywniak',
            'deli': 'Delikatesy',
            'alcohol': 'Sklep alkoholowy',
            'beverages': 'Sklep z napojami',
            'confectionery': 'Cukiernia',
            'clothes': 'Odzież',
            'shoes': 'Obuwie',
            'jewelry': 'Jubiler',
            'optician': 'Optyk',
            'cosmetics': 'Kosmetyki',
            'perfumery': 'Perfumeria',
            'hairdresser': 'Fryzjer',
            'beauty': 'Salon urody',
            'electronics': 'Elektronika',
            'computer': 'Komputery',
            'mobile_phone': 'Telefony',
            'hardware': 'Sklep budowlany',
            'doityourself': 'Majsterkowanie',
            'furniture': 'Meble',
            'garden_centre': 'Centrum ogrodnicze',
            'florist': 'Kwiaciarnia',
            'pet': 'Sklep zoologiczny',
            'toys': 'Zabawki',
            'sports': 'Artykuły sportowe',
            'books': 'Księgarnia',
            'stationery': 'Artykuły biurowe',
            'gift': 'Upominki',
            'car': 'Salon samochodowy',
            'car_parts': 'Części samochodowe',
            'car_repair': 'Warsztat samochodowy',
            'tyres': 'Opony',
            'bicycle': 'Rowery',
            'motorcycle': 'Motocykle',
            'kiosk': 'Kiosk',
            'newsagent': 'Prasa',
            'tobacco': 'Tytoniowy',
            'e-cigarette': 'E-papierosy',
            'mall': 'Centrum handlowe',
            'department_store': 'Dom towarowy',

            // Gastronomia
            'restaurant': 'Restauracja',
            'fast_food': 'Fast food',
            'cafe': 'Kawiarnia',
            'bar': 'Bar',
            'pub': 'Pub',
            'food_court': 'Food court',
            'ice_cream': 'Lody',
            'biergarten': 'Ogródek piwny',

            // Usługi
            'bank': 'Bank',
            'atm': 'Bankomat',
            'pharmacy': 'Apteka',
            'hospital': 'Szpital',
            'clinic': 'Klinika',
            'doctors': 'Przychodnia',
            'dentist': 'Dentysta',
            'veterinary': 'Weterynarz',
            'fuel': 'Stacja paliw',
            'charging_station': 'Ładowanie EV',
            'post_office': 'Poczta',
            'police': 'Policja',
            'fire_station': 'Straż pożarna',
            'library': 'Biblioteka',
            'cinema': 'Kino',
            'theatre': 'Teatr',
            'community_centre': 'Dom kultury',
            'townhall': 'Urząd',
            'courthouse': 'Sąd',
            'embassy': 'Ambasada',
            'school': 'Szkoła',
            'kindergarten': 'Przedszkole',
            'college': 'Liceum',
            'university': 'Uniwersytet',
            'driving_school': 'Szkoła jazdy',
            'music_school': 'Szkoła muzyczna',
            'language_school': 'Szkoła językowa',

            // Zakwaterowanie
            'hotel': 'Hotel',
            'hostel': 'Hostel',
            'motel': 'Motel',
            'guest_house': 'Pensjonat',
            'apartment': 'Apartament',
            'camp_site': 'Kemping',

            // Miejsca
            'city': 'Miasto',
            'town': 'Miasteczko',
            'village': 'Wieś',
            'hamlet': 'Przysiółek',
            'suburb': 'Dzielnica',
            'neighbourhood': 'Osiedle',
            'residential': 'Osiedle mieszkaniowe',
            'country': 'Kraj',
            'state': 'Województwo',
            'region': 'Region',
            'county': 'Powiat',
            'municipality': 'Gmina',
            'administrative': 'Jednostka administracyjna',

            // Budynki / Adresy
            'house': 'Adres',
            'building': 'Budynek',
            'apartments': 'Blok mieszkalny',

            // Drogi
            'primary': 'Droga główna',
            'secondary': 'Droga drugorzędna',
            'tertiary': 'Droga lokalna',
            'service': 'Droga serwisowa',
            'pedestrian': 'Deptak',
            'footway': 'Chodnik',
            'cycleway': 'Ścieżka rowerowa',

            // Transport
            'bus_station': 'Dworzec autobusowy',
            'bus_stop': 'Przystanek autobusowy',
            'train_station': 'Dworzec kolejowy',
            'tram_stop': 'Przystanek tramwajowy',
            'airport': 'Lotnisko',
            'ferry_terminal': 'Terminal promowy',
            'parking': 'Parking',
            'taxi': 'Postój taxi',

            // Rekreacja
            'park': 'Park',
            'garden': 'Ogród',
            'playground': 'Plac zabaw',
            'sports_centre': 'Centrum sportowe',
            'stadium': 'Stadion',
            'swimming_pool': 'Basen',
            'fitness_centre': 'Siłownia',
            'golf_course': 'Pole golfowe',
            'pitch': 'Boisko',

            // Turystyka
            'museum': 'Muzeum',
            'gallery': 'Galeria',
            'zoo': 'Zoo',
            'aquarium': 'Akwarium',
            'theme_park': 'Park rozrywki',
            'attraction': 'Atrakcja turystyczna',
            'viewpoint': 'Punkt widokowy',
            'monument': 'Pomnik',
            'memorial': 'Miejsce pamięci',
            'artwork': 'Dzieło sztuki',
            'castle': 'Zamek',
            'ruins': 'Ruiny',
            'archaeological_site': 'Stanowisko archeologiczne',

            // Religia
            'church': 'Kościół',
            'chapel': 'Kaplica',
            'cathedral': 'Katedra',
            'mosque': 'Meczet',
            'synagogue': 'Synagoga',
            'temple': 'Świątynia',
            'place_of_worship': 'Miejsce kultu',
            'cemetery': 'Cmentarz'
        };

        return translations[type] || null;
    }

    // Sprawdzenie czy to jest POI/firma
    isPoi(item) {
        const poiCategories = ['shop', 'amenity', 'tourism', 'leisure', 'office', 'craft'];
        const category = item.class || item.category || '';
        return poiCategories.includes(category);
    }

    // Sprawdzenie czy to jest miejscowość
    isPlace(item) {
        const category = item.class || item.category || '';
        const type = item.type || '';
        const placeTypes = ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'municipality', 'county', 'state', 'country'];

        return category === 'place' || category === 'boundary' || placeTypes.includes(type);
    }

    // Sprawdzenie czy to jest adres (ulica z numerem)
    isAddress(item) {
        const addr = item.address || {};
        return !!addr.house_number && !!addr.road;
    }

    // Wyświetlanie podpowiedzi
    displaySuggestions(data) {
        const suggestionsDiv = document.getElementById('suggestions');

        if (!data || data.length === 0) {
            if (!this.isBatchProcessing) {
                suggestionsDiv.innerHTML = '<div class="no-results">Nie znaleziono adresów</div>';
                suggestionsDiv.classList.add('show');
            } else {
                this.hideSuggestions();
            }
            return;
        }

        const uniqueAddresses = new Map();
        const processedResults = [];

        data.forEach((item, index) => {
            const address = this.formatNominatimAddress(item);
            const details = this.getNominatimAddressDetails(item);
            const lat = parseFloat(item.lat) || 0;
            const lon = parseFloat(item.lon) || 0;
            const distance = item.distance || 0;
            const matchScore = item.matchScore || 0;

            const key = address.toLowerCase().trim();

            if (!uniqueAddresses.has(key) || this.shouldReplaceAddress(uniqueAddresses.get(key), item)) {
                const result = {
                    address,
                    details,
                    lat,
                    lon,
                    distance,
                    matchScore,
                    originalIndex: index,
                    item,
                    icon: this.getPlaceIcon(item),
                    category: this.translateCategory(item),
                    isPoi: this.isPoi(item),
                    isPlace: this.isPlace(item),
                    isAddress: this.isAddress(item)
                };
                uniqueAddresses.set(key, result);

                const existingIndex = processedResults.findIndex(r => r.address.toLowerCase().trim() === key);
                if (existingIndex !== -1) {
                    processedResults.splice(existingIndex, 1);
                }
                processedResults.push(result);
            }
        });

        // Sortuj według matchScore (już zawiera bonus za odległość)
        processedResults.sort((a, b) => {
            if (a.matchScore !== b.matchScore) {
                return b.matchScore - a.matchScore;
            }
            return a.distance - b.distance;
        });

        const uniqueResults = processedResults.slice(0, 5);

        console.log('Finalne wyniki do wyświetlenia:',
            uniqueResults.map(r => `${r.icon} ${r.address} - score: ${r.matchScore}, dist: ${r.distance.toFixed(2)}km`));

        const suggestionsHTML = uniqueResults.map(result => {
            const escapedAddress = result.address.replace(/'/g, "\\'").replace(/"/g, '\\"');
            const distanceText = result.distance > 0 ? ` (${result.distance.toFixed(1)} km)` : '';

            let displayName = result.address;
            let favoriteClass = '';

            if (window.favoritesManager && typeof window.favoritesManager.isFavoriteByCoords === 'function') {
                if (typeof generateAddressKey === 'function') {
                    const addressKey = generateAddressKey(result.address, result.lat, result.lon);
                    if (window.favoritesManager.isFavorite(addressKey)) {
                        const favoriteName = window.favoritesManager.getFavoriteName(addressKey);
                        if (favoriteName) {
                            displayName = `${result.address} (${favoriteName})`;
                        }
                        favoriteClass = ' favorite-suggestion';
                    }
                } else {
                    if (window.favoritesManager.isFavoriteByCoords(result.address, result.lat, result.lon)) {
                        const favoriteName = window.favoritesManager.getFavoriteNameByCoords(result.address, result.lat, result.lon);
                        if (favoriteName) {
                            displayName = `${result.address} (${favoriteName})`;
                        }
                        favoriteClass = ' favorite-suggestion';
                    }
                }
            }

            // Buduj szczegóły z kategorią
            let detailsHtml = '';
            if (result.category || result.details) {
                const detailParts = [];
                if (result.category) {
                    detailParts.push(`<span class="category-tag">${result.category}</span>`);
                }
                if (result.details) {
                    detailParts.push(result.details);
                }
                detailsHtml = `<div class="address-details">${detailParts.join(' • ')}</div>`;
            }

            return `
                <div class="suggestion-item${favoriteClass}"
                     data-address="${escapedAddress}"
                     data-lat="${result.lat}"
                     data-lon="${result.lon}">
                    <div class="address-main">${result.icon} ${displayName}${distanceText}</div>
                    ${detailsHtml}
                </div>
            `;
        }).join('');

        suggestionsDiv.innerHTML = suggestionsHTML;
        suggestionsDiv.classList.add('show');

        document.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const address = item.dataset.address;
                const lat = parseFloat(item.dataset.lat);
                const lon = parseFloat(item.dataset.lon);
                this.selectAddress(address, lat, lon);
            });
        });
    }

    // Formatowanie adresu z Nominatim - POPRAWIONE dla zagranicznych lokalizacji
    formatNominatimAddress(item) {
        const addr = item.address || {};
        let parts = [];

        // Pobierz nazwę POI (firma, sklep, itp.)
        const poiName = item.name || addr.name || addr.shop || addr.amenity || addr.tourism ||
                        addr.leisure || addr.office || addr.craft || addr.brand;

        // Sprawdź czy to jest POI
        const isPoi = this.isPoi(item);

        // Sprawdź czy to jest miejscowość
        const isPlace = this.isPlace(item);

        // === POPRAWKA: Dla miejscowości użyj item.name jako głównej nazwy ===
        if (isPlace && item.name) {
            parts.push(item.name);
        }
        // Dla POI dodaj nazwę POI
        else if (poiName && isPoi) {
            parts.push(poiName);
        }

        // Dodaj nazwę ulicy i numer domu
        if (addr.road && addr.house_number) {
            parts.push(`${addr.road} ${addr.house_number}`);
        } else if (addr.road) {
            // Sprawdź czy ulica nie jest już w parts
            const roadAlreadyAdded = parts.some(p => p.toLowerCase().includes(addr.road.toLowerCase()));
            if (!roadAlreadyAdded) {
                parts.push(addr.road);
            }
        } else if (addr.house_number) {
            parts.push(addr.house_number);
        }

        // Dodaj miejscowość - ale tylko jeśli nie jest już dodana
        const city = addr.city || addr.town || addr.village || addr.municipality;
        if (city) {
            const cityAlreadyAdded = parts.some(p => p.toLowerCase() === city.toLowerCase());
            if (!cityAlreadyAdded) {
                parts.push(city);
            }
        }

        // === POPRAWKA: NIE dodawaj kraju do głównej nazwy ===
        // Kraj będzie widoczny tylko w szczegółach (getNominatimAddressDetails)

        let result = parts.length > 0 ? parts.join(', ') : '';

        // Fallback na display_name - bierz tylko pierwszą część (bez kraju)
        if (!result && item.display_name) {
            const displayParts = item.display_name.split(',');
            const firstPart = displayParts[0].trim();

            // Jeśli pierwsza część to numer, weź drugą
            if (/^\d+$/.test(firstPart) && displayParts.length > 1) {
                result = displayParts[1].trim();
            } else {
                result = firstPart;
            }
        }

        return result || 'Nieznany adres';
    }

    // Pobieranie szczegółów adresu - z tłumaczeniem kraju na polski
    getNominatimAddressDetails(item) {
        const addr = item.address || {};
        let details = [];

        // Kod pocztowy
        if (addr.postcode) {
            details.push(addr.postcode);
        }

        // Dzielnica/osiedle
        const name = item.name || addr.name || '';
        if (addr.suburb && addr.suburb !== (addr.city || addr.town || addr.village) && addr.suburb !== name) {
            details.push(addr.suburb);
        }

        if (addr.neighbourhood && addr.neighbourhood !== name && addr.neighbourhood !== addr.suburb) {
            details.push(addr.neighbourhood);
        }

        // Powiat
        const city = addr.city || addr.town || addr.village || '';
        if (addr.county && !addr.county.includes(city) && city !== '') {
            details.push(addr.county);
        }

        // Województwo/Region
        if (addr.state) {
            const state = addr.state.replace('województwo ', 'woj. ');
            if (!details.some(detail => detail.includes(state))) {
                details.push(state);
            }
        }

        // Kraj (dla zagranicznych) - PRZETŁUMACZONY na polski
        const countryCode = (addr.country_code || '').toLowerCase();
        if (countryCode && countryCode !== 'pl' && addr.country) {
            const translatedCountry = this.translateCountry(addr.country, countryCode);
            details.push(translatedCountry);
        }

        return details.length > 0 ? details.join(', ') : '';
    }

    // Sprawdzanie czy zastąpić adres
    shouldReplaceAddress(existing, newItem) {
        const existingHasNumber = existing.item.address?.house_number;
        const newHasNumber = newItem.address?.house_number;

        if (newHasNumber && !existingHasNumber) {
            return true;
        }

        const preferredTypes = ['house', 'building'];
        const existingIsPreferred = preferredTypes.includes(existing.item.type);
        const newIsPreferred = preferredTypes.includes(newItem.type);

        if (newIsPreferred && !existingIsPreferred) {
            return true;
        }

        return false;
    }

    // Obliczanie odległości (wzór haversine)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    // Obliczanie dopasowania adresu do zapytania - POPRAWIONE PRIORYTETY
    calculateQueryMatch(item, query) {
        const queryLower = query.toLowerCase().trim();
        const queryWords = queryLower.split(/\s+/);
        const addr = item.address || {};
        let score = 0;

        const category = item.class || item.category || '';
        const type = item.type || '';
        const name = (item.name || addr.name || '').toLowerCase();
        const isPoi = this.isPoi(item);
        const isPlace = this.isPlace(item);

        // Sprawdź czy zapytanie zawiera numer domu
        const hasNumberInQuery = /\d+[A-Za-z]?(\/\d+)?/.test(query);
        const numberInQuery = query.match(/\d+[A-Za-z]?(\/\d+)?/)?.[0] || '';

        // Sprawdź czy wynik ma numer domu
        const hasHouseNumber = !!addr.house_number;
        const houseNumber = (addr.house_number || '').toLowerCase();

        // === DOKŁADNE DOPASOWANIE ADRESU Z NUMEREM (NAJWYŻSZY PRIORYTET) ===
        if (hasNumberInQuery && hasHouseNumber) {
            const road = (addr.road || '').toLowerCase();
            const queryWithoutNumber = queryLower.replace(/\d+[A-Za-z]?(\/\d+)?/, '').trim();

            // Dokładne dopasowanie ulicy i numeru
            if (road.includes(queryWithoutNumber) && houseNumber === numberInQuery) {
                score += 15000;
            }
            // Częściowe dopasowanie ulicy, dokładny numer
            else if (road.includes(queryWithoutNumber) || queryWithoutNumber.includes(road)) {
                if (houseNumber === numberInQuery) {
                    score += 12000;
                } else if (houseNumber.startsWith(numberInQuery) || numberInQuery.startsWith(houseNumber)) {
                    score += 8000;
                }
            }
            // Ulica pasuje, ale numer nie
            else if (road.includes(queryWithoutNumber)) {
                score += 4000;
            }
        }

        // === ADRESY BEZ NUMERU W ZAPYTANIU ===
        if (!hasNumberInQuery) {
            const road = (addr.road || '').toLowerCase();
            if (road && road.includes(queryLower)) {
                score += 3000;
                if (hasHouseNumber) {
                    score += 500;
                }
            } else if (road && queryLower.includes(road)) {
                score += 2000;
            }
        }

        // === MIEJSCOWOŚCI ===
        const city = (addr.city || addr.town || addr.village || addr.municipality || '').toLowerCase();

        if (isPlace && name === queryLower) {
            score += 10000;
        } else if (isPlace && name.startsWith(queryLower)) {
            score += 8000;
        } else if (isPlace && name.includes(queryLower)) {
            score += 6000;
        }

        if (city === queryLower) {
            score += 5000;
        } else if (city.startsWith(queryLower)) {
            score += 4000;
        } else if (city.includes(queryLower)) {
            score += 2000;
        }

        // === POI / FIRMY (NIŻSZY PRIORYTET) ===
        if (isPoi) {
            const poiName = (item.name || addr.shop || addr.amenity || addr.brand || '').toLowerCase();

            // Jeśli szukamy adresu z numerem, POI ma znacznie niższy priorytet
            if (hasNumberInQuery) {
                if (poiName === queryLower) {
                    score += 500;
                } else if (poiName.includes(queryLower) || queryLower.includes(poiName)) {
                    score += 200;
                }
            } else {
                if (poiName === queryLower) {
                    score += 1000;
                } else if (poiName.includes(queryLower)) {
                    score += 600;
                } else if (queryLower.includes(poiName) && poiName.length > 2) {
                    score += 400;
                }
            }

            // Dopasowanie marki
            const brand = (addr.brand || item.extratags?.brand || '').toLowerCase();
            if (brand && brand.includes(queryLower)) {
                score += hasNumberInQuery ? 100 : 500;
            }
        }

        // === BONUS ZA TYP MIEJSCA ===
        if (isPlace) {
            if (type === 'city' || type === 'town') {
                score += 3000;
            } else if (type === 'village') {
                score += 2500;
            } else if (type === 'suburb' || type === 'neighbourhood') {
                score += 2000;
            }
        }

        // === FALLBACK ===
        const displayName = (item.display_name || '').toLowerCase();
        if (score === 0 && displayName.includes(queryLower)) {
            score += 50;
        }

        return score;
    }

    // Filtrowanie i sortowanie wyników - Z UWZGLĘDNIENIEM ODLEGŁOŚCI
    filterAndSortResults(data, query) {
        let userLat = null;
        let userLng = null;

        if (this.mapManager && this.mapManager.currentLat !== null && this.mapManager.currentLng !== null) {
            userLat = this.mapManager.currentLat;
            userLng = this.mapManager.currentLng;
        }

        console.log('Pozycja użytkownika do filtrowania:', userLat, userLng);
        console.log('Zapytanie użytkownika:', query);

        // Sprawdź czy zapytanie zawiera numer domu
        const hasNumberInQuery = /\d+[A-Za-z]?(\/\d+)?/.test(query);

        const resultsWithDistance = data.map(item => {
            const itemLat = parseFloat(item.lat);
            const itemLng = parseFloat(item.lon);

            let distance = 0;
            if (userLat !== null && userLng !== null) {
                distance = this.calculateDistance(userLat, userLng, itemLat, itemLng);
            }

            let matchScore = this.calculateQueryMatch(item, query);

            // === BONUS ZA ODLEGŁOŚĆ ===
            if (userLat !== null && userLng !== null && distance >= 0) {
                let distanceBonus = 0;

                if (distance <= 0.3) {
                    distanceBonus = 8000;
                } else if (distance <= 0.5) {
                    distanceBonus = 6000;
                } else if (distance <= 1) {
                    distanceBonus = 5000;
                } else if (distance <= 2) {
                    distanceBonus = 4000;
                } else if (distance <= 5) {
                    distanceBonus = 3000;
                } else if (distance <= 10) {
                    distanceBonus = 2000;
                } else if (distance <= 20) {
                    distanceBonus = 1000;
                } else if (distance <= 50) {
                    distanceBonus = 500;
                } else if (distance <= 100) {
                    distanceBonus = 200;
                }

                matchScore += distanceBonus;
            }

            return {
                ...item,
                distance: distance,
                matchScore: matchScore
            };
        });

        // Filtruj wyniki w rozsądnym promieniu
        let filteredResults = resultsWithDistance;
        if (userLat !== null && userLng !== null) {
            const maxDistance = hasNumberInQuery ? 100 : 10000;
            filteredResults = resultsWithDistance.filter(item => item.distance <= maxDistance);
        }

        // Sortowanie
        filteredResults.sort((a, b) => {
            if (a.matchScore !== b.matchScore) {
                return b.matchScore - a.matchScore;
            }
            return a.distance - b.distance;
        });

        console.log('Wyniki posortowane:',
            filteredResults.slice(0, 10).map(r => {
                const name = r.name || r.display_name?.split(',')[0] || 'brak nazwy';
                const addr = r.address || {};
                const road = addr.road || '';
                const houseNum = addr.house_number || '';
                return `${name} (${road} ${houseNum}) - score: ${r.matchScore}, dist: ${r.distance.toFixed(2)}km`;
            }));

        return filteredResults;
    }

    // Wybieranie adresu
    selectAddress(address, lat, lon) {
        console.log('Wybrano adres:', address, lat, lon);
        document.getElementById('address-input').value = '';
        this.hideSuggestions();

        const timeFromInput = document.getElementById('address-time-from');
        const timeToInput = document.getElementById('address-time-to');
        const timeFrom = timeFromInput ? timeFromInput.value : '';
        const timeTo = timeToInput ? timeToInput.value : '';

        console.log(`Pobrane wartości godzin dla adresu ${address}: timeFrom=${timeFrom}, timeTo=${timeTo}`);

        try {
            this.mapManager.addMarker(lat, lon, address);
            console.log(`Przekazuję do addAddressToTable: address=${address}, lat=${lat}, lon=${lon}, timeFrom=${timeFrom}, timeTo=${timeTo}`);
            this.tableManager.addAddressToTable(address, lat, lon, false, false, timeFrom, timeTo, null, '', false);

            const addressKey = typeof generateAddressKey === 'function'
                ? generateAddressKey(address, lat, lon)
                : `${address}_${lat}_${lon}`;
            const addedAddress = this.tableManager.addresses.find(a => a.id === addressKey);
            if (addedAddress) {
                console.log(`Adres został dodany do tablicy: ${JSON.stringify(addedAddress)}`);
            } else {
                console.warn(`Adres nie został dodany do tablicy!`);
            }
        } catch (error) {
            console.error('Błąd podczas dodawania adresu:', error);
            alert('Wystąpił błąd podczas dodawania adresu');
        }

        if (timeFromInput) timeFromInput.value = '';
        if (timeToInput) timeToInput.value = '';
    }

    // ===== HURTOWE DODAWANIE ADRESÓW =====

    parseMultipleAddresses(inputText) {
        console.log('Parsowanie wielu adresów z tekstu:', inputText);

        const words = inputText.trim().split(/\s+/);
        if (words.length < 3) return [];

        const city = words[0];
        const rest = words.slice(1);

        const numberPattern = /^\d+[A-Za-z]?(\/\d+)?$/;
        let addresses = [];
        let buffer = [];

        for (let i = 0; i < rest.length; i++) {
            const word = rest[i];

            if (numberPattern.test(word)) {
                const street = buffer.join(" ");
                addresses.push({
                    city,
                    street,
                    number: word,
                    fullAddress: `${street} ${word}, ${city}`
                });
                buffer = [];
            } else {
                buffer.push(word);
            }
        }

        if (buffer.length > 0) {
            const street = buffer.join(" ");
            addresses.push({
                city,
                street,
                number: null,
                fullAddress: `${street}, ${city}`
            });
        }

        console.log("Sparsowano adresy:", addresses);
        return addresses;
    }

    async searchAndAddMultipleAddresses(inputText) {
        console.log('Rozpoczynam hurtowe dodawanie adresów:', inputText);

        this.hideSuggestions();
        this.batchCancelRequested = false;

        const suggestionsDiv = document.getElementById('suggestions');
        if (suggestionsDiv) {
            suggestionsDiv.innerHTML = '<div class="batch-info">Rozpoczynam hurtowe dodawanie adresów...</div>';
            suggestionsDiv.classList.add('show');
        }

        const parsedAddresses = this.parseMultipleAddresses(inputText);

        if (parsedAddresses.length === 0) {
            console.log('Nie znaleziono wzorca wielu adresów, próbuję jako pojedynczy adres');
            const singleResult = await this.searchSingleAddressForBatch(inputText);

            if (singleResult) {
                this.tableManager.addAddress(
                    singleResult.address,
                    singleResult.lat,
                    singleResult.lon
                );
                this.showBatchSummary(1, []);
            } else {
                this.showBatchSummary(0, [inputText]);
            }

            this.isBatchProcessing = false;
            return;
        }

        this.showBatchProgress(`Wyszukuję ${parsedAddresses.length} adresów...`, 0, parsedAddresses.length);

        let successCount = 0;
        let failedAddresses = [];

        const timeFromInput = document.getElementById('address-time-from');
        const timeToInput = document.getElementById('address-time-to');
        const timeFrom = timeFromInput ? timeFromInput.value : '';
        const timeTo = timeToInput ? timeToInput.value : '';

        for (let i = 0; i < parsedAddresses.length; i++) {
            const addressData = parsedAddresses[i];

            if (this.batchCancelRequested) {
                console.warn('Hurtowe dodawanie zostało anulowane przez użytkownika');
                break;
            }

            try {
                this.showBatchProgress(`Wyszukuję: ${addressData.fullAddress}`, i, parsedAddresses.length);

                const result = await this.searchSingleAddressForBatch(addressData.fullAddress);

                if (result) {
                    this.mapManager.addMarker(result.lat, result.lon, result.address);
                    this.tableManager.addAddressToTable(
                        result.address,
                        result.lat,
                        result.lon,
                        false,
                        false,
                        timeFrom,
                        timeTo,
                        null,
                        '',
                        false
                    );
                    successCount++;
                    console.log(`Pomyślnie dodano adres: ${result.address}`);
                } else {
                    failedAddresses.push(addressData.fullAddress);
                    console.warn(`Nie znaleziono adresu: ${addressData.fullAddress}`);
                }

                await this.sleep(200);

            } catch (error) {
                console.error(`Błąd podczas wyszukiwania adresu ${addressData.fullAddress}:`, error);
                failedAddresses.push(addressData.fullAddress);
            }
        }

        this.hideBatchProgress();
        this.hideSuggestions();
        this.showBatchSummary(successCount, failedAddresses);
        this.batchCancelRequested = false;

        if (timeFromInput) timeFromInput.value = '';
        if (timeToInput) timeToInput.value = '';

        document.getElementById('address-input').value = '';
        this.isBatchProcessing = false;
    }

    async searchSingleAddressForBatch(address) {
        console.log('Wyszukiwanie adresu dla trybu hurtowego:', address);
        const url = `https://optidrog.pl/address_search.php?format=json&limit=1&q=${encodeURIComponent(address)}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Address Search App'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data && data.length > 0) {
                const result = data[0];
                const formattedAddress = this.formatNominatimAddress(result);
                console.log('Znaleziono adres:', formattedAddress, 'lat:', parseFloat(result.lat), 'lon:', parseFloat(result.lon));
                return {
                    address: formattedAddress,
                    lat: parseFloat(result.lat),
                    lon: parseFloat(result.lon)
                };
            }

            console.log('Nie znaleziono adresu:', address);
            return null;
        } catch (error) {
            console.error('Błąd podczas wyszukiwania adresu:', error);
            return null;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showBatchProgress(message, current, total) {
        this.hideSuggestions();

        if (this.batchCancelRequested) {
            return;
        }

        let progressDiv = document.getElementById('batch-progress');

        if (!progressDiv) {
            progressDiv = document.createElement('div');
            progressDiv.id = 'batch-progress';
            progressDiv.className = 'batch-progress';
            document.body.appendChild(progressDiv);
        }

        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        progressDiv.innerHTML = `
            <div class="batch-progress-header">
                Hurtowe dodawanie adresów
                <button id="batch-cancel-btn" class="batch-cancel-btn" title="Anuluj">✕</button>
            </div>
            <div class="batch-progress-message">${message}</div>
            <div class="batch-progress-bar-container">
                <div class="batch-progress-bar" style="width: ${percentage}%;"></div>
            </div>
            <div class="batch-progress-percentage">${current}/${total} (${percentage}%)</div>
        `;

        const cancelBtn = progressDiv.querySelector('#batch-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.batchCancelRequested = true;
                this.isBatchProcessing = false;
                progressDiv.innerHTML = `
                    <div class="batch-progress-header">Anulowano hurtowe dodawanie</div>
                    <div class="batch-progress-message">Kończenie bieżącej operacji...</div>
                `;
                setTimeout(() => {
                    this.hideBatchProgress();
                }, 300);
            }, { once: true });
        }
    }

    hideBatchProgress() {
        const progressDiv = document.getElementById('batch-progress');
        if (progressDiv) {
            progressDiv.remove();
        }
        this.hideSuggestions();
    }

    showBatchSummary(successCount, failedAddresses) {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'batch-summary';

        if (this.batchCancelRequested) {
            summaryDiv.classList.add('warning');
        } else if (successCount > 0) {
            summaryDiv.classList.add('success');
        } else {
            summaryDiv.classList.add('error');
        }

        let summaryText = `Pomyślnie dodano ${successCount} adresów`;

        if (this.batchCancelRequested) {
            summaryText = `Operację anulowano przez użytkownika.\n` + summaryText;
        }

        if (failedAddresses.length > 0) {
            summaryText += `\nNie znaleziono ${failedAddresses.length} adresów:`;
            failedAddresses.forEach(addr => {
                summaryText += `\n• ${addr}`;
            });
        }

        summaryDiv.innerHTML = `
            <div class="batch-summary-text">${summaryText}</div>
            <button onclick="this.parentElement.remove()" class="batch-summary-button">Zamknij</button>
        `;

        document.body.appendChild(summaryDiv);

        setTimeout(() => {
            if (summaryDiv.parentElement) {
                summaryDiv.remove();
            }
        }, 10000);
    }

    showLoading() {
        const suggestionsDiv = document.getElementById('suggestions');
        suggestionsDiv.innerHTML = '<div class="loading">Wyszukiwanie...</div>';
        suggestionsDiv.classList.add('show');
    }

    hideLoading() {
        // Placeholder
    }

    async reverseGeocode(lat, lon) {
        console.log('Odwrotne geokodowanie:', lat, lon);
        const url = `https://optidrog.pl/address_search.php?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Address Search App'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data && data.display_name) {
                this.selectAddress(data.display_name, lat, lon);
            } else {
                alert('Nie znaleziono adresu dla tej lokalizacji');
            }
        } catch (error) {
            console.error('Błąd podczas odwrotnego geokodowania:', error);
            alert('Wystąpił błąd podczas wyszukiwania adresu');
        }
    }

    showError(message) {
        if (this.isBatchProcessing) {
            return;
        }

        const suggestionsDiv = document.getElementById('suggestions');
        suggestionsDiv.innerHTML = `<div class="no-results">${message}</div>`;
        suggestionsDiv.classList.add('show');
    }

    hideSuggestions() {
        const suggestionsDiv = document.getElementById('suggestions');
        if (suggestionsDiv) {
            suggestionsDiv.classList.remove('show');
        }
    }

    // ===== ROZPOZNAWANIE MOWY =====

    startVoiceRecognition() {
        const voiceButton = document.getElementById('voice-button');
        const addressInput = document.getElementById('address-input');

        if (!voiceButton || !addressInput) {
            console.error('Elementy rozpoznawania mowy nie zostały znalezione');
            return;
        }

        if (typeof Android === 'undefined' || !Android.startSpeechRecognition) {
            console.error('Android interfejs rozpoznawania mowy nie jest dostępny');
            this.showPermissionError('Rozpoznawanie mowy nie jest dostępne w tej wersji aplikacji');
            return;
        }

        if (typeof Android.checkSpeechRecognitionAvailability === 'function') {
            const availability = Android.checkSpeechRecognitionAvailability();
            if (availability !== 'available') {
                this.handlePermissionResult(availability);
                return;
            }
        }

        voiceButton.classList.add('listening');
        voiceButton.title = 'Słucham...';

        addressInput.value = '';
        addressInput.placeholder = 'Mów teraz...';

        window.speechRecognitionResult = (status, result) => {
            this.handleSpeechRecognitionResult(status, result);
        };

        window.speechRecognitionPartialResult = (partialText) => {
            this.handleSpeechRecognitionPartialResult(partialText);
        };

        window.speechRecognitionPermissionResult = (result) => {
            this.handlePermissionResult(result);
        };

        try {
            Android.startSpeechRecognition();
        } catch (error) {
            console.error('Błąd podczas rozpoczynania rozpoznawania mowy:', error);
            this.resetVoiceButton();
            this.showPermissionError('Błąd podczas rozpoznawania mowy');
        }
    }

    handleSpeechRecognitionPartialResult(partialText) {
        const addressInput = document.getElementById('address-input');

        if (addressInput && partialText) {
            addressInput.value = partialText;

            if (partialText.trim().length >= 3) {
                this.currentQuery = partialText.trim();
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    if (partialText.trim() === this.currentQuery) {
                        this.searchAddresses(partialText.trim());
                    }
                }, 300);
            } else {
                this.hideSuggestions();
            }
        }
    }

    handleSpeechRecognitionResult(status, result) {
        this.resetVoiceButton();
        const addressInput = document.getElementById('address-input');

        if (status === 'success' && result) {
            addressInput.value = result;
            addressInput.placeholder = 'Wprowadź adres do wyszukania';

            const words = result.trim().split(/\s+/);
            if (words.length >= 3) {
                const parsedAddresses = this.parseMultipleAddresses(result.trim());
                if (parsedAddresses.length > 1) {
                    this.searchAndAddMultipleAddresses(result.trim());
                    return;
                }
            }

            if (result.trim().length >= 3) {
                this.currentQuery = result.trim();
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    if (result.trim() === this.currentQuery) {
                        this.searchAddresses(result.trim());
                    }
                }, 300);
            }

            console.log('Rozpoznano mowę:', result);
        } else {
            const errorMessage = result || 'Nie udało się rozpoznać mowy';
            console.error('Błąd rozpoznawania mowy:', errorMessage);
            addressInput.placeholder = 'Wprowadź adres do wyszukania';
            setTimeout(() => {
                alert(`Błąd rozpoznawania mowy: ${errorMessage}`);
            }, 100);
        }
    }

    handlePermissionResult(result) {
        this.resetVoiceButton();

        switch (result) {
            case 'no_permission':
                this.showPermissionError(
                    'Do korzystania z rozpoznawania mowy potrzebne są uprawnienia do nagrywania dźwięku.',
                    'no_permission'
                );
                break;
            case 'denied':
                this.showPermissionError(
                    'Rozpoznawanie mowy nie będzie dostępne bez uprawnień do nagrywania dźwięku. Możesz włączyć uprawnienia w ustawieniach aplikacji.',
                    'denied'
                );
                break;
            case 'not_available':
                let detailedMessage = 'Rozpoznawanie mowy nie jest dostępne na tym urządzeniu.';
                if (typeof Android !== 'undefined' && typeof Android.getSpeechRecognitionDiagnostics === 'function') {
                    try {
                        detailedMessage = Android.getSpeechRecognitionDiagnostics();
                    } catch (e) {
                        console.error('Błąd podczas pobierania diagnostyki:', e);
                    }
                }
                this.showPermissionError(detailedMessage, 'not_available');
                break;
            case 'granted':
                console.log('Uprawnienia do rozpoznawania mowy zostały przyznane');
                break;
            default:
                this.showPermissionError('Nieznany błąd uprawnień rozpoznawania mowy.', 'unknown');
        }
    }

    showPermissionError(message, errorType = 'unknown') {
        const addressInput = document.getElementById('address-input');
        if (addressInput) {
            addressInput.placeholder = 'Wprowadź adres do wyszukania';
        }

        let actionButtonHtml = '';
        if (errorType === 'no_permission') {
            actionButtonHtml = '<button class="error-action" onclick="this.parentElement.parentElement.remove(); window.requestMicrophonePermission();">Udziel uprawnień</button>';
        } else if (errorType === 'denied') {
            actionButtonHtml = '<button class="error-action" onclick="this.parentElement.parentElement.remove(); window.openAppSettings();">Otwórz ustawienia</button>';
        } else if (errorType === 'not_available') {
            actionButtonHtml = '<button class="error-action" onclick="this.parentElement.parentElement.remove(); Android.openGooglePlayForGoogleApp();">Otwórz Google Play</button>';
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'permission-error';
        errorDiv.innerHTML = `
            <div class="error-content">
                <div class="error-icon">🎤</div>
                <div class="error-message">${message}</div>
                <button class="error-close" onclick="this.parentElement.parentElement.remove()">✕</button>
            </div>
            ${actionButtonHtml ? `<div class="error-actions">${actionButtonHtml}</div>` : ''}
        `;

        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff4444;
            color: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 90%;
            font-size: 14px;
        `;

        errorDiv.querySelector('.error-content').style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
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
        `;

        const actionButton = errorDiv.querySelector('.error-action');
        if (actionButton) {
            actionButton.style.cssText = `
                background: #ffffff;
                color: #ff4444;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                margin-top: 10px;
                width: 100%;
            `;
        }

        const actionsContainer = errorDiv.querySelector('.error-actions');
        if (actionsContainer) {
            actionsContainer.style.cssText = `
                margin-top: 10px;
                text-align: center;
            `;
        }

        document.body.appendChild(errorDiv);

        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 8000);
    }

    requestMicrophonePermission() {
        console.log('Wywołano requestMicrophonePermission z JavaScript');
        if (typeof Android !== 'undefined' && Android.requestMicrophonePermission) {
            try {
                console.log('Wywołuję Android.requestMicrophonePermission()');
                Android.requestMicrophonePermission();
            } catch (error) {
                console.error('Błąd podczas żądania uprawnień mikrofonu:', error);
            }
        } else {
            console.error('Android interfejs żądania uprawnień nie jest dostępny');
        }
    }

    openAppSettings() {
        if (typeof Android !== 'undefined' && Android.openAppSettings) {
            try {
                Android.openAppSettings();
            } catch (error) {
                console.error('Błąd podczas otwierania ustawień aplikacji:', error);
            }
        } else {
            console.error('Android interfejs otwierania ustawień nie jest dostępny');
        }
    }

    resetVoiceButton() {
        const voiceButton = document.getElementById('voice-button');
        if (voiceButton) {
            voiceButton.classList.remove('listening');
            voiceButton.title = 'Rozpoznaj mowę';
        }

        window.speechRecognitionResult = null;
        window.speechRecognitionPartialResult = null;
        window.speechRecognitionPermissionResult = null;
    }

    // ===== UPRAWNIENIA DO APARATU =====

    checkCameraAvailability() {
        if (typeof Android !== 'undefined' && Android.checkCameraAvailability) {
            try {
                return Android.checkCameraAvailability();
            } catch (error) {
                console.error('Błąd podczas sprawdzania dostępności aparatu:', error);
                return 'not_available';
            }
        } else {
            console.error('Android interfejs sprawdzania aparatu nie jest dostępny');
            return 'not_available';
        }
    }

    requestCameraPermission() {
        console.log('Wywołano requestCameraPermission z JavaScript');
        if (typeof Android !== 'undefined' && Android.requestCameraPermission) {
            try {
                console.log('Wywołuję Android.requestCameraPermission()');
                Android.requestCameraPermission();
            } catch (error) {
                console.error('Błąd podczas żądania uprawnień aparatu:', error);
            }
        } else {
            console.error('Android interfejs żądania uprawnień aparatu nie jest dostępny');
        }
    }

    handleCameraPermissionResult(result) {
        switch (result) {
            case 'no_permission':
                this.showCameraPermissionError(
                    'Do korzystania z podglądu z aparatu potrzebne są uprawnienia do kamery.',
                    'no_permission'
                );
                break;
            case 'denied':
                this.showCameraPermissionError(
                    'Podgląd z aparatu nie będzie dostępny bez uprawnień do kamery. Możesz włączyć uprawnienia w ustawieniach aplikacji.',
                    'denied'
                );
                break;
            case 'not_available':
                this.showCameraPermissionError(
                    'Aparat nie jest dostępny na tym urządzeniu.',
                    'not_available'
                );
                break;
            case 'granted':
                console.log('Uprawnienia do aparatu zostały przyznane');
                break;
            default:
                this.showCameraPermissionError(
                    'Nieznany błąd uprawnień aparatu.',
                    'unknown'
                );
        }
    }

    showCameraPermissionError(message, errorType = 'unknown') {
        let actionButtonHtml = '';
        if (errorType === 'no_permission') {
            actionButtonHtml = '<button class="error-action" onclick="this.parentElement.parentElement.remove(); window.requestCameraPermission();">Udziel uprawnień</button>';
        } else if (errorType === 'denied') {
            actionButtonHtml = '<button class="error-action" onclick="this.parentElement.parentElement.remove(); window.openAppSettings();">Otwórz ustawienia</button>';
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'permission-error camera-error';
        errorDiv.innerHTML = `
            <div class="error-content">
                <div class="error-icon">📷</div>
                <div class="error-message">${message}</div>
                <button class="error-close" onclick="this.parentElement.parentElement.remove()">✕</button>
            </div>
            ${actionButtonHtml ? `<div class="error-actions">${actionButtonHtml}</div>` : ''}
        `;

        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff9800;
            color: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 90%;
            font-size: 14px;
        `;

        errorDiv.querySelector('.error-content').style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
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
        `;

        const actionButton = errorDiv.querySelector('.error-action');
        if (actionButton) {
            actionButton.style.cssText = `
                background: #ffffff;
                color: #ff9800;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                margin-top: 10px;
                width: 100%;
            `;
        }

        const actionsContainer = errorDiv.querySelector('.error-actions');
        if (actionsContainer) {
            actionsContainer.style.cssText = `
                margin-top: 10px;
                text-align: center;
            `;
        }

        document.body.appendChild(errorDiv);

        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 8000);
    }
}

// Eksport klasy globalnie
window.AddressSearchManager = AddressSearchManager;
console.log('AddressSearchManager załadowany');

// Globalne funkcje dla przycisków w powiadomieniach
window.requestMicrophonePermission = function () {
    console.log('Wywołano globalną funkcję requestMicrophonePermission');
    if (window.optiDrogApp && window.optiDrogApp.getAddressSearchManager) {
        console.log('Znaleziono optiDrogApp i getAddressSearchManager');
        window.optiDrogApp.getAddressSearchManager().requestMicrophonePermission();
    } else {
        console.error('Nie znaleziono optiDrogApp lub getAddressSearchManager');
    }
};

window.requestCameraPermission = function () {
    console.log('Wywołano globalną funkcję requestCameraPermission');
    if (window.optiDrogApp && window.optiDrogApp.getAddressSearchManager) {
        console.log('Znaleziono optiDrogApp i getAddressSearchManager');
        window.optiDrogApp.getAddressSearchManager().requestCameraPermission();
    } else {
        console.error('Nie znaleziono optiDrogApp lub getAddressSearchManager');
    }
};

window.openAppSettings = function () {
    if (window.optiDrogApp && window.optiDrogApp.getAddressSearchManager) {
        window.optiDrogApp.getAddressSearchManager().openAppSettings();
    }
};

window.cameraPermissionResult = function (result) {
    console.log('Otrzymano wynik uprawnień aparatu:', result);
    if (window.optiDrogApp && window.optiDrogApp.getAddressSearchManager) {
        window.optiDrogApp.getAddressSearchManager().handleCameraPermissionResult(result);
    }
};