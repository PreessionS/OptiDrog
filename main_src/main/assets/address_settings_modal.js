/**
 * Klasa zarządzająca modalem ustawień adresu
 * Obsługuje wyświetlanie i interakcję z modalem edycji postoju
 */
class AddressSettingsModal {
    constructor() {
        this.modal = null;
        this.overlay = null;
        this.currentAddressData = null;
        // Pola do przechowywania aktualnie wybranego zakresu godzin w modalu
        this.currentTimeFrom = '';
        this.currentTimeTo = '';
        this.init();
    }

    /**
     * Inicjalizacja modala i event listenerów
     */
    init() {
        this.modal = document.getElementById('address-settings-modal');
        this.overlay = document.getElementById('overlay');

        if (!this.modal || !this.overlay) {
            console.error('Modal lub overlay nie zostały znalezione');
            return;
        }

        this.setupEventListeners();
        this.setupKeyboardListener();
    }

    /**
     * Konfiguracja nasłuchiwania zmian wysokości klawiatury
     * Gdy klawiatura się pojawia/znika, modal dostosuje swoją pozycję
     */
    setupKeyboardListener() {
        document.addEventListener('keyboardHeightChanged', (event) => {
            const keyboardHeight = event.detail.height;
            console.log(`Zmiana wysokości klawiatury: ${keyboardHeight}px`);
            
            // Nie robimy nic dodatkowego - CSS już obsługuje to poprzez variable --keyboard-height
            // Ale możemy dodać dodatkową logikę jeśli pole notatek jest aktywne
            const notesTextarea = document.querySelector('.notes-textarea');
            if (notesTextarea && document.activeElement === notesTextarea && keyboardHeight > 0) {
                // Klawiatura jest widoczna i pole notatek ma fokus
                console.log('Klawiatura pokazana, pole notatek aktywne');
            }
        });
    }

    /**
     * Konfiguracja event listenerów dla modala
     */
    setupEventListeners() {
        // Zamknięcie modala
        const closeBtn = document.getElementById('address-settings-close');
        const readyBtn = document.getElementById('address-settings-ready');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        if (readyBtn) {
            // Kliknięcie przycisku "Gotowe" w głównym modalu zamyka modal.
            // Godziny są zapisywane w okienku wyboru czasu (przycisk "Gotowe" w nim).
            readyBtn.addEventListener('click', () => this.saveAndClose());
        }

        // Zamknięcie przez overlay
        this.overlay.addEventListener('click', () => this.closeModal());

        // Obsługa licznika paczek
        this.setupPackageCounter();

        // Obsługa zakładek kolejności
        this.setupOrderTabs();

        // Obsługa zakładek typu
        this.setupTypeTabs();

        // Obsługa sekcji "Czas przyjazdu"
        this.setupArrivalTimeHandlers();

        // Obsługa akcji
        this.setupActionButtons();

        // Obsługa wyszukiwarki paczek
        this.setupPackageSearchHandler();

        // Obsługa przycisku dodawania notatek
        this.setupNotesHandler();

        // NOWOŚĆ: Obsługa przycisku dodawania zdjęć (aparatu)
        this.setupPhotosHandler();
        
        // OBSŁUGA NUMERU TELEFONU
        this.setupPhoneValidationForAddress();
    }

    /**
     * Konfiguracja walidacji numeru telefonu dla głównego modala adresu
     */
    setupPhoneValidationForAddress() {
        const phoneInput = document.getElementById('address-phone');
        if (phoneInput) {
            // Walidacja podczas wpisywania - tylko cyfry
            phoneInput.addEventListener('input', (e) => {
                // Usuń wszystkie znaki niebędące cyframi
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
            
            // Zapobiegaj wklejaniu tekstu z literami
            phoneInput.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text');
                const numbersOnly = pastedData.replace(/[^0-9]/g, '');
                document.execCommand('insertText', false, numbersOnly);
            });
        }
    }
    
    /**
     * Konfiguracja walidacji numeru telefonu dla modala paczek
     */
    setupPhoneValidation() {
        // Ta metoda jest zachowana dla zgodności z kodem modalu paczek,
        // ale walidacja telefonu jest teraz obsługiwana w głównym modalu
        return;
    }

    /**
     * Konfiguracja licznika paczek
     */
    setupPackageCounter() {
        const minusBtn = document.getElementById('packages-minus');
        const plusBtn = document.getElementById('packages-plus');
        const countSpan = document.getElementById('packages-count');

        if (minusBtn && plusBtn && countSpan) {
            minusBtn.addEventListener('click', () => {
                let count = parseInt(countSpan.textContent);
                if (count > 1) {
                    countSpan.textContent = count - 1;
                }
            });

            plusBtn.addEventListener('click', () => {
                let count = parseInt(countSpan.textContent);
                countSpan.textContent = count + 1;
            });
        }
    }

    /**
     * Konfiguracja zakładek kolejności
     */
    setupOrderTabs() {
        const firstTab = document.getElementById('tab-first');
        const autoTab = document.getElementById('tab-auto');
        const lastTab = document.getElementById('tab-last');

        const tabs = [firstTab, autoTab, lastTab];

        tabs.forEach(tab => {
            if (tab) {
                tab.addEventListener('click', () => {
                    // Usuń aktywną klasę ze wszystkich zakładek
                    tabs.forEach(t => t.classList.remove('active'));
                    // Dodaj aktywną klasę do klikniętej zakładki
                    tab.classList.add('active');
                });
            }
        });
    }

    /**
     * Konfiguracja zakładek typu
     */
    setupTypeTabs() {
        const deliveryTab = document.getElementById('tab-delivery');
        const pickupTab = document.getElementById('tab-pickup');

        const tabs = [deliveryTab, pickupTab];

        tabs.forEach(tab => {
            if (tab) {
                tab.addEventListener('click', () => {
                    // Usuń aktywną klasę ze wszystkich zakładek
                    tabs.forEach(t => t.classList.remove('active'));
                    // Dodaj aktywną klasę do klikniętej zakładki
                    tab.classList.add('active');

                    // Zapisz ustawienie typu dostawy/odbioru
                    this.saveDeliveryTypeSetting();
                });
            }
        });
    }

