// Wspólne komponenty dla wszystkich stron aplikacji OptiDrog

// Wspólna funkcja do generowania spójnych kluczy adresów
function generateAddressKey(address, lat, lng) {
    // Normalizacja współrzędnych do stałej precyzji (6 miejsc po przecinku)
    const normalizedLat = typeof lat === 'number' ? lat.toFixed(6) : parseFloat(lat).toFixed(6);
    const normalizedLng = typeof lng === 'number' ? lng.toFixed(6) : parseFloat(lng).toFixed(6);
    const key = `${address}_${normalizedLat}_${normalizedLng}`;
    console.log(`[Components] Generuję klucz adresu: ${address} (${lat}, ${lng}) -> ${key}`);
    return key;
}

// Klasa do zarządzania wspólnymi komponentami
class CommonComponents {
    constructor() {
        this.init();
    }

    // Inicjalizacja wszystkich wspólnych komponentów
    init() {
        this.loadMenu();
        this.loadOverlay();
        this.initMenuHandlers();
        this.loadSavedTheme(); // Automatyczne wczytanie motywu
    }

    // Ładowanie menu hamburger i bocznego menu
    loadMenu() {
        const menuHTML = `
            <!-- Przycisk hamburger menu -->
            <div class="hamburger-menu" id="hamburger-button">
                <div class="hamburger-line"></div>
                <div class="hamburger-line"></div>
                <div class="hamburger-line"></div>
            </div>

            <!-- Menu boczne -->
            <div class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <h3>OptiDrog Menu</h3>
                    <div class="close-btn" id="close-sidebar">×</div>
                </div>
                <div class="sidebar-content">
                    <ul class="sidebar-menu">
                        <li><a href="leaflet_map.html" data-page="main">Strona główna</a></li>
                        <li><a href="saved_routes.html" data-page="routes">Moje trasy</a></li>
                        <li><a href="ride_history.html" data-page="history">Historia przejazdów</a></li>
                        <li><a href="settings.html" data-page="settings">Ustawienia</a></li>
                        <li><a href="changelog.html" data-page="changelog">🆕 Co nowego</a></li>
                        <li><a href="contact.html" data-page="contact">Kontakt</a></li>
                        <li><a href="help.html" data-page="help">Pomoc</a></li>
                        <li><a href="privacy_policy.html" data-page="privacy">Polityka prywatności</a></li>
                        <li class="sidebar-divider"></li>
                    </ul>
                    <!-- Widget Status konta - przeniesiony nad przyciski akcji -->
                    <div class="premium-status-widget" id="premium-status-widget">
                        <div class="premium-status-label">Status konta</div>
                        <div class="premium-status-chip" id="premium-status-chip">Standard</div>
                        <div class="premium-expiry-info" id="premium-expiry-info" style="display: none;"></div>
                        <button class="premium-status-button" id="premium-status-button">Zobacz korzy?ci</button>
                    </div>
                    <!-- Przyciski akcji - Wskaz?wki i Discord (zmniejszone) -->
                    <ul class="sidebar-menu sidebar-action-menu">
                        <li>
                            <a href="#" id="sidebar-tips-btn" class="sidebar-action-btn">
                                <span class="btn-icon">💡</span> Wskazówki funkcji
                            </a>
                        </li>
                        <li>
                            <a href="#" id="sidebar-discord-btn" class="sidebar-action-btn discord-btn">
                                <span class="btn-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                                    </svg>
                                </span> Discord
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        `;

        // Dodaj menu na początku body
        document.body.insertAdjacentHTML('afterbegin', menuHTML);

        // Oznacz aktywną stronę w menu
        this.markActivePage();

        // Ustaw wstępny status premium w menu
        if (window.premium && window.premium.currentStatus) {
            this.updatePremiumBadge(window.premium.currentStatus);
        }

        // Sprawdź, czy jesteśmy na stronie głównej (leaflet_map.html)
        // Jeśli tak, ukryj oryginalny przycisk hamburger, ponieważ mamy nowy w pasku wyszukiwania
        setTimeout(() => {
            const currentPage = window.location.pathname;
            const hamburgerButton = document.getElementById('hamburger-button');

            if (hamburgerButton) {
                // Sprawdź, czy jesteśmy na stronie głównej
                if (currentPage.includes('leaflet_map.html')) {
                    // Na stronie głównej ukrywamy oryginalny przycisk hamburger
                    hamburgerButton.style.display = 'none';
                } else {
                    // Na innych stronach pokazujemy oryginalny przycisk hamburger
                    hamburgerButton.style.display = 'flex';
                }
            }
        }, 100); // Małe opóźnienie, aby upewnić się, że DOM jest gotowy
    }

