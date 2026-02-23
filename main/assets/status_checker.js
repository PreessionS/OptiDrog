// Klasa do sprawdzania statusu lokalizacji i połączenia internetowego
class StatusChecker {
    constructor() {
        this.isLocationEnabled = null; // null oznacza że jeszcze nie sprawdzano
        this.isInternetAvailable = null; // null oznacza że jeszcze nie sprawdzano
        this.isConnected = null; // null oznacza że jeszcze nie sprawdzano
        this.init();
    }

    // Inicjalizacja sprawdzania statusu
    init() {
        this.createNotificationContainer();
        this.startPeriodicChecks();
    }

    // Tworzenie kontenera na powiadomienia
    createNotificationContainer() {
        // Sprawdź czy kontener już istnieje
        const existingContainer = document.getElementById('status-notifications');
        if (existingContainer) {
            this.notificationContainer = existingContainer;
            return;
        }

        // Utwórz kontener na powiadomienia
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.id = 'status-notifications';
        this.notificationContainer.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            max-width: 300px;
            pointer-events: none;
        `;
        
        if (document.body) {
            document.body.appendChild(this.notificationContainer);
        } else {
            console.error('❌ document.body nie istnieje! Nie można dodać kontenera');
        }
    }

    // Wyświetlanie powiadomienia
    showNotification(message, type = 'warning', duration = 5000) {
        // Sprawdź czy kontener istnieje
        if (!this.notificationContainer) {
            console.error('❌ Kontener powiadomień nie istnieje! Tworzę nowy...');
            this.createNotificationContainer();
        }
        
        if (!this.notificationContainer) {
            console.error('❌ Nie udało się utworzyć kontenera powiadomień!');
            console.error('❌ document.body:', document.body);
            console.error('❌ document.getElementById("status-notifications"):', document.getElementById('status-notifications'));
            return;
        }
        
        const notification = document.createElement('div');
        
        // Określ kolor tła na podstawie typu
        let backgroundColor;
        switch(type) {
            case 'error':
                backgroundColor = '#f44336'; // czerwony
                break;
            case 'warning':
                backgroundColor = '#ff9800'; // pomarańczowy
                break;
            case 'success':
                backgroundColor = '#4caf50'; // zielony
                break;
            case 'info':
                backgroundColor = '#2196f3'; // niebieski
                break;
            default:
                backgroundColor = '#ff9800'; // domyślnie pomarańczowy
        }
        
        notification.style.cssText = `
            background: ${backgroundColor};
            color: white;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            font-size: 14px;
            line-height: 1.4;
            pointer-events: auto;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            z-index: 10001;
        `;
        notification.textContent = message;
        
        this.notificationContainer.appendChild(notification);
        
        // Animacja wejścia
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        // Automatyczne usunięcie
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

    // Sprawdzanie statusu lokalizacji (bez wyświetlania powiadomień)
    async checkLocationStatus() {
        try {
            
            // Sprawdzenie czy interfejs Android jest dostępny
            if (typeof Android === 'undefined') {
                // Fallback dla przeglądarki
                if (!navigator.geolocation) {
                    return false;
                }
                
                return new Promise((resolve) => {
                    navigator.geolocation.getCurrentPosition(
                        () => {
                            resolve(true);
                        },
                        (error) => {
                            resolve(false);
                        },
                        { timeout: 10000, enableHighAccuracy: false }
                    );
                });
            }
            
            // Sprawdzenie uprawnień do lokalizacji
            if (typeof Android.hasLocationPermission === 'function') {
                const hasPermission = Android.hasLocationPermission();
                if (!hasPermission) {
                    return false;
                }
            } else {
                return false;
            }

            // Sprawdzenie czy lokalizacja jest włączona
            if (typeof Android.isLocationEnabled === 'function') {
                const isEnabled = Android.isLocationEnabled();
                if (!isEnabled) {
                    return false;
                }
            } else {
                return false;
            }
            
            return true;
            
        } catch (error) {
            console.error('Błąd podczas sprawdzania lokalizacji:', error);
            return false;
        }
    }
    


    // Sprawdzanie połączenia internetowego (bez wyświetlania powiadomień)
    async checkInternetConnection() {
        try {
            
            // Sprawdzenie czy interfejs Android jest dostępny
            if (typeof Android === 'undefined') {
                // Fallback dla przeglądarki
                if (!navigator.onLine) {
                    return false;
                }
                
                // Test rzeczywistego połączenia przez próbę pobrania danych (skrócony timeout)
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000); // Skrócony timeout do 3 sekund
                    
                    const response = await fetch('https://httpbin.org/get', {
                        method: 'GET',
                        signal: controller.signal,
                        cache: 'no-cache'
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        return true;
                    } else {
                        return false;
                    }
                } catch (error) {
                    return false;
                }
            }
            
            // Sprawdzenie dostępności internetu przez Android API
            if (typeof Android.isInternetAvailable === 'function') {
                const isAvailable = Android.isInternetAvailable();
                if (!isAvailable) {
                    return false;
                }
            } else {
                return false;
            }

            // Sprawdzenie rzeczywistego połączenia przez Android API
            if (typeof Android.isInternetConnected === 'function') {
                const isConnected = Android.isInternetConnected();
                if (!isConnected) {
                    return false;
                }
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('Błąd podczas sprawdzania połączenia internetowego:', error);
            return false;
        }
    }

    // Sprawdzanie wszystkich statusów (tylko przy starcie aplikacji)
    async checkAllStatuses() {
        
        const locationStatus = await this.checkLocationStatus();
        const internetStatus = await this.checkInternetConnection();
        
        // Aktualizuj zmienne instancji
        const previousLocationStatus = this.isLocationEnabled;
        const previousInternetStatus = this.isInternetAvailable;
        const previousConnectionStatus = this.isConnected;
        
        this.isLocationEnabled = locationStatus;
        this.isInternetAvailable = internetStatus;
        this.isConnected = internetStatus;
        
        // Logika powiadomień
        

        
        // Pierwsze sprawdzenie - loguj tylko do konsoli
        if (previousLocationStatus === null && previousInternetStatus === null && locationStatus && internetStatus) {
        }
        
        const result = {
            location: locationStatus,
            internet: internetStatus,
            connected: internetStatus
        };
        
        return result;
    }

    // Jednorazowe sprawdzenie statusu przy starcie aplikacji (bez powiadomień)
    async performStartupCheck() {
        
        const locationStatus = await this.checkLocationStatus();
        const internetStatus = await this.checkInternetConnection();
        
        // Aktualizuj zmienne instancji
        this.isLocationEnabled = locationStatus;
        this.isInternetAvailable = internetStatus;
        this.isConnected = internetStatus;
        
        return {
            location: locationStatus,
            internet: internetStatus
        };
    }
    
    // Rozpoczęcie nasłuchiwania tylko podstawowych zdarzeń (bez powiadomień)
    startPeriodicChecks() {
        
        // Nasłuchuj tylko zmian statusu online/offline (bez powiadomień)
        window.addEventListener('online', () => {
            // Cicho aktualizuj status
        });
        
        window.addEventListener('offline', () => {
            // Cicho aktualizuj status
        });
    }

    // Zatrzymanie nasłuchiwania (obecnie tylko podstawowe zdarzenia sieciowe)
    stopChecking() {
        console.log('🛑 Zatrzymuję nasłuchiwanie zdarzeń...');
        console.log('🏁 Nasłuchiwanie zatrzymane (brak okresowego sprawdzania do zatrzymania)');
    }


}

// Eksport klasy globalnie
window.StatusChecker = StatusChecker;