    /**
     * Konfiguracja przycisków akcji
     */
    setupActionButtons() {
        const changeAddressBtn = document.getElementById('change-address');
        const duplicateBtn = document.getElementById('duplicate-stop');
        const deleteBtn = document.getElementById('delete-stop');

        if (changeAddressBtn) {
            changeAddressBtn.addEventListener('click', () => {
                console.log('Zmień adres - funkcja do implementacji');
                // TODO: Implementacja zmiany adresu
            });
        }

        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', () => {
                console.log('Duplikuj postój - funkcja do implementacji');
                // TODO: Implementacja duplikowania postoju
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                console.log('Usuń postój - funkcja do implementacji');
                // TODO: Implementacja usuwania postoju
                this.closeModal();
            });
        }
    }

    /**
     * Otwiera modal z danymi adresu
     * @param {Object} addressData - Dane adresu do wyświetlenia
     */
    openModal(addressData) {
        if (!this.modal || !this.overlay) {
            console.error('Modal nie jest zainicjalizowany');
            return;
        }

        this.currentAddressData = addressData;

        // Aktualizuj dane w modalu
        this.updateModalData(addressData);

        // Pokaż modal
        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';

        // Dodaj animację
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);

        // Zablokuj przewijanie strony
        document.body.style.overflow = 'hidden';
    }

    /**
     * Aktualizuje dane w modalu
     * @param {Object} addressData - Dane adresu
     */
    updateModalData(addressData) {
        const nameElement = document.getElementById('modal-address-name');
        const subtitleElement = document.getElementById('modal-address-subtitle');

        if (nameElement && addressData.address) {
            nameElement.textContent = addressData.address;
        }

        if (subtitleElement && addressData.subtitle) {
            subtitleElement.textContent = addressData.subtitle;
        }

        // Resetuj wartości do domyślnych
        this.resetModalValues();

        // Ustaw zakładkę kolejności na podstawie returnOnBack i firstOnRoute (po resecie, aby nie zostało nadpisane)
        this.setOrderTabBasedOnReturnOnBack(addressData.returnOnBack, addressData.firstOnRoute);

        // Ustal i wyświetl aktualne godziny dla sekcji "Czas przyjazdu"
        // 1) Pobierz najnowsze wartości z TableManager (jeśli dostępny)
        let timeFrom = '';
        let timeTo = '';
        try {
            // Bezpieczne pobranie TableManagera z aplikacji
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;
            if (tableManager && addressData && addressData.addressKey) {
                const addresses = Array.isArray(tableManager.addresses) ? tableManager.addresses : [];
                const addr = addresses.find(a => a.id === addressData.addressKey);
                if (addr) {
                    timeFrom = addr.timeFrom || '';
                    timeTo = addr.timeTo || '';
                    // Aktualizuj dane adresu o firstOnRoute z TableManagera
                    addressData.firstOnRoute = addr.firstOnRoute || false;
                    addressData.returnOnBack = addr.returnOnBack || false;
                }
            }
        } catch (e) {
            console.warn('Problem z pobraniem godzin z TableManagera:', e);
        }
        // 2) Jeśli brak w TM, użyj wartości przekazanych w addressData
        if (!timeFrom && addressData && addressData.timeFrom) timeFrom = String(addressData.timeFrom);
        if (!timeTo && addressData && addressData.timeTo) timeTo = String(addressData.timeTo);

        // Zachowaj bieżące wartości w polach instancji
        this.currentTimeFrom = timeFrom || '';
        this.currentTimeTo = timeTo || '';

        // Zaktualizuj etykietę w sekcji "Czas przyjazdu"
        this.updateTimeSettingLabel(this.currentTimeFrom, this.currentTimeTo);

        // Wczytaj i wyświetl ustawienia paczki dla tego adresu
        this.loadAndDisplayPackageSettings(addressData);
        
        // Wczytaj i wyświetl numer telefonu dla tego adresu
        this.loadAndDisplayPhoneNumber(addressData);

        // Ustaw zakładkę typu na podstawie zapisanych danych
        this.setTypeTabBasedOnDeliveryType(addressData);
    }

    /**
     * Ustawia zakładkę kolejności na podstawie wartości returnOnBack i firstOnRoute
     * @param {boolean} returnOnBack - Czy adres ma być odwiedzony na powrocie
     * @param {boolean} firstOnRoute - Czy adres ma być odwiedzony na początku
     */
    setOrderTabBasedOnReturnOnBack(returnOnBack, firstOnRoute = false) {
        // Usuń aktywną klasę ze wszystkich zakładek kolejności
        const orderTabs = document.querySelectorAll('.setting-tabs .tab-btn');
        orderTabs.forEach(tab => tab.classList.remove('active'));

        // Ustaw odpowiednią zakładkę na podstawie returnOnBack i firstOnRoute
        if (firstOnRoute) {
            // Jeśli firstOnRoute jest true, zaznacz "Pierwszy"
            const firstTab = document.getElementById('tab-first');
            if (firstTab) {
                firstTab.classList.add('active');
            }
        } else if (returnOnBack) {
            // Jeśli returnOnBack jest true, zaznacz "Ostatni"
            const lastTab = document.getElementById('tab-last');
            if (lastTab) {
                lastTab.classList.add('active');
            }
        } else {
            // Jeśli oba są false lub undefined, zaznacz "Auto"
            const autoTab = document.getElementById('tab-auto');
            if (autoTab) {
                autoTab.classList.add('active');
            }
        }
    }

    /**
     * Ustawia zakładkę typu na podstawie wartości deliveryType
     */
    setTypeTabBasedOnDeliveryType(addressData) {
        // Pobierz deliveryType z danych adresu lub z TableManagera
        let deliveryType = ''; // domyślnie pusty string (brak wyboru)

        // Najpierw spróbuj pobrać z TableManagera
        try {
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses) && addressData && addressData.addressKey) {
                const addr = tableManager.addresses.find(a => a.id === addressData.addressKey);
                if (addr && addr.deliveryType) {
                    deliveryType = addr.deliveryType;
                }
            }
        } catch (e) {
            console.warn('Problem z pobraniem deliveryType z TableManagera:', e);
        }

        // Jeśli brak w TableManager, użyj wartości przekazanych w addressData
        if (addressData && addressData.deliveryType) {
            deliveryType = addressData.deliveryType;
        }

        // Resetuj wszystkie zakładki typu
        const typeTabs = document.querySelectorAll('#tab-delivery, #tab-pickup');
        typeTabs.forEach(tab => tab.classList.remove('active'));

        // Ustaw odpowiednią zakładkę tylko jeśli deliveryType jest określony
        if (deliveryType === 'pickup') {
            const pickupTab = document.getElementById('tab-pickup');
            if (pickupTab) {
                pickupTab.classList.add('active');
            }
        } else if (deliveryType === 'delivery') {
            const deliveryTab = document.getElementById('tab-delivery');
            if (deliveryTab) {
                deliveryTab.classList.add('active');
            }
        }
        // Jeśli deliveryType jest pusty, żadna zakładka nie będzie aktywna

        console.log(`Ustawiono zakładkę typu: ${deliveryType || 'brak'}`);
    }

    /**
     * Resetuje wartości modala do domyślnych
     */
    resetModalValues() {
        // Resetuj licznik paczek
        const countSpan = document.getElementById('packages-count');
        if (countSpan) {
            countSpan.textContent = '1';
        }

        // Resetuj zakładki kolejności do domyślnego stanu (usuń wszystkie aktywne)
        const orderTabs = document.querySelectorAll('#tab-first, #tab-auto, #tab-last');
        orderTabs.forEach(tab => tab.classList.remove('active'));

        // Resetuj zakładki typu - usuń wszystkie aktywne (brak domyślnego wyboru)
        const typeTabs = document.querySelectorAll('#tab-delivery, #tab-pickup');
        typeTabs.forEach(tab => tab.classList.remove('active'));
    }

    /**
     * Zamyka modal
     */
    closeModal() {
        if (!this.modal || !this.overlay) {
            return;
        }

        // Usuń animację
        this.modal.classList.remove('show');

        // Ukryj modal po animacji
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.modal.style.display = 'none';
        }, 300);

        // Przywróć przewijanie strony
        document.body.style.overflow = '';

        this.currentAddressData = null;
    }

    /**
     * Zapisuje ustawienia i zamyka modal
     */
    saveAndClose() {
        console.log('Zapisywanie ustawień adresu i zamykanie modala');

        // Zapisz ustawienia kolejności na podstawie wybranej zakładki kolejności
        this.saveOrderSetting();
        
        // Zapisz numer telefonu
        this.savePhoneNumber();

        this.closeModal();
    }
    
    /**
     * Zapisuje numer telefonu do TableManagera
     */
    savePhoneNumber() {
        if (!this.currentAddressData || !this.currentAddressData.addressKey) {
            console.error('Brak danych adresu do zapisania numeru telefonu');
            return;
        }

        try {
            // Pobierz numer telefonu z pola input
            const phoneInput = document.getElementById('address-phone');
            const phoneNumber = phoneInput ? phoneInput.value.trim() : '';

            // Pobierz TableManager i zaktualizuj dane adresu
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses)) {
                const addr = tableManager.addresses.find(a => a.id === this.currentAddressData.addressKey);
                if (addr) {
                    // Upewnij się, że obiekt packageSettings istnieje
                    if (!addr.packageSettings) {
                        addr.packageSettings = {};
                    }
                    
                    // Zapisz numer telefonu
                    addr.packageSettings.phone = phoneNumber;

                    // Zapisz adresy używając istniejącej metody TableManagera
                    if (typeof tableManager.saveAddresses === 'function') {
                        tableManager.saveAddresses();
                        console.log(`Zapisano numer telefonu: "${phoneNumber}" dla adresu ${addr.address}`);
                    } else {
                        console.error('Brak metody saveAddresses w TableManager');
                    }
                } else {
                    console.error('Nie znaleziono adresu o kluczu:', this.currentAddressData.addressKey);
                }
            } else {
                console.error('Brak TableManagera lub tablicy adresów');
            }
        } catch (error) {
            console.error('Błąd podczas zapisywania numeru telefonu:', error);
        }
    }

    /**
     * Zapisuje ustawienia kolejności na podstawie wybranej zakładki kolejności
     */
    saveOrderSetting() {
        if (!this.currentAddressData || !this.currentAddressData.addressKey) {
            console.error('Brak danych adresu do zapisania');
            return;
        }

        // Sprawdź która zakładka kolejności jest aktywna
        const firstTab = document.getElementById('tab-first');
        const autoTab = document.getElementById('tab-auto');
        const lastTab = document.getElementById('tab-last');

        const isFirstTabActive = firstTab && firstTab.classList.contains('active');
        const isLastTabActive = lastTab && lastTab.classList.contains('active');

        // Ustaw właściwości na podstawie aktywnej zakładki
        const firstOnRoute = isFirstTabActive;
        const returnOnBack = isLastTabActive;

        try {
            // Pobierz TableManager i zaktualizuj dane adresu
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses)) {
                const addr = tableManager.addresses.find(a => a.id === this.currentAddressData.addressKey);
                if (addr) {
                    addr.firstOnRoute = firstOnRoute;
                    addr.returnOnBack = returnOnBack;

                    // Zapisz adresy używając istniejącej metody TableManagera
                    if (typeof tableManager.saveAddresses === 'function') {
                        tableManager.saveAddresses();
                        console.log(`Zapisano firstOnRoute=${firstOnRoute}, returnOnBack=${returnOnBack} dla adresu ${addr.address}`);
                    } else {
                        console.error('Brak metody saveAddresses w TableManager');
                    }
                } else {
                    console.error('Nie znaleziono adresu o kluczu:', this.currentAddressData.addressKey);
                }
            } else {
                console.error('Brak TableManagera lub tablicy adresów');
            }
        } catch (error) {
            console.error('Błąd podczas zapisywania ustawień kolejności:', error);
        }
    }

    /**
     * Zapisuje ustawienie typu dostawy/odbioru na podstawie wybranej zakładki typu
     */
    saveDeliveryTypeSetting() {
        if (!this.currentAddressData || !this.currentAddressData.addressKey) {
            console.error('Brak danych adresu do zapisania typu dostawy');
            return;
        }

        // Sprawdź która zakładka typu jest aktywna
        const deliveryTab = document.getElementById('tab-delivery');
        const pickupTab = document.getElementById('tab-pickup');

        let deliveryType = ''; // domyślnie pusty string (brak wyboru)
        if (pickupTab && pickupTab.classList.contains('active')) {
            deliveryType = 'pickup';
        } else if (deliveryTab && deliveryTab.classList.contains('active')) {
            deliveryType = 'delivery';
        }

        try {
            // Pobierz TableManager i zaktualizuj dane adresu
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses)) {
                const addr = tableManager.addresses.find(a => a.id === this.currentAddressData.addressKey);
                if (addr) {
                    addr.deliveryType = deliveryType;

                    // Zapisz adresy używając istniejącej metody TableManagera
                    if (typeof tableManager.saveAddresses === 'function') {
                        tableManager.saveAddresses();
                        console.log(`Zapisano deliveryType=${deliveryType || 'brak'} dla adresu ${addr.address}`);
                    } else {
                        console.error('Brak metody saveAddresses w TableManager');
                    }
                } else {
                    console.error('Nie znaleziono adresu o kluczu:', this.currentAddressData.addressKey);
                }
            } else {
                console.error('Brak TableManagera lub tablicy adresów');
            }
        } catch (error) {
            console.error('Błąd podczas zapisywania ustawienia deliveryType:', error);
        }
    }

    // ===== Nowe metody dla sekcji "Czas przyjazdu" =====
    setupArrivalTimeHandlers() {
        // Znajdź elementy sekcji "Czas przyjazdu"
        const { itemEl, valueEl } = this.findTimeSettingElements();

        if (itemEl) {
            // Uczyń cały wiersz klikalnym – otwiera okienko wyboru czasu
            itemEl.classList.add('clickable');
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                // Otwórz okno ustawiania czasu z aktualnie zapisanymi danymi
                this.openTimeDialog(this.currentTimeFrom, this.currentTimeTo);
            });
        }
        if (valueEl) {
            // Dodatkowo obsłuż klik na samej wartości
            valueEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openTimeDialog(this.currentTimeFrom, this.currentTimeTo);
            });
        }
    }

    findTimeSettingElements() {
        // Wyszukaj element o etykiecie "Czas przyjazdu" i pobierz jego węzły
        const items = document.querySelectorAll('#address-settings-modal .setting-item');
        let itemEl = null;
        let valueEl = null;
        items.forEach(item => {
            const label = item.querySelector('.setting-label');
            const value = item.querySelector('.setting-value');
            if (label && label.textContent.trim() === 'Czas przyjazdu') {
                itemEl = item;
                valueEl = value;
            }
        });
        return { itemEl, valueEl };
    }

    updateTimeSettingLabel(timeFrom, timeTo) {
        // Ustaw poprawny tekst w sekcji "Czas przyjazdu"
        const { valueEl } = this.findTimeSettingElements();
        if (!valueEl) return;

        // Logika: oba -> "HH:MM – HH:MM", tylko od -> "od HH:MM", tylko do -> "do HH:MM", brak -> "W dowolnym czasie"
        if (timeFrom && timeTo) {
            valueEl.textContent = `${timeFrom} – ${timeTo}`;
        } else if (timeFrom) {
            valueEl.textContent = `od ${timeFrom}`;
        } else if (timeTo) {
            valueEl.textContent = `do ${timeTo}`;
        } else {
            valueEl.textContent = 'W dowolnym czasie';
        }
    }

    openTimeDialog(currentFrom, currentTo) {
        // Tworzy lekkie okienko wyboru czasu z przyciskami "Anuluj" i "Gotowe"
        // i zapisuje wyniki do TableManagera oraz odświeża UI sekcji.

        // Usuń poprzednie instancje mini-okna jeśli istnieją
        const existing = document.getElementById('arrival-time-dialog');
        if (existing) existing.remove();
        // Usuń ewentualny poprzedni backdrop, aby uniknąć duplikacji i problemów ze stackingiem
        const existingBackdrop = document.getElementById('arrival-time-backdrop');
        if (existingBackdrop) existingBackdrop.remove();

        // Stwórz backdrop (półprzezroczyste tło) dla lepszej czytelności i odcięcia od treści
        const backdrop = document.createElement('div');
        backdrop.id = 'arrival-time-backdrop';
        backdrop.className = 'arrival-time-backdrop';

        // Stwórz kontener dialogu
        const dlg = document.createElement('div');
        dlg.id = 'arrival-time-dialog';
        dlg.className = 'arrival-time-dialog';

        // Funkcja domykająca, która bezpiecznie usuwa dialog, backdrop i nasłuchiwacz ESC
        const closeMiniDialog = () => {
            try { dlg.remove(); } catch (_) { }
            try { backdrop.remove(); } catch (_) { }
            document.removeEventListener('keydown', onEscPress);
        };

        // Obsługa klawisza Escape do zamykania miniokna
        const onEscPress = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeMiniDialog();
            }
        };
        document.addEventListener('keydown', onEscPress);

        // Kliknięcie w tło (backdrop) zamyka miniokno
        backdrop.addEventListener('click', closeMiniDialog);

        // Stwórz treść dialogu
        const header = document.createElement('div');
        header.className = 'arrival-time-dialog-header';
        header.textContent = 'Ustaw przedział czasu';

        const content = document.createElement('div');
        content.className = 'arrival-time-dialog-content';

        // Pole godziny OD
        const fromLabel = document.createElement('label');
        fromLabel.className = 'address-time-label';
        fromLabel.setAttribute('for', 'arrival-time-from');
        fromLabel.textContent = 'Godzina od (opcjonalnie):';

        const fromInput = document.createElement('input');
        fromInput.type = 'time';
        fromInput.id = 'arrival-time-from';
        fromInput.className = 'address-time-input';
        fromInput.value = currentFrom || '';

        // Pole godziny DO
        const toLabel = document.createElement('label');
        toLabel.className = 'address-time-label';
        toLabel.setAttribute('for', 'arrival-time-to');
        toLabel.textContent = 'Godzina do (opcjonalnie):';

        const toInput = document.createElement('input');
        toInput.type = 'time';
        toInput.id = 'arrival-time-to';
        toInput.className = 'address-time-input';
        toInput.value = currentTo || '';

        // Przyciski akcji
        const actions = document.createElement('div');
        actions.className = 'arrival-time-dialog-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'dialog-button cancel-button';
        cancelBtn.textContent = 'Anuluj';
        // Kliknięcie w "Anuluj" zamyka miniokno i backdrop
        cancelBtn.addEventListener('click', closeMiniDialog);

        const okBtn = document.createElement('button');
        okBtn.className = 'dialog-button save-button';
        okBtn.textContent = 'Gotowe';
        okBtn.addEventListener('click', () => {
            // Pobierz nowe wartości
            const newFrom = fromInput.value;
            const newTo = toInput.value;

            // Zapis do TableManagera aby zachować pełną zgodność z istniejącym mechanizmem storage
            try {
                const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                    ? window.optiDrogApp.getTableManager()
                    : null;
                if (tableManager && this.currentAddressData && this.currentAddressData.addressKey) {
                    if (typeof tableManager.setAddressTime === 'function') {
                        tableManager.setAddressTime(this.currentAddressData.addressKey, newFrom, newTo);
                    } else {
                        console.error('Brak metody setAddressTime w TableManager');
                    }

                    // Zaktualizuj lokalny stan oraz etykietę w modalu
                    this.currentTimeFrom = newFrom || '';
                    this.currentTimeTo = newTo || '';
                    this.updateTimeSettingLabel(this.currentTimeFrom, this.currentTimeTo);
                } else {
                    console.error('Brak TableManagera lub klucza adresu – nie można zapisać czasu');
                }
            } catch (err) {
                console.error('Błąd podczas zapisu godzin przez TableManager:', err);
            }

            // Zamknij mini-okno oraz backdrop
            closeMiniDialog();
        });

        // Złóż dialog
        content.appendChild(fromLabel);
        content.appendChild(fromInput);
        content.appendChild(toLabel);
        content.appendChild(toInput);

        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);

        dlg.appendChild(header);
        dlg.appendChild(content);
        dlg.appendChild(actions);

        // Dodaj do DOM – jako dzieci modala, aby były logicznie z nim powiązane
        this.modal.appendChild(backdrop);
        this.modal.appendChild(dlg);

        // Prosta animacja wejścia (fade-in zarówno backdropu jak i dialogu)
        setTimeout(() => {
            backdrop.classList.add('visible');
            dlg.classList.add('visible');
        }, 10);
    }

    /**
     * Konfiguracja obsługi wyszukiwarki paczek
     */
    setupPackageSearchHandler() {
        const packageSearchBtn = document.getElementById('package-search-setting');

        if (packageSearchBtn) {
            packageSearchBtn.addEventListener('click', () => {
                console.log('Otwieranie modala ustawień paczki');
                this.openPackageSettingsModal();
            });
        }
    }

    /**
     * Wczytuje i wyświetla ustawienia paczki dla danego adresu
     * @param {Object} addressData - Dane adresu
     */
    loadAndDisplayPackageSettings(addressData) {
        try {
            // Pobierz TableManager
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && addressData && addressData.addressKey) {
                const addresses = Array.isArray(tableManager.addresses) ? tableManager.addresses : [];
                const addr = addresses.find(a => a.id === addressData.addressKey);

                if (addr && addr.packageSettings) {
                    // Wyświetl tylko ustawienia paczki (rozmiar i typ), bez deliveryType
                    this.updatePackageSearchDisplay(addr.packageSettings);
                } else {
                    // Jeśli brak adresu lub ustawień paczki, wyświetl "Nie ustawiono"
                    this.updatePackageSearchDisplay(null);
                }
            } else {
                // Jeśli brak TableManager lub danych adresu, wyświetl "Nie ustawiono"
                this.updatePackageSearchDisplay(null);
            }
        } catch (error) {
            console.error('Błąd podczas wczytywania ustawień paczki:', error);
            this.updatePackageSearchDisplay(null);
        }
    }

    /**
     * Aktualizuje wyświetlanie ustawień paczki w głównym modalu
     * @param {Object|null} packageSettings - Ustawienia paczki lub null
     */
    updatePackageSearchDisplay(packageSettings) {
        const valueElement = document.getElementById('package-search-value');
        if (valueElement) {
            if (packageSettings && (packageSettings.size || packageSettings.type)) {
                // Stwórz opis na podstawie zapisanych ustawień paczki (bez deliveryType)
                const sizeLabels = { 'small': 'Mała', 'medium': 'Średnia', 'large': 'Duża' };
                const typeLabels = { 'box': 'Pudełko', 'bag': 'Worek', 'letter': 'List' };

                const parts = [];

                // Dodaj rozmiar jeśli jest dostępny
                if (packageSettings.size) {
                    const sizeLabel = sizeLabels[packageSettings.size] || 'Mała';
                    parts.push(sizeLabel);
                }

                // Dodaj typ paczki jeśli jest dostępny
                if (packageSettings.type) {
                    const typeLabel = typeLabels[packageSettings.type] || 'Worek';
                    parts.push(typeLabel);
                }

                valueElement.textContent = parts.length > 0 ? parts.join(', ') : 'Nie ustawiono';
            } else {
                // Brak ustawień - wyświetl domyślny tekst
                valueElement.textContent = 'Nie ustawiono';
            }
        }
    }
    
    /**
     * Wczytuje i wyświetla numer telefonu dla danego adresu
     * @param {Object} addressData - Dane adresu
     */
    loadAndDisplayPhoneNumber(addressData) {
        try {
            // Pobierz TableManager
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && addressData && addressData.addressKey) {
                const addresses = Array.isArray(tableManager.addresses) ? tableManager.addresses : [];
                const addr = addresses.find(a => a.id === addressData.addressKey);

                if (addr && addr.packageSettings && addr.packageSettings.phone) {
                    // Wyświetl numer telefonu z zapisanych ustawień
                    const phoneInput = document.getElementById('address-phone');
                    if (phoneInput) {
                        phoneInput.value = addr.packageSettings.phone;
                    }
                } else {
                    // Jeśli brak numeru telefonu, wyczyść pole
                    const phoneInput = document.getElementById('address-phone');
                    if (phoneInput) {
                        phoneInput.value = '';
                    }
                }
            } else {
                // Jeśli brak TableManager lub danych adresu, wyczyść pole
                const phoneInput = document.getElementById('address-phone');
                if (phoneInput) {
                    phoneInput.value = '';
                }
            }
        } catch (error) {
            console.error('Błąd podczas wczytywania numeru telefonu:', error);
            // W przypadku błędu wyczyść pole
            const phoneInput = document.getElementById('address-phone');
            if (phoneInput) {
                phoneInput.value = '';
            }
        }
    }

    /**
     * Otwiera modal ustawień paczki
     */
    openPackageSettingsModal() {
        if (!this.currentAddressData) {
            console.error('Brak danych adresu do ustawień paczki');
            return;
        }

        // Inicjalizuj modal ustawień paczki jeśli nie istnieje
        if (!window.packageSettingsModal) {
            window.packageSettingsModal = new PackageSettingsModal();
        }

        // Otwórz modal ustawień paczki z danymi aktualnego adresu
        window.packageSettingsModal.openModal(this.currentAddressData);
    }

    /**
     * Konfiguracja obsługi przycisku dodawania notatek
     */
    setupNotesHandler() {
        const notesButton = document.querySelector('.notes-label');

        if (notesButton) {
            notesButton.addEventListener('click', () => {
                console.log('Otwieranie modala notatek');
                this.openNotesModal();
            });
        }
    }

    /**
     * Konfiguracja obsługi przycisku dodawania zdjęć (ikonka aparatu .notes-camera)
     * Zdjęcia dla adresu zarządzane są w osobnym modalu PhotosModal
     */
    setupPhotosHandler() {
        const photosButton = document.querySelector('.notes-camera');
        if (photosButton) {
            photosButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.currentAddressData) {
                    console.error('Brak danych adresu do dodawania zdjęć');
                    return;
                }
                console.log('Otwieranie modala zdjęć dla adresu');
                this.openPhotosModal();
            });
        } else {
            console.warn('Nie znaleziono przycisku .notes-camera w DOM');
        }
    }

    /**
     * Otwiera modal dodawania/edycji zdjęć adresu
     */
    openPhotosModal() {
        if (!this.currentAddressData) {
            console.error('Brak danych adresu do zdjęć');
            return;
        }

        // Inicjalizuj modal zdjęć jeśli nie istnieje
        if (!window.photosModal) {
            window.photosModal = new PhotosModal();
        }

        // Otwórz modal zdjęć z danymi aktualnego adresu
        window.photosModal.openModal(this.currentAddressData);
    }

    /**
     * Otwiera modal dodawania/edycji notatek
     */
    openNotesModal() {
        if (!this.currentAddressData) {
            console.error('Brak danych adresu do notatek');
            return;
        }

        // Inicjalizuj modal notatek jeśli nie istnieje
        if (!window.notesModal) {
            window.notesModal = new NotesModal();
        }

        // Otwórz modal notatek z danymi aktualnego adresu
        window.notesModal.openModal(this.currentAddressData);
    }
}