    // Ładowanie nakładki przyciemniającej
    loadOverlay() {
        const overlayHTML = `
            <!-- Nakładka przyciemniająca -->
            <div class="overlay" id="overlay"></div>
        `;

        // Dodaj overlay po menu
        const sidebar = document.getElementById('sidebar');
        sidebar.insertAdjacentHTML('afterend', overlayHTML);
    }

    // Oznaczanie aktywnej strony w menu
    markActivePage() {
        const currentPage = this.getCurrentPage();
        const menuLinks = document.querySelectorAll('.sidebar-menu a');

        menuLinks.forEach(link => {
            link.classList.remove('active');
            const linkPage = link.getAttribute('data-page');

            // Sprawdź czy link odpowiada aktualnej stronie
            if ((currentPage === 'main' && linkPage === 'main') ||
                (currentPage === 'settings' && linkPage === 'settings') ||
                (currentPage === linkPage)) {
                link.classList.add('active');
            }
        });
    }

    // Określanie aktualnej strony na podstawie nazwy pliku
    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop();

        if (filename === 'leaflet_map.html' || filename === '' || filename === '/') {
            return 'main';
        } else if (filename === 'settings.html') {
            return 'settings';
        } else if (filename === 'contact.html') {
            return 'contact';
        } else if (filename === 'help.html') {
            return 'help';
        } else if (filename === 'saved_routes.html') {
            return 'routes';
        } else if (filename === 'addresses.html') {
            return 'addresses';
        } else if (filename === 'privacy_policy.html') {
            return 'privacy';
        } else if (filename === 'premium.html') {
            return 'premium';
        } else if (filename === 'ride_history.html') {
            return 'history';
        } else if (filename === 'changelog.html') {
            return 'changelog';
        }

