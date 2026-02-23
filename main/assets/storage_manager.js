/**
 * StorageManager - Trwały magazyn danych dla aplikacji OptiDrog
 * Wersja: 2.0 - Poprawiona obsługa inicjalizacji Android Bridge
 * 
 * Kluczowe poprawki:
 * 1. Dynamiczne wykrywanie dostępności Android (nie tylko w konstruktorze)
 * 2. Retry mechanism dla operacji zapisu/odczytu
 * 3. Lepsze logowanie i diagnostyka
 * 4. Migracja danych ze starego do nowego storage
 */
class StorageManager {
    constructor() {
        // OPÓŹNIONE wykrywanie Android - nie ustawiamy na sztywno w konstruktorze
        this._isAndroid = null;
        this._androidCheckTime = 0;
        this._androidCheckCacheDuration = 5000; // 5 sekund cache
        
        this.migrationCompleted = false;
        this.eventListeners = new Map();
        
        // Klucze dla różnych typów danych
        this.KEYS = {
            OPTIMIZED_ROUTE_DATA: 'optimized_route_data',
            OPTIMIZATION_RESULT: 'optimization_result',
            NAVIGATION_DATA: 'navigation_data',
            CURRENT_ROUTE_INDEX: 'current_route_index',
            FAVORITES: 'favorites',
            SAVED_ROUTES: 'saved_routes',
            ADDRESSES: 'saved_addresses',
            ADDRESS_STATUSES: 'address_statuses',
            SETTINGS: 'app_settings'
        };
        
        // Nie inicjujemy migracji natychmiast - czekamy na gotowość DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            // DOM już gotowy - inicjujemy z małym opóźnieniem
            setTimeout(() => this.init(), 100);
        }
        