/**
 * Klasa zarządzająca modalem ustawień paczki
 * Obsługuje wyświetlanie i interakcję z modalem ustawień paczki
 */
class PackageSettingsModal {
    constructor() {
        this.modal = null;
        this.overlay = null;
        this.currentAddressData = null;
        this.packageSettings = {
            size: '', // small, medium, large
            type: '', // box, bag, letter
            vehiclePosition: '', // front, middle, back
            vehicleSide: '', // left, right
            floor: '' // ground, shelf
        };
        this.init();
    }

    /**
     * Inicjalizacja modala i event listenerów
     */
    init() {
        this.modal = document.getElementById('package-settings-modal');
        this.overlay = document.getElementById('overlay');

        if (!this.modal || !this.overlay) {
            console.error('Modal ustawień paczki lub overlay nie zostały znalezione');
            return;
        }

        this.setupEventListeners();
    }

    /**
     * Konfiguracja event listenerów dla modala
     */
    setupEventListeners() {
        // Zamknięcie modala
        const closeBtn = document.getElementById('package-settings-close');
        const readyBtn = document.getElementById('package-settings-ready');
        const clearBtn = document.getElementById('package-settings-clear');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        if (readyBtn) {
            readyBtn.addEventListener('click', () => this.saveAndClose());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAllSettings());
        }