        return 'main'; // domyślnie
    }

    // Inicjalizacja obsługi zdarzeń menu
    initMenuHandlers() {
        // Poczekaj na załadowanie DOM
        document.addEventListener('DOMContentLoaded', () => {
            const hamburgerButton = document.getElementById('hamburger-button');
            const sidebar = document.getElementById('sidebar');
            const closeSidebar = document.getElementById('close-sidebar');
            const overlay = document.getElementById('overlay');

            if (!hamburgerButton || !sidebar || !closeSidebar || !overlay) {
                console.error('Nie można znaleźć elementów menu');
                return;
            }

            // Otwieranie menu
            hamburgerButton.addEventListener('click', () => {
                sidebar.classList.add('active');
                overlay.classList.add('active');
            });

            // Zamykanie menu przyciskiem X
            closeSidebar.addEventListener('click', () => {
                this.closeMenu();
            });

            // Zamykanie menu po kliknięciu w nakładkę
            overlay.addEventListener('click', () => {
                this.closeMenu();
            });

            // Zamykanie menu po kliknięciu w link
            const menuLinks = document.querySelectorAll('.sidebar-menu a');
            menuLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    const href = link.getAttribute('href');

                    // Jeśli link prowadzi do nieistniejącej strony (#), pomiń
                    if (href === '#') {
                        e.preventDefault();
                        this.closeMenu();
                    } else {
                        // Zamknij menu dla rzeczywistych linków
                        this.closeMenu();
                    }
                });
            });

            // Obsługa przycisków akcji w sidebarze (Wskazówki i Discord)
            const tipsBtn = document.getElementById('sidebar-tips-btn');
            if (tipsBtn) {
                tipsBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.closeMenu();
                    const featuresTipsContainer = document.getElementById('features-tips-container');
                    if (featuresTipsContainer) {
                        featuresTipsContainer.style.display = 'block';
                    } else {
                        // Jeśli nie ma kontenera (inna strona niż główna), przekieruj do pomocy
                        window.location.href = 'help.html';
                    }
                });
            }

            const discordBtn = document.getElementById('sidebar-discord-btn');
            if (discordBtn) {
                discordBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.closeMenu();
                    if (typeof Android !== 'undefined' && Android.openDiscordInvite) {
                        Android.openDiscordInvite();
                    } else {
                        window.open('https://discord.gg/TPv7mx9mzA', '_blank');
                    }
                });
            }

            const premiumButton = document.getElementById('premium-status-button');
            if (premiumButton) {
                premiumButton.addEventListener('click', () => {
                    window.location.href = 'premium.html';
                });
            }
        });
    }

    // Metoda do zamykania menu
    closeMenu() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        if (sidebar && overlay) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = 'auto'; // Przywróć przewijanie
        }
    }

    // Metoda do dodawania powiadomień (opcjonalna)
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 12px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;

        document.body.appendChild(notification);

        // Animacja pojawiania się
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Automatyczne usuwanie
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    updatePremiumBadge(status = { isActive: false }) {
        const chip = document.getElementById('premium-status-chip');
        const button = document.getElementById('premium-status-button');
        const expiryInfo = document.getElementById('premium-expiry-info');

        if (!chip || !button) {
            return;
        }

        const isActive = !!(status && status.isActive);
        chip.textContent = isActive ? 'Premium aktywne' : 'Standard';
        chip.classList.toggle('active', isActive);
        button.textContent = isActive ? 'Zarządzaj subskrypcją' : 'Aktywuj premium';

        // Wyświetl informację o dacie wygaśnięcia dla aktywnych subskrypcji
        if (isActive && expiryInfo) {
            const expiryDate = status.expiryDateFormatted || status.estimatedExpiryDateFormatted;
            const isExpiringSoon = status.isExpiringSoon;

            if (expiryDate) {
                const isEstimated = !status.expiryDateFormatted && status.estimatedExpiryDateFormatted;
                expiryInfo.innerHTML = `
                    <div class="expiry-date ${isExpiringSoon ? 'expiring-soon' : ''}">
                        ${isExpiringSoon ? '⚠️ ' : ''}Wygasa: ${expiryDate} ${isEstimated ? '(szacowane)' : ''}
                    </div>
                `;
                expiryInfo.style.display = 'block';
            } else {
                expiryInfo.style.display = 'none';
            }
        } else if (expiryInfo) {
            expiryInfo.style.display = 'none';
        }
    }

    // Metoda do aplikowania motywu
    applyTheme(theme) {
        // Usuń poprzedni atrybut motywu
        document.documentElement.removeAttribute('data-theme');

        // Zastosuj nowy motyw
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else if (theme === 'auto') {
            document.documentElement.setAttribute('data-theme', 'auto');
        } else if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        }

        console.log(`[Components] Motyw zastosowany: ${theme}`);

        // Jeśli jesteśmy na stronie głównej z mapą, odśwież style mapy (jeśli istnieje funkcja)
        if (window.map && typeof window.map.invalidateSize === 'function') {
            // Leaflet map refresh
        }
    }

    // Ładowanie motywu przy starcie aplikacji
    loadSavedTheme() {
        try {
            let savedTheme = 'light';
            if (typeof Android !== 'undefined' && Android.getAppTheme) {
                savedTheme = Android.getAppTheme();
            } else {
                // Fallback dla przeglądarki
                savedTheme = localStorage.getItem('appTheme') || 'light';
            }
            this.applyTheme(savedTheme);
        } catch (error) {
            console.error('[Components] Błąd podczas ładowania motywu:', error);
            this.applyTheme('light');
        }
    }

    // Metoda do ładowania statusu lokalizacji (dla strony głównej)
    loadLocationStatus() {
        const locationStatusHTML = `
            <!-- Informacja o pobieraniu pozycji -->
            <div id="location-status" style="display: none; position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: #2196F3; color: white; padding: 10px 20px; border-radius: 5px; z-index: 1000; font-size: 14px;">
                📍 Pobieranie aktualnej pozycji...
            </div>
        `;

        document.body.insertAdjacentHTML('afterbegin', locationStatusHTML);
    }


}