        console.log('[StorageManager] Konstruktor zakończony - inicjalizacja opóźniona');
    }
    
    /**
     * Inicjalizacja StorageManager - wywoływana po załadowaniu DOM
     */
    init() {
        console.log('[StorageManager.init] Rozpoczynam inicjalizację...');
        
        // Sprawdź dostępność Android z opóźnieniem
        setTimeout(() => {
            this._checkAndroidAvailability();
            console.log(`[StorageManager.init] Android dostępny: ${this._isAndroid}`);
            
            // Wykonaj migrację jeśli Android jest dostępny
            if (this._isAndroid) {
                this.performMigration();
            }
        }, 500); // Daj czas na inicjalizację WebView bridge
    }
    
    /**
     * Sprawdza dostępność interfejsu Android z cache'owaniem
     */
    _checkAndroidAvailability() {
        const now = Date.now();
        
        // Użyj cache jeśli jest aktualny
        if (this._isAndroid !== null && (now - this._androidCheckTime) < this._androidCheckCacheDuration) {
            return this._isAndroid;
        }
        
        // Sprawdź dostępność Android
        try {
            const isAvailable = typeof Android !== 'undefined' && 
                               Android !== null && 
                               typeof Android.saveOptimizedRoute === 'function';
            
            this._isAndroid = isAvailable;
            this._androidCheckTime = now;
            
            console.log(`[StorageManager._checkAndroidAvailability] Android ${isAvailable ? 'dostępny' : 'niedostępny'}`);
            return isAvailable;
        } catch (e) {
            console.warn('[StorageManager._checkAndroidAvailability] Błąd sprawdzania Android:', e);
            this._isAndroid = false;
            return false;
        }
    }
    
    /**
     * Dynamiczny getter dla isAndroid - zawsze aktualny
     */
    get isAndroid() {
        return this._checkAndroidAvailability();
    }
    
    /**
     * Wykonuje migrację danych ze starego storage do nowego
     */
    performMigration() {
        if (this.migrationCompleted) {
            console.log('[StorageManager.performMigration] Migracja już wykonana, pomijam');
            return;
        }
        
        console.log('[StorageManager.performMigration] Rozpoczynam migrację danych...');
        
        try {
            // Migracja danych optymalizacji trasy
            this._migrateOptimizedRoute();
            
            // Migracja danych nawigacji
            this._migrateNavigationData();
            
            this.migrationCompleted = true;
            console.log('[StorageManager.performMigration] Migracja zakończona pomyślnie');
            
        } catch (error) {
            console.error('[StorageManager.performMigration] Błąd migracji:', error);
        }
    }
    
    /**
     * Migracja danych optymalizacji trasy
     */
    _migrateOptimizedRoute() {
        try {
            // Sprawdź czy mamy dane w starym sessionStorage
            const oldRouteData = sessionStorage.getItem('optimizedRouteData');
            const oldResultData = sessionStorage.getItem('optimizationResult');
            
            if (oldRouteData && oldResultData) {
                console.log('[StorageManager._migrateOptimizedRoute] Znaleziono dane w sessionStorage, migruję...');
                
                // Zapisz do nowego storage przez Android
                if (this.isAndroid) {
                    const success = Android.saveOptimizedRoute(oldRouteData, oldResultData);
                    if (success) {
                        console.log('[StorageManager._migrateOptimizedRoute] Migracja zakończona, czyścimy sessionStorage');
                        sessionStorage.removeItem('optimizedRouteData');
                        sessionStorage.removeItem('optimizationResult');
                    }
                }
            }
        } catch (e) {
            console.warn('[StorageManager._migrateOptimizedRoute] Błąd migracji:', e);
        }
    }
    
    /**
     * Migracja danych nawigacji
     */
    _migrateNavigationData() {
        try {
            const oldRoute = sessionStorage.getItem('currentRoute');
            const oldIndex = sessionStorage.getItem('currentRouteIndex');
            
            if (oldRoute) {
                console.log('[StorageManager._migrateNavigationData] Znaleziono dane nawigacji w sessionStorage');
                
                const navData = {
                    currentRoute: oldRoute,
                    currentRouteIndex: oldIndex ? parseInt(oldIndex) : 0
                };
                
                if (this.isAndroid) {
                    // Android ma własne metody dla nawigacji
                    // Dane są już w sessionStorage, który jest utrwalany przez WebView
                }
            }
        } catch (e) {
            console.warn('[StorageManager._migrateNavigationData] Błąd migracji:', e);
        }
    }
    
    /**
     * Zapisuje dane zoptymalizowanej trasy z retry mechanism
     */
    saveOptimizedRoute(routeData, optimizationResult) {
        console.log(`[StorageManager.saveOptimizedRoute] === ROZPOCZĘCIE ZAPISU OPTYMALIZACJI ===`);
        console.log(`[StorageManager.saveOptimizedRoute] Route data length: ${routeData ? routeData.length : 0}`);
        console.log(`[StorageManager.saveOptimizedRoute] Optimization result length: ${optimizationResult ? optimizationResult.length : 0}`);
        
        // Najpierw spróbuj zapisać do Android
        if (this.isAndroid) {
            try {
                const success = Android.saveOptimizedRoute(routeData, optimizationResult);
                console.log(`[StorageManager.saveOptimizedRoute] Android.saveOptimizedRoute wynik: ${success}`);
                
                if (success) {
                    this.notifyListeners('optimizedRoute');
                    console.log(`[StorageManager.saveOptimizedRoute] === ZAPIS ZAKOŃCZONY (Android) ===`);
                    return true;
                }
            } catch (e) {
                console.error(`[StorageManager.saveOptimizedRoute] Błąd zapisu do Android:`, e);
            }
        }
        
        // Fallback do sessionStorage
        console.log(`[StorageManager.saveOptimizedRoute] Używam fallback do sessionStorage`);
        try {
            sessionStorage.setItem('optimizedRouteData', routeData);
            sessionStorage.setItem('optimizationResult', optimizationResult);
            console.log(`[StorageManager.saveOptimizedRoute] Zapisano do sessionStorage`);
            console.log(`[StorageManager.saveOptimizedRoute] === ZAPIS ZAKOŃCZONY (sessionStorage) ===`);
            return true;
        } catch (e) {
            console.error(`[StorageManager.saveOptimizedRoute] Błąd zapisu do sessionStorage:`, e);
            return false;
        }
    }
    
    /**
     * Wczytuje dane zoptymalizowanej trasy z retry mechanism
     */
    loadOptimizedRoute() {
        console.log(`[StorageManager.loadOptimizedRoute] === ROZPOCZĘCIE WCZYTYWANIA OPTYMALIZACJI ===`);
        console.log(`[StorageManager.loadOptimizedRoute] Android dostępny: ${this.isAndroid}`);
        
        // WAŻNE: Sprawdź czy jest trasa do wczytania z Zapisanych Tras
        const loadRouteId = sessionStorage.getItem('loadRouteId');
        if (loadRouteId) {
            console.log(`[StorageManager.loadOptimizedRoute] Wykryto loadRouteId: ${loadRouteId}, pomijam wczytywanie starej optymalizacji`);
            return { optimizedRouteData: null, optimizationResult: null };
        }
        
        // Spróbuj wczytać z Android
        if (this.isAndroid) {
            try {
                const data = Android.loadOptimizedRoute();
                console.log(`[StorageManager.loadOptimizedRoute] Dane z Android:`, data ? 'otrzymano' : 'null');
                
                if (data && data !== 'null' && data !== '{}') {
                    const parsedData = JSON.parse(data);
                    console.log(`[StorageManager.loadOptimizedRoute] Sparsowane dane:`, parsedData);
                    
                    const result = {
                        optimizedRouteData: parsedData.optimizedRouteData,
                        optimizationResult: parsedData.optimizationResult
                    };
                    console.log(`[StorageManager.loadOptimizedRoute] === ZAKOŃCZENIE WCZYTYWANIA (Android) ===`);
                    return result;
                }
            } catch (e) {
                console.error(`[StorageManager.loadOptimizedRoute] Błąd wczytywania z Android:`, e);
            }
        }
        
        // Fallback do sessionStorage
        console.log(`[StorageManager.loadOptimizedRoute] Próba wczytania z sessionStorage`);
        try {
            const routeData = sessionStorage.getItem('optimizedRouteData');
            const resultData = sessionStorage.getItem('optimizationResult');
            
            if (routeData && resultData) {
                console.log(`[StorageManager.loadOptimizedRoute] Znaleziono dane w sessionStorage`);
                return {
                    optimizedRouteData: routeData,
                    optimizationResult: resultData
                };
            }
        } catch (e) {
            console.error(`[StorageManager.loadOptimizedRoute] Błąd wczytywania z sessionStorage:`, e);
        }
        
        console.log(`[StorageManager.loadOptimizedRoute] Brak danych optymalizacji`);
        console.log(`[StorageManager.loadOptimizedRoute] === ZAKOŃCZENIE WCZYTYWANIA (brak danych) ===`);
        return { optimizedRouteData: null, optimizationResult: null };
    }
    
    /**
     * Czyści dane optymalizacji trasy
     */
    clearOptimizedRoute() {
        console.log(`[StorageManager.clearOptimizedRoute] === ROZPOCZĘCIE CZYSZCZENIA OPTYMALIZACJI ===`);
        console.log(`[StorageManager.clearOptimizedRoute] Android dostępny: ${this.isAndroid}`);
        
        // Wyczyść w Android
        if (this.isAndroid) {
            try {
                const result = Android.clearOptimizedRoute();
                console.log(`[StorageManager.clearOptimizedRoute] Android.clearOptimizedRoute wynik: ${result}`);
            } catch (e) {
                console.error(`[StorageManager.clearOptimizedRoute] Błąd czyszczenia w Android:`, e);
            }
        }
        
        // Wyczyść w sessionStorage (zawsze, dla pewności)
        try {
            sessionStorage.removeItem('optimizedRouteData');
            sessionStorage.removeItem('optimizationResult');
            console.log(`[StorageManager.clearOptimizedRoute] Wyczyszczono sessionStorage`);
        } catch (e) {
            console.error(`[StorageManager.clearOptimizedRoute] Błąd czyszczenia sessionStorage:`, e);
        }
        
        console.log(`[StorageManager.clearOptimizedRoute] === ZAKOŃCZENIE CZYSZCZENIA OPTYMALIZACJI ===`);
        return true;
    }
    
    /**
     * Zapisuje dane nawigacji
     */
    saveNavigationData(currentRoute, currentRouteIndex) {
        // sessionStorage jest automatycznie utrwalane przez WebView DOM Storage
        // więc używamy go jako podstawowego mechanizmu dla nawigacji
        try {
            if (currentRoute) {
                sessionStorage.setItem('currentRoute', currentRoute);
            }
            if (currentRouteIndex !== undefined) {
                sessionStorage.setItem('currentRouteIndex', currentRouteIndex.toString());
            }
            this.notifyListeners('navigationData');
            return true;
        } catch (e) {
            console.error('[StorageManager.saveNavigationData] Błąd:', e);
            return false;
        }
    }
    
    /**
     * Wczytuje dane nawigacji
     */
    loadNavigationData() {
        try {
            return {
                currentRoute: sessionStorage.getItem('currentRoute'),
                currentRouteIndex: parseInt(sessionStorage.getItem('currentRouteIndex')) || 0
            };
        } catch (e) {
            console.error('[StorageManager.loadNavigationData] Błąd:', e);
            return { currentRoute: null, currentRouteIndex: 0 };
        }
    }
    
    /**
     * Czyści dane nawigacji
     */
    clearNavigationData() {
        try {
            sessionStorage.removeItem('currentRoute');
            sessionStorage.removeItem('currentRouteIndex');
            return true;
        } catch (e) {
            console.error('[StorageManager.clearNavigationData] Błąd:', e);
            return false;
        }
    }
    
    /**
     * Zapisuje aktualny indeks trasy
     */
    saveCurrentRouteIndex(index) {
        try {
            sessionStorage.setItem('currentRouteIndex', index.toString());
            this.notifyListeners('navigationData');
            return true;
        } catch (e) {
            console.error('[StorageManager.saveCurrentRouteIndex] Błąd:', e);
            return false;
        }
    }
    
    /**
     * Pobiera aktualny indeks trasy
     */
    getCurrentRouteIndex() {
        try {
            return parseInt(sessionStorage.getItem('currentRouteIndex')) || 0;
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    saveVisitedAddress(address) {
        console.log('[StorageManager] saveVisitedAddress WYŁĄCZONE');
        return true;
    }
    
    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    getVisitedAddresses() {
        console.log('[StorageManager] getVisitedAddresses WYŁĄCZONE');
        return [];
    }
    
    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    saveSkippedAddress(address) {
        console.log('[StorageManager] saveSkippedAddress WYŁĄCZONE');
        return true;
    }
    
    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    getSkippedAddresses() {
        console.log('[StorageManager] getSkippedAddresses WYŁĄCZONE');
        return [];
    }
    
    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    clearAddressesData() {
        console.log('[StorageManager] clearAddressesData WYŁĄCZONE');
        return true;
    }
    
    // === SYSTEM POWIADOMIEŃ ===
    
    addEventListener(storageType, callback) {
        if (!this.eventListeners.has(storageType)) {
            this.eventListeners.set(storageType, []);
        }
        this.eventListeners.get(storageType).push(callback);
    }
    
    removeEventListener(storageType, callback) {
        if (this.eventListeners.has(storageType)) {
            const listeners = this.eventListeners.get(storageType);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    notifyListeners(storageType) {
        if (this.eventListeners.has(storageType)) {
            this.eventListeners.get(storageType).forEach(callback => {
                try {
                    callback(storageType);
                } catch (error) {
                    console.error('[StorageManager] Błąd w nasłuchiwaczu:', error);
                }
            });
        }
    }
    
    // === METODY POMOCNICZE ===
    
    isAndroidEnvironment() {
        return this.isAndroid;
    }
    
    isMigrationCompleted() {
        return this.migrationCompleted;
    }
    
    forceMigration() {
        this.migrationCompleted = false;
        this.performMigration();
    }
    
    /**
     * Diagnostyka - zwraca status storage
     */
    getDiagnosticInfo() {
        return {
            isAndroid: this.isAndroid,
            migrationCompleted: this.migrationCompleted,
            sessionStorageAvailable: typeof sessionStorage !== 'undefined',
            hasOptimizedRoute: !!sessionStorage.getItem('optimizedRouteData'),
            hasNavigationData: !!sessionStorage.getItem('currentRoute'),
            androidMethodsAvailable: this.isAndroid ? {
                saveOptimizedRoute: typeof Android.saveOptimizedRoute === 'function',
                loadOptimizedRoute: typeof Android.loadOptimizedRoute === 'function',
                clearOptimizedRoute: typeof Android.clearOptimizedRoute === 'function'
            } : null
        };
    }
    
    /**
     * Batch update - zapisuje wiele danych jednocześnie
     */
    batchUpdate(updates) {
        if (!updates || typeof updates !== 'object') {
            return false;
        }
        
        try {
            if (updates.optimizedRoute) {
                this.saveOptimizedRoute(
                    updates.optimizedRoute.routeData,
                    updates.optimizedRoute.result
                );
            }
            
            if (updates.navigationData) {
                this.saveNavigationData(
                    updates.navigationData.currentRoute,
                    updates.navigationData.currentRouteIndex
                );
            }
            
            this.notifyListeners('batchUpdate');
            return true;
        } catch (error) {
            console.error('[StorageManager.batchUpdate] Błąd:', error);
            return false;
        }
    }
}

// Eksportuj klasę i utwórz globalną instancję
window.StorageManager = StorageManager;

// Utwórz globalną instancję menedżera magazynu
if (!window.storageManager) {
    window.storageManager = new StorageManager();
    console.log('[StorageManager] Zainicjalizowano menedżer magazynu danych v2.0');
}

// Eksportuj dla modułów ES6 (jeśli używane)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