        // Zamknięcie przez overlay
        this.overlay.addEventListener('click', (e) => {
            // Sprawdź czy kliknięto w overlay, a nie w modal
            if (e.target === this.overlay && this.modal.style.display === 'block') {
                this.closeModal();
            }
        });

        // Obsługa zakładek rozmiaru paczki
        this.setupSizeTabs();

        // Obsługa zakładek typu paczki
        this.setupTypeTabs();

        // Obsługa zakładek miejsca w pojeździe
        this.setupVehiclePositionTabs();

        // Obsługa zakładek strony pojazdu
        this.setupVehicleSideTabs();

        // Obsługa zakładek podłogi
        this.setupFloorTabs();
        
        // Obsługa walidacji pola numeru telefonu
        this.setupPhoneValidation();
    }

    /**
     * Konfiguracja zakładek rozmiaru paczki
     */
    setupSizeTabs() {
        const smallTab = document.getElementById('package-size-small');
        const mediumTab = document.getElementById('package-size-medium');
        const largeTab = document.getElementById('package-size-large');

        const tabs = [smallTab, mediumTab, largeTab];
        const values = ['small', 'medium', 'large'];

        tabs.forEach((tab, index) => {
            if (tab) {
                tab.addEventListener('click', () => {
                    // Usuń aktywną klasę ze wszystkich zakładek
                    tabs.forEach(t => t.classList.remove('active'));
                    // Dodaj aktywną klasę do klikniętej zakładki
                    tab.classList.add('active');
                    // Zapisz wybór
                    this.packageSettings.size = values[index];
                });
            }
        });
    }

    /**
     * Konfiguracja zakładek typu paczki
     */
    setupTypeTabs() {
        const boxTab = document.getElementById('package-type-box');
        const bagTab = document.getElementById('package-type-bag');
        const letterTab = document.getElementById('package-type-letter');

        const tabs = [boxTab, bagTab, letterTab];
        const values = ['box', 'bag', 'letter'];

        tabs.forEach((tab, index) => {
            if (tab) {
                tab.addEventListener('click', () => {
                    // Usuń aktywną klasę ze wszystkich zakładek
                    tabs.forEach(t => t.classList.remove('active'));
                    // Dodaj aktywną klasę do klikniętej zakładki
                    tab.classList.add('active');
                    // Zapisz wybór
                    this.packageSettings.type = values[index];
                });
            }
        });
    }

    /**
     * Konfiguracja zakładek miejsca w pojeździe
     */
    setupVehiclePositionTabs() {
        const frontTab = document.getElementById('vehicle-position-front');
        const middleTab = document.getElementById('vehicle-position-middle');
        const backTab = document.getElementById('vehicle-position-back');

        const tabs = [frontTab, middleTab, backTab];
        const values = ['front', 'middle', 'back'];

        tabs.forEach((tab, index) => {
            if (tab) {
                tab.addEventListener('click', () => {
                    // Usuń aktywną klasę ze wszystkich zakładek
                    tabs.forEach(t => t.classList.remove('active'));
                    // Dodaj aktywną klasę do klikniętej zakładki
                    tab.classList.add('active');
                    // Zapisz wybór
                    this.packageSettings.vehiclePosition = values[index];
                });
            }
        });
    }

    /**
     * Konfiguracja zakładek strony pojazdu
     */
    setupVehicleSideTabs() {
        const leftTab = document.getElementById('vehicle-side-left');
        const rightTab = document.getElementById('vehicle-side-right');

        const tabs = [leftTab, rightTab];
        const values = ['left', 'right'];

        tabs.forEach((tab, index) => {
            if (tab) {
                tab.addEventListener('click', () => {
                    // Usuń aktywną klasę ze wszystkich zakładek
                    tabs.forEach(t => t.classList.remove('active'));
                    // Dodaj aktywną klasę do klikniętej zakładki
                    tab.classList.add('active');
                    // Zapisz wybór
                    this.packageSettings.vehicleSide = values[index];
                });
            }
        });
    }

    /**
     * Konfiguracja zakładek podłogi
     */
    setupFloorTabs() {
        const groundTab = document.getElementById('floor-ground');
        const shelfTab = document.getElementById('floor-shelf');

        const tabs = [groundTab, shelfTab];
        const values = ['ground', 'shelf'];

        tabs.forEach((tab, index) => {
            if (tab) {
                tab.addEventListener('click', () => {
                    // Usuń aktywną klasę ze wszystkich zakładek
                    tabs.forEach(t => t.classList.remove('active'));
                    // Dodaj aktywną klasę do klikniętej zakładki
                    tab.classList.add('active');
                    // Zapisz wybór
                    this.packageSettings.floor = values[index];
                });
            }
        });
    }

    /**
     * Konfiguracja walidacji pola numeru telefonu
     * Umożliwia wpisywanie tylko cyfr i blokuje inne znaki
     */
    setupPhoneValidation() {
        // Ta metoda jest pusta, ponieważ walidacja telefonu jest teraz w głównym modalu
        return;
    }

    /**
     * Otwiera modal z danymi adresu
     * @param {Object} addressData - Dane adresu do wyświetlenia
     */
    openModal(addressData) {
        if (!this.modal || !this.overlay) {
            console.error('Modal ustawień paczki nie jest zainicjalizowany');
            return;
        }

        this.currentAddressData = addressData;

        // Aktualizuj dane w modalu
        this.updateModalData(addressData);

        // Wczytaj zapisane ustawienia paczki
        this.loadPackageSettings(addressData);

        // Pokaż modal
        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';

        // Dodaj animację
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);

        // Zablokuj przewijanie strony
        document.body.style.overflow = 'hidden';
    }

    /**
     * Aktualizuje dane w modalu
     * @param {Object} addressData - Dane adresu
     */
    updateModalData(addressData) {
        const nameElement = document.getElementById('package-modal-address-name');
        const subtitleElement = document.getElementById('package-modal-address-subtitle');

        if (nameElement && addressData.address) {
            nameElement.textContent = addressData.address;
        }

        if (subtitleElement && addressData.addressKey) {
            subtitleElement.textContent = `ID ${addressData.addressKey}`;
        }
    }

    /**
     * Wczytuje zapisane ustawienia paczki dla danego adresu
     * @param {Object} addressData - Dane adresu
     */
    loadPackageSettings(addressData) {
        // Resetuj do pustych wartości przed wczytaniem
        this.packageSettings = {
            size: '', // small, medium, large
            type: '', // box, bag, letter
            vehiclePosition: '', // front, middle, back
            vehicleSide: '', // left, right
            floor: '', // ground, shelf
            phone: '' // numer telefonu
        };

        try {
            // Pobierz TableManager i znajdź adres
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses) && addressData.addressKey) {
                const addr = tableManager.addresses.find(a => a.id === addressData.addressKey);
                if (addr && addr.packageSettings) {
                    // Wczytaj zapisane ustawienia tylko jeśli istnieją
                    this.packageSettings = { ...this.packageSettings, ...addr.packageSettings };
                }
            }
        } catch (error) {
            console.warn('Błąd podczas wczytywania ustawień paczki:', error);
        }

        // Zastosuj ustawienia do interfejsu
        this.applySettingsToUI();
    }

    /**
     * Stosuje ustawienia do interfejsu użytkownika
     */
    applySettingsToUI() {
        // Rozmiar paczki
        const sizeButtons = {
            'small': document.getElementById('package-size-small'),
            'medium': document.getElementById('package-size-medium'),
            'large': document.getElementById('package-size-large')
        };

        Object.keys(sizeButtons).forEach(key => {
            const btn = sizeButtons[key];
            if (btn) {
                btn.classList.toggle('active', key === this.packageSettings.size);
            }
        });

        // Numer telefonu jest teraz zarządzany w głównym modalu, więc pomijamy jego ustawianie tutaj

        // Typ paczki
        const typeButtons = {
            'box': document.getElementById('package-type-box'),
            'bag': document.getElementById('package-type-bag'),
            'letter': document.getElementById('package-type-letter')
        };

        Object.keys(typeButtons).forEach(key => {
            const btn = typeButtons[key];
            if (btn) {
                btn.classList.toggle('active', key === this.packageSettings.type);
            }
        });

        // Miejsce w pojeździe
        const positionButtons = {
            'front': document.getElementById('vehicle-position-front'),
            'middle': document.getElementById('vehicle-position-middle'),
            'back': document.getElementById('vehicle-position-back')
        };

        Object.keys(positionButtons).forEach(key => {
            const btn = positionButtons[key];
            if (btn) {
                btn.classList.toggle('active', key === this.packageSettings.vehiclePosition);
            }
        });

        // Strona pojazdu
        const sideButtons = {
            'left': document.getElementById('vehicle-side-left'),
            'right': document.getElementById('vehicle-side-right')
        };

        Object.keys(sideButtons).forEach(key => {
            const btn = sideButtons[key];
            if (btn) {
                btn.classList.toggle('active', key === this.packageSettings.vehicleSide);
            }
        });

        // Podłoga
        const floorButtons = {
            'ground': document.getElementById('floor-ground'),
            'shelf': document.getElementById('floor-shelf')
        };

        Object.keys(floorButtons).forEach(key => {
            const btn = floorButtons[key];
            if (btn) {
                btn.classList.toggle('active', key === this.packageSettings.floor);
            }
        });
    }

    /**
     * Zamyka modal
     */
    closeModal() {
        if (!this.modal || !this.overlay) {
            return;
        }

        // Usuń animację
        this.modal.classList.remove('show');

        // Ukryj modal po animacji
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.modal.style.display = 'none';
        }, 300);

        // Przywróć przewijanie strony
        document.body.style.overflow = '';

        this.currentAddressData = null;
    }

    /**
     * Zapisuje ustawienia i zamyka modal
     */
    saveAndClose() {
        console.log('Zapisywanie ustawień paczki i zamykanie modala');

        // Zapisz ustawienia paczki
        this.savePackageSettings();

        // Aktualizuj etykietę w głównym modalu poprzez AddressSettingsModal
        if (addressSettingsModal && this.currentAddressData) {
            addressSettingsModal.loadAndDisplayPackageSettings(this.currentAddressData);
        }

        this.closeModal();
    }

    /**
     * Zapisuje ustawienia paczki do TableManagera
     */
    savePackageSettings() {
        if (!this.currentAddressData || !this.currentAddressData.addressKey) {
            console.error('Brak danych adresu do zapisania ustawień paczki');
            return;
        }

        try {
            // Pobierz TableManager i zaktualizuj dane adresu
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses)) {
                const addr = tableManager.addresses.find(a => a.id === this.currentAddressData.addressKey);
                if (addr) {
                    // Upewnij się, że obiekt packageSettings istnieje
                    if (!addr.packageSettings) {
                        addr.packageSettings = {};
                    }
                    
                    // Kopiuj ustawienia z obiektu packageSettings (bez telefonu)
                    const settingsToSave = { ...this.packageSettings };
                    
                    // Kopiuj numer telefonu z głównego modala, jeśli istnieje
                    const phoneInput = document.getElementById('address-phone');
                    if (phoneInput) {
                        settingsToSave.phone = phoneInput.value.trim();
                    }
                    
                    // Zapisz ustawienia paczki do adresu
                    addr.packageSettings = settingsToSave;

                    // Zapisz adresy używając istniejącej metody TableManagera
                    if (typeof tableManager.saveAddresses === 'function') {
                        tableManager.saveAddresses();
                        console.log('Zapisano ustawienia paczki dla adresu:', addr.address, this.packageSettings);
                    } else {
                        console.error('Brak metody saveAddresses w TableManager');
                    }
                } else {
                    console.error('Nie znaleziono adresu o kluczu:', this.currentAddressData.addressKey);
                }
            } else {
                console.error('Brak TableManagera lub tablicy adresów');
            }
        } catch (error) {
            console.error('Błąd podczas zapisywania ustawień paczki:', error);
        }
    }

    /**
     * Czyści wszystkie ustawienia paczki i aktualizuje interfejs
     */
    clearAllSettings() {
        // Wyczyść wszystkie ustawienia w obiekcie
        this.packageSettings = {
            size: '',
            type: '',
            vehiclePosition: '',
            vehicleSide: '',
            floor: '',
            phone: ''
        };

        // Usuń aktywne klasy ze wszystkich przycisków
        const allTabs = [
            // Rozmiar paczki
            'package-size-small', 'package-size-medium', 'package-size-large',
            // Typ paczki
            'package-type-box', 'package-type-bag', 'package-type-letter',
            // Miejsce w pojeździe
            'vehicle-position-front', 'vehicle-position-middle', 'vehicle-position-back',
            // Strona pojazdu
            'vehicle-side-left', 'vehicle-side-right',
            // Podłoga
            'floor-ground', 'floor-shelf'
        ];

        allTabs.forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (tab) {
                tab.classList.remove('active');
            }
        });

        console.log('Wszystkie ustawienia paczki zostały wyczyszczone');
    }

    /**
     * Aktualizuje etykietę wyszukiwarki paczek w głównym modalu
     */
    updatePackageSearchLabel() {
        const valueElement = document.getElementById('package-search-value');
        if (valueElement) {
            // Stwórz opis na podstawie wybranych ustawień
            const sizeLabels = { 'small': 'Mała', 'medium': 'Średnia', 'large': 'Duża' };
            const typeLabels = { 'box': 'Pudełko', 'bag': 'Worek', 'letter': 'List' };

            const sizeLabel = sizeLabels[this.packageSettings.size] || 'Mała';
            const typeLabel = typeLabels[this.packageSettings.type] || 'Worek';

            valueElement.textContent = `${sizeLabel}, ${typeLabel}`;
        }
    }
}