const premiumBridge = window.premium || {};
premiumBridge.currentStatus = premiumBridge.currentStatus || { isActive: false };
premiumBridge.onStatusChanged = function (status) {
    this.currentStatus = status;
    if (window.commonComponents && typeof window.commonComponents.updatePremiumBadge === 'function') {
        window.commonComponents.updatePremiumBadge(status);
    }
    if (window.premiumPage && typeof window.premiumPage.onStatusChanged === 'function') {
        window.premiumPage.onStatusChanged(status);
    }
};
premiumBridge.requestStatus = premiumBridge.requestStatus || function () {
    if (typeof Android !== 'undefined' && typeof Android.getPremiumStatus === 'function') {
        try {
            const statusJson = Android.getPremiumStatus();
            if (statusJson) {
                const parsed = JSON.parse(statusJson);
                this.onStatusChanged(parsed);
                return parsed;
            }
        } catch (error) {
            console.error('Błąd podczas pobierania statusu premium:', error);
        }
    }
    return null;
};
premiumBridge.onBillingResult = premiumBridge.onBillingResult || function (success, message) {
    console.log(`Billing result: ${success ? 'SUCCESS' : 'ERROR'} - ${message}`);

    // Resetuj przycisk przywracania
    if (window.premiumPage && typeof window.premiumPage.resetRestoreButton === 'function') {
        window.premiumPage.resetRestoreButton();
    }

    // Pokaż komunikat
    if (window.premiumPage && typeof window.premiumPage.showMessage === 'function') {
        window.premiumPage.showMessage(message, success);
    }

    // Jeśli sukces, odśwież status premium
    if (success && typeof this.requestStatus === 'function') {
        this.requestStatus();
    }
};
window.premium = premiumBridge;

// Automatyczna inicjalizacja wspólnych komponentów
if (typeof window !== 'undefined') {
    window.commonComponents = new CommonComponents();
    document.addEventListener('DOMContentLoaded', () => {
        if (window.premium) {
            window.premium.requestStatus();
        }
    });
}

/**
 * Funkcja wywoływana natywnie przez kod Androida (MainActivity).
 * Odbiera wysokości pasków systemowych i ustawia je jako zmienne CSS.
 * @param {number} topHeight - Wysokość górnego paska (status bar) w pikselach.
 * @param {number} bottomHeight - Wysokość dolnego paska (navigation bar) w pikselach.
 */
function setSystemBarsInsets(topHeight, bottomHeight) {
    console.log(`Odebrano wymiary pasków z Androida: góra=${topHeight}px, dół=${bottomHeight}px`);

    // Mechanizm kalibracji - jeśli wartości są zbyt duże, można je ręcznie skorygować
    // Wartości można zmienić w konsoli deweloperskiej:
    // window.calibrateInsets(góra, dół)
    const calibratedTop = window.topBarCalibration ? window.topBarCalibration : topHeight;
    const calibratedBottom = window.bottomBarCalibration ? window.bottomBarCalibration : bottomHeight;

    console.log(`Wartości po kalibracji: góra=${calibratedTop}px, dół=${calibratedBottom}px`);

    // Ustawiamy zmienne CSS (Custom Properties) na elemencie :root (czyli <html>).
    // Dzięki temu zmienne będą dostępne globalnie w całym dokumencie.
    const root = document.documentElement;
    root.style.setProperty('--top-bar-height', `${calibratedTop}px`);
    root.style.setProperty('--bottom-bar-height', `${calibratedBottom}px`);

    console.log('Ustawiono zmienne CSS: --top-bar-height, --bottom-bar-height');
}

// Funkcja kalibracji dostępna z konsoli deweloperskiej
window.calibrateInsets = function (topHeight, bottomHeight) {
    window.topBarCalibration = topHeight;
    window.bottomBarCalibration = bottomHeight;

    const root = document.documentElement;
    root.style.setProperty('--top-bar-height', `${topHeight}px`);
    root.style.setProperty('--bottom-bar-height', `${bottomHeight}px`);

    console.log(`Ręczna kalibracja: góra=${topHeight}px, dół=${bottomHeight}px`);
    console.log('Aby zapisać kalibrację, dodaj do localStorage:');
    console.log(`localStorage.setItem('topBarCalibration', '${topHeight}');`);
    console.log(`localStorage.setItem('bottomBarCalibration', '${bottomHeight}');`);
};

// Funkcja wczytywania kalibracji z localStorage
window.loadCalibration = function () {
    const savedTop = localStorage.getItem('topBarCalibration');
    const savedBottom = localStorage.getItem('bottomBarCalibration');

    if (savedTop !== null) {
        window.topBarCalibration = parseInt(savedTop);
        console.log(`Wczytano kalibrację góry: ${savedTop}px`);
    }

    if (savedBottom !== null) {
        window.bottomBarCalibration = parseInt(savedBottom);
        console.log(`Wczytano kalibrację dołu: ${savedBottom}px`);
    }
};

// Automatyczne wczytanie kalibracji przy starcie
window.loadCalibration();

/**
 * Funkcja wywoływana natywnie przez kod Androida (MainActivity).
 * Odbiera wysokość klawiatury (IME) i ustawia ją jako zmienną CSS.
 * Zmienna CSS --keyboard-height jest używana do dynamicznego dostosowania pozycji modala.
 * @param {number} keyboardHeight - Wysokość klawiatury w pikselach CSS (dp).
 */
function setKeyboardHeight(keyboardHeight) {
    console.log(`Odebrano wysokość klawiatury z Androida: ${keyboardHeight}px`);

    const root = document.documentElement;
    root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);

    // Triggering custom event dla komponentów które nasłuchują zmian klawiatury
    const event = new CustomEvent('keyboardHeightChanged', {
        detail: { height: keyboardHeight },
        bubbles: true,
        cancelable: true
    });
    document.dispatchEvent(event);

    console.log(`Ustawiono zmienną CSS --keyboard-height na ${keyboardHeight}px i wyzwolono event keyboardHeightChanged`);
}

// Inicjalizacja domyślnej wartości CSS variable dla klawiatury
window.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;
    if (!root.style.getPropertyValue('--keyboard-height')) {
        root.style.setProperty('--keyboard-height', '0px');
    }

    // Globalna funkcja do zmiany motywu dostępna dla kodu natywnego i innych stron
    window.changeTheme = function (theme) {
        if (window.commonComponents) {
            window.commonComponents.applyTheme(theme);
        }
    };
});

// Eksport dla modułów (jeśli potrzebne)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CommonComponents;
}
// Funkcja globalna do ręcznego odświeżania Insetsów - użyteczna do debugowania
window.refreshInsets = function () {
    // Sprawdzamy, czy Android interface jest dostępny
    if (typeof Android !== 'undefined' && Android.refreshInsets) {
        Android.refreshInsets();
    } else {
        console.warn('Funkcja refreshInsets nie jest dostępna - upewnij się, że jesteś w aplikacji Android');
    }
};