/**
 * Klasa zarządzająca modalem notatek
 * Obsługuje dodawanie i edycję notatek dla adresu
 */
class NotesModal {
    constructor() {
        this.modal = null;
        this.overlay = null;
        this.currentAddressData = null;
        this.init();
    }

    /**
     * Inicjalizacja modala i event listenerów
     */
    init() {
        this.createModal();
        this.setupEventListeners();
    }

    /**
     * Tworzy modal notatek w DOM
     */
    createModal() {
        // Sprawdź czy modal już istnieje
        if (document.getElementById('notes-modal')) {
            this.modal = document.getElementById('notes-modal');
            this.overlay = document.getElementById('overlay');
            return;
        }

        // Utwórz modal notatek
        const modalHTML = `
            <div id="notes-modal" class="address-settings-modal">
                <div class="address-settings-content">
                    <!-- Nagłówek modala -->
                    <div class="address-settings-header">
                        <button class="address-settings-close" id="notes-modal-close">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                        <h2 class="address-settings-title">Notatki</h2>
                        <button class="address-settings-ready" id="notes-modal-save">Zapisz</button>
                    </div>

                    <!-- Informacje o adresie -->
                    <div class="address-settings-info">
                        <div class="address-settings-location">
                            <div class="location-icon">📝</div>
                            <div class="location-details">
                                <div class="location-name" id="notes-modal-address-name">Adres</div>
                                <div class="location-subtitle" id="notes-modal-address-subtitle">ID adresu</div>
                            </div>
                        </div>
                    </div>

                    <!-- Pole notatek -->
                    <div class="address-settings-options">
                        <div class="setting-item">
                            <div class="setting-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2"/>
                                    <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2"/>
                                    <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2"/>
                                    <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2"/>
                                    <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2"/>
                                </svg>
                            </div>
                            <div class="setting-content" style="width: 100%;">
                                <div class="setting-label">Treść notatki</div>
                                <textarea
                                    id="notes-textarea"
                                    placeholder="Wprowadź notatki dla tego adresu..."
                                    style="width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--border); border-radius: var(--border-radius); font-size: 14px; resize: vertical; margin-top: 8px; transition: none;"
                                    maxlength="500"
                                ></textarea>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                                    <span id="notes-char-count">0</span>/500 znaków
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Dodaj modal do DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        this.modal = document.getElementById('notes-modal');
        this.overlay = document.getElementById('overlay');
    }

    /**
     * Konfiguracja event listenerów dla modala
     */
    setupEventListeners() {
        // Zamknięcie modala
        const closeBtn = document.getElementById('notes-modal-close');
        const saveBtn = document.getElementById('notes-modal-save');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveAndClose());
        }

        // Zamknięcie przez overlay
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay && this.modal.style.display === 'block') {
                this.closeModal();
            }
        });

        // Licznik znaków
        const textarea = document.getElementById('notes-textarea');
        const charCount = document.getElementById('notes-char-count');

        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                const length = textarea.value.length;
                charCount.textContent = length;

                // Zmień kolor gdy zbliża się do limitu
                if (length > 450) {
                    charCount.style.color = 'var(--error)';
                } else {
                    charCount.style.color = 'var(--text-secondary)';
                }
            });

            // Obsługa fokusa - automatyczne przewijanie do pola gdy klawiatura się pojawi
            // Rozwiązanie dla Android 13+ gdzie windowSoftInputMode nie działa poprawnie
            textarea.addEventListener('focus', () => {
                console.log('[NotesModal] Textarea otrzymała fokus - przewijanie do widoku');

                // Opóźnienie pozwala klawiaturze się otworzyć przed przewinięciem
                setTimeout(() => {
                    this.scrollTextareaIntoView();
                }, 300);
            });

            // Alternatywna metoda - wykrywanie zmiany rozmiaru okna (pojawienie się klawiatury)
            // visualViewport API jest lepiej wspierane na nowszych Androidach
            if (window.visualViewport) {
                const handleViewportResize = () => {
                    // Jeśli textarea ma fokus, przewiń go do widoku
                    if (document.activeElement === textarea) {
                        console.log('[NotesModal] Viewport resize detected - przewijanie textarea');
                        this.scrollTextareaIntoView();
                    }
                };

                window.visualViewport.addEventListener('resize', handleViewportResize);

                // Zapisz listener do późniejszego usunięcia
                this.viewportResizeListener = handleViewportResize;
            }
        }
    }

    /**
     * Otwiera modal z danymi adresu
     * @param {Object} addressData - Dane adresu do wyświetlenia
     */
    openModal(addressData) {
        if (!this.modal || !this.overlay) {
            console.error('Modal notatek nie jest zainicjalizowany');
            return;
        }

        this.currentAddressData = addressData;

        // Aktualizuj dane w modalu
        this.updateModalData(addressData);

        // Wczytaj zapisane notatki
        this.loadNotes(addressData);

        // Pokaż modal
        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';

        // Dodaj animację
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);

        // Zablokuj przewijanie strony
        document.body.style.overflow = 'hidden';
    }

    /**
     * Aktualizuje dane w modalu
     * @param {Object} addressData - Dane adresu
     */
    updateModalData(addressData) {
        const nameElement = document.getElementById('notes-modal-address-name');
        const subtitleElement = document.getElementById('notes-modal-address-subtitle');

        if (nameElement && addressData.address) {
            nameElement.textContent = addressData.address;
        }

        if (subtitleElement && addressData.addressKey) {
            subtitleElement.textContent = `ID ${addressData.addressKey}`;
        }
    }

    /**
     * Wczytuje zapisane notatki dla danego adresu
     * @param {Object} addressData - Dane adresu
     */
    loadNotes(addressData) {
        const textarea = document.getElementById('notes-textarea');
        if (!textarea) return;

        try {
            // Pobierz TableManager i znajdź adres
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses) && addressData.addressKey) {
                const addr = tableManager.addresses.find(a => a.id === addressData.addressKey);
                if (addr && addr.notes) {
                    textarea.value = addr.notes;
                } else {
                    textarea.value = '';
                }
            } else {
                textarea.value = '';
            }
        } catch (error) {
            console.warn('Błąd podczas wczytywania notatek:', error);
            textarea.value = '';
        }

        // Zaktualizuj licznik znaków
        const charCount = document.getElementById('notes-char-count');
        if (charCount) {
            charCount.textContent = textarea.value.length;
        }
    }

    /**
     * Przewija pole textarea do widoku, aby było widoczne nad klawiaturą
     * Rozwiązanie dla Android 13+ gdzie standardowe mechanizmy nie działają
     */
    scrollTextareaIntoView() {
        const textarea = document.getElementById('notes-textarea');
        if (!textarea) {
            console.warn('[NotesModal] Textarea nie znaleziona');
            return;
        }

        try {
            // Metoda 1: Użyj scrollIntoView z opcjami
            textarea.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });

            console.log('[NotesModal] Textarea przewinięta do widoku');

            // Metoda 2 (backup): Jeśli scrollIntoView nie zadziała, spróbuj ręcznie przewinąć modal
            setTimeout(() => {
                const modalContent = this.modal.querySelector('.address-settings-content');
                if (modalContent) {
                    const textareaRect = textarea.getBoundingClientRect();
                    const modalRect = modalContent.getBoundingClientRect();

                    // Jeśli textarea jest poniżej widocznego obszaru, przewiń modal
                    if (textareaRect.bottom > modalRect.bottom) {
                        const scrollAmount = textareaRect.bottom - modalRect.bottom + 50; // +50px marginesu
                        modalContent.scrollTop += scrollAmount;
                        console.log('[NotesModal] Dodatkowe przewinięcie modala o:', scrollAmount, 'px');
                    }
                }
            }, 100);

        } catch (error) {
            console.error('[NotesModal] Błąd podczas przewijania textarea:', error);
        }
    }

    /**
     * Zamyka modal
     */
    closeModal() {
        if (!this.modal || !this.overlay) {
            return;
        }

        // Usuń listener viewport resize jeśli istnieje
        if (this.viewportResizeListener && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this.viewportResizeListener);
            this.viewportResizeListener = null;
            console.log('[NotesModal] Usunięto viewport resize listener');
        }

        // Usuń animację
        this.modal.classList.remove('show');

        // Ukryj modal po animacji
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.modal.style.display = 'none';
        }, 300);

        // Przywróć przewijanie strony
        document.body.style.overflow = '';

        this.currentAddressData = null;
    }

    /**
     * Zapisuje notatki i zamyka modal
     */
    saveAndClose() {
        console.log('Zapisywanie notatek i zamykanie modala');

        // Zapisz notatki
        this.saveNotes();

        this.closeModal();
    }

    /**
     * Zapisuje notatki do TableManagera
     */
    saveNotes() {
        const textarea = document.getElementById('notes-textarea');
        if (!textarea || !this.currentAddressData || !this.currentAddressData.addressKey) {
            console.error('Brak danych do zapisania notatek');
            return;
        }

        const notes = textarea.value.trim();

        try {
            // Pobierz TableManager i zaktualizuj dane adresu
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses)) {
                const addr = tableManager.addresses.find(a => a.id === this.currentAddressData.addressKey);
                if (addr) {
                    // Zapisz notatki do adresu
                    if (notes) {
                        addr.notes = notes;
                    } else {
                        // Usuń puste notatki
                        delete addr.notes;
                    }

                    // Zapisz adresy używając istniejącej metody TableManagera
                    if (typeof tableManager.saveAddresses === 'function') {
                        tableManager.saveAddresses();
                        console.log(`Zapisano notatki dla adresu ${addr.address}:`, notes || '(puste)');
                    } else {
                        console.error('Brak metody saveAddresses w TableManager');
                    }
                } else {
                    console.error('Nie znaleziono adresu o kluczu:', this.currentAddressData.addressKey);
                }
            } else {
                console.error('Brak TableManagera lub tablicy adresów');
            }
        } catch (error) {
            console.error('Błąd podczas zapisywania notatek:', error);
        }
    }
}

/**
 * Modal zarządzania zdjęciami dla adresu
 * Maksymalnie 2 zdjęcia przechowywane jako base64 w polu photos na obiekcie adresu.
 */
class PhotosModal {
    constructor() {
        this.modal = null;
        this.overlay = null;
        this.currentAddressData = null;
        this.photos = []; // Tymczasowa lista zdjęć (base64) w bieżącej sesji
        this.init();
    }

    // Inicjalizacja modala
    init() {
        this.createModal();
        this.setupEventListeners();
    }

    // Tworzy modal zdjęć
    createModal() {
        if (document.getElementById('photos-modal')) {
            this.modal = document.getElementById('photos-modal');
            this.overlay = document.getElementById('overlay');
            return;
        }

        const modalHTML = `
            <div id="photos-modal" class="address-settings-modal">
                <div class="address-settings-content">
                    <div class="address-settings-header">
                        <button class="address-settings-close" id="photos-modal-close">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                        <h2 class="address-settings-title">Zdjęcia</h2>
                        <button class="address-settings-ready" id="photos-modal-save">Zapisz</button>
                    </div>

                    <div class="address-settings-info">
                        <div class="address-settings-location">
                            <div class="location-icon">📷</div>
                            <div class="location-details">
                                <div class="location-name" id="photos-modal-address-name">Adres</div>
                                <div class="location-subtitle" id="photos-modal-address-subtitle">ID adresu</div>
                            </div>
                        </div>
                    </div>

                    <div class="address-settings-options">
                        <div class="setting-item" style="flex-direction: column; align-items: flex-start;">
                            <div class="setting-label" style="margin-bottom:8px;">Zdjęcia paczki (max 2)</div>
                            <div id="photos-thumbnails" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
                            <button id="photos-add-button" class="address-settings-ready" style="margin-top:12px;">
                                Dodaj zdjęcie
                            </button>
                            <div id="photos-limit-info" style="margin-top:6px; font-size:12px; color:var(--text-secondary);"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('photos-modal');
        this.overlay = document.getElementById('overlay');
    }

    // Event listenery
    setupEventListeners() {
        const closeBtn = document.getElementById('photos-modal-close');
        const saveBtn = document.getElementById('photos-modal-save');
        const addBtn = document.getElementById('photos-add-button');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveAndClose());
        }
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                // Dodawanie zdjęcia – wywołanie aparatu jeśli limit nie został przekroczony
                if (this.photos.length >= 2) {
                    console.warn('Limit zdjęć osiągnięty (2)');
                    return;
                }
                if (typeof Android !== 'undefined' && Android.openCameraForAddressPhotos) {
                    console.log('[PhotosModal] Wywołanie aparatu dla zdjęcia adresowego');
                    Android.openCameraForAddressPhotos();
                } else {
                    console.error('Brak metody Android.openCameraForAddressPhotos');
                }
            });
        }

        // Overlay zamyka modal
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay && this.modal.style.display === 'block') {
                    this.closeModal();
                }
            });
        }
    }

    // Otwiera modal
    openModal(addressData) {
        if (!this.modal || !this.overlay) {
            console.error('Modal zdjęć nie jest zainicjalizowany');
            return;
        }
        this.currentAddressData = addressData;

        this.updateModalData(addressData);
        this.loadPhotos(addressData);

        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';

        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);

        document.body.style.overflow = 'hidden';
    }

    // Aktualizacja danych adresu w nagłówku
    updateModalData(addressData) {
        const nameElement = document.getElementById('photos-modal-address-name');
        const subtitleElement = document.getElementById('photos-modal-address-subtitle');

        if (nameElement && addressData.address) {
            nameElement.textContent = addressData.address;
        }
        if (subtitleElement && addressData.addressKey) {
            subtitleElement.textContent = `ID ${addressData.addressKey}`;
        }
    }

    // Wczytuje zdjęcia z obiektu adresu
    loadPhotos(addressData) {
        this.photos = [];
        try {
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;
            if (tableManager && Array.isArray(tableManager.addresses) && addressData.addressKey) {
                const addr = tableManager.addresses.find(a => a.id === addressData.addressKey);
                if (addr && Array.isArray(addr.photos)) {
                    // Filtruj aby zachować tylko poprawne base64 JPEG
                    this.photos = addr.photos.filter(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,')).slice(0, 2);
                }
            }
        } catch (e) {
            console.warn('Błąd wczytywania zdjęć adresu:', e);
        }
        this.renderThumbnails();
    }

    // Render miniatur zdjęć
    renderThumbnails() {
        const container = document.getElementById('photos-thumbnails');
        const addButton = document.getElementById('photos-add-button');
        const limitInfo = document.getElementById('photos-limit-info');

        if (!container) return;
        container.innerHTML = '';

        this.photos.forEach((photoBase64, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'photo-thumb';
            thumb.style.position = 'relative';
            thumb.style.width = '100px';
            thumb.style.height = '100px';
            thumb.style.border = '1px solid var(--border)';
            thumb.style.borderRadius = '8px';
            thumb.style.overflow = 'hidden';
            thumb.style.background = '#fff';

            const img = document.createElement('img');
            img.src = photoBase64;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.alt = 'Zdjęcie paczki';

            // Przycisk usuwania
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '&times;';
            removeBtn.style.position = 'absolute';
            removeBtn.style.top = '2px';
            removeBtn.style.right = '4px';
            removeBtn.style.background = 'rgba(0,0,0,0.5)';
            removeBtn.style.color = '#fff';
            removeBtn.style.border = 'none';
            removeBtn.style.width = '20px';
            removeBtn.style.height = '20px';
            removeBtn.style.borderRadius = '50%';
            removeBtn.style.cursor = 'pointer';
            removeBtn.title = 'Usuń zdjęcie';

            removeBtn.addEventListener('click', () => {
                this.removePhoto(index);
            });

            thumb.appendChild(img);
            thumb.appendChild(removeBtn);
            container.appendChild(thumb);
        });

        // Aktualizuj stan przycisku dodawania
        if (addButton) {
            if (this.photos.length >= 2) {
                addButton.disabled = true;
                addButton.classList.add('disabled');
            } else {
                addButton.disabled = false;
                addButton.classList.remove('disabled');
            }
        }

        if (limitInfo) {
            limitInfo.textContent = `Zdjęcia: ${this.photos.length}/2`;
        }
    }

    // Dodaje zdjęcie (wywoływana z window.handleAddressPhoto)
    addPhoto(base64Image) {
        if (this.photos.length >= 2) {
            console.warn('Próba dodania trzeciego zdjęcia - ignoruję');
            return;
        }
        if (typeof base64Image !== 'string' || !base64Image.startsWith('data:image/jpeg;base64,')) {
            console.error('Nieprawidłowy format zdjęcia base64');
            return;
        }
        // Opcjonalna walidacja długości
        if (base64Image.length > 600000) {
            console.warn('Zdjęcie przekracza maksymalny rozmiar (znaki base64) - dodaję mimo ostrzeżenia');
        }

        this.photos.push(base64Image);
        console.log('[PhotosModal] Dodano zdjęcie, długość base64:', base64Image.length);
        this.renderThumbnails();
    }

    // Usuwa zdjęcie
    removePhoto(index) {
        if (index < 0 || index >= this.photos.length) return;
        this.photos.splice(index, 1);
        this.renderThumbnails();
    }

    // Zapisuje zdjęcia do obiektu adresu
    savePhotos() {
        if (!this.currentAddressData || !this.currentAddressData.addressKey) {
            console.error('Brak danych adresu przy zapisie zdjęć');
            return;
        }

        try {
            const tableManager = (window.optiDrogApp && typeof window.optiDrogApp.getTableManager === 'function')
                ? window.optiDrogApp.getTableManager()
                : null;

            if (tableManager && Array.isArray(tableManager.addresses)) {
                const addr = tableManager.addresses.find(a => a.id === this.currentAddressData.addressKey);
                if (addr) {
                    if (this.photos.length > 0) {
                        addr.photos = this.photos.slice(0, 2); // Zapisz max 2
                    } else {
                        delete addr.photos;
                    }

                    if (typeof tableManager.saveAddresses === 'function') {
                        tableManager.saveAddresses();
                        console.log(`[PhotosModal] Zapisano ${this.photos.length} zdjęć dla adresu ${addr.address}`);
                    } else {
                        console.error('Brak metody saveAddresses w TableManager');
                    }
                } else {
                    console.error('Nie znaleziono adresu o kluczu:', this.currentAddressData.addressKey);
                }
            } else {
                console.error('Brak TableManagera lub tablicy adresów');
            }
        } catch (e) {
            console.error('Błąd podczas zapisu zdjęć:', e);
        }
    }

    // Zapisuje i zamyka modal
    saveAndClose() {
        this.savePhotos();
        this.closeModal();
    }

    // Zamyka modal
    closeModal() {
        if (!this.modal || !this.overlay) return;
        this.modal.classList.remove('show');
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.modal.style.display = 'none';
        }, 300);
        document.body.style.overflow = '';
        this.currentAddressData = null;
    }
}

/**
 * Globalna funkcja callback wywoływana z Android (MainActivity) po zrobieniu zdjęcia w trybie address_photos
 * Dodaje zdjęcie do instancji PhotosModal jeśli jest otwarta.
 */
window.handleAddressPhoto = function (base64Image) {
    try {
        console.log('[handleAddressPhoto] Otrzymano zdjęcie adresu');
        if (!window.photosModal) {
            // Jeśli nie ma instancji, spróbuj utworzyć (nie znamy currentAddressData - zdjęcie zostanie utracone)
            console.warn('Brak instancji PhotosModal - zdjęcie zostanie pominięte');
            return;
        }
        window.photosModal.addPhoto(base64Image);
    } catch (e) {
        console.error('Błąd w handleAddressPhoto:', e);
    }
};

// Globalna instancja modala ustawień adresu
let addressSettingsModal = null;

// Inicjalizacja po załadowaniu DOM
document.addEventListener('DOMContentLoaded', function () {
    addressSettingsModal = new AddressSettingsModal();
});

/**
 * Funkcja globalna do otwierania modala ustawień adresu
 * @param {Object} addressData - Dane adresu
 */
function openAddressSettingsModal(addressData) {
    if (addressSettingsModal) {
        addressSettingsModal.openModal(addressData);
    } else {
        console.error('Modal ustawień adresu nie jest zainicjalizowany');
    }
}