/**
 * Menedżer magazynu danych - zastępuje sessionStorage trwałymi magazynami Android
 * Zapewnia synchronizację między JavaScript a Kotlin WebAppInterface
 */
class StorageManager {
    constructor() {
        this.isAndroid = typeof Android !== 'undefined';
        this.migrationCompleted = false;
        this.eventListeners = new Map();
        
        // Inicjalizuj nasłuchiwanie aktualizacji z Android
        this.initStorageUpdateListener();
        
        // Wykonaj migrację przy pierwszym uruchomieniu
        this.performMigration();
    }

    /**
     * Inicjalizuje nasłuchiwanie aktualizacji magazynu z Android
     */
    initStorageUpdateListener() {
        // Globalna funkcja wywoływana przez Android po aktualizacji danych
        window.onStorageUpdated = (storageType) => {
            console.log(`[StorageManager] Otrzymano aktualizację magazynu: ${storageType}`);
            this.notifyListeners(storageType);
        };
    }

    /**
     * Wykonuje migrację danych z sessionStorage do trwałych magazynów
     */
    performMigration() {
        if (this.migrationCompleted || !this.isAndroid) {
            return;
        }

        try {
            console.log('[StorageManager] Rozpoczynam migrację danych z sessionStorage...');
            
            // Migracja danych optymalizacji trasy
            this.migrateOptimizationData();
            
            // Migracja danych nawigacji
            this.migrateNavigationData();
            
            // Migracja odwiedzonych i pominiętych adresów
            this.migrateAddressesData();
            
            // Wyczyść sessionStorage po migracji
            this.clearSessionStorage();
            
            this.migrationCompleted = true;
            console.log('[StorageManager] Migracja zakończona pomyślnie');
            
        } catch (error) {
            console.error('[StorageManager] Błąd podczas migracji:', error);
        }
    }

    /**
     * Migruje dane optymalizacji trasy
     */
    migrateOptimizationData() {
        const optimizedRouteData = sessionStorage.getItem('optimizedRouteData');
        const optimizationResult = sessionStorage.getItem('optimizationResult');
        
        if (optimizedRouteData || optimizationResult) {
            const migrationData = {
                optimizedRouteData: optimizedRouteData,
                optimizationResult: optimizationResult,
                timestamp: Date.now()
            };
            
            Android.saveOptimizedRoute(JSON.stringify(migrationData));
            console.log('[StorageManager] Zmigrowano dane optymalizacji trasy');
        }
    }

    /**
     * Migruje dane nawigacji
     */
    migrateNavigationData() {
        const currentRoute = sessionStorage.getItem('currentRoute');
        const currentRouteIndex = sessionStorage.getItem('currentRouteIndex');
        
        if (currentRoute || currentRouteIndex) {
            const navigationData = {
                currentRoute: currentRoute,
                currentRouteIndex: currentRouteIndex ? parseInt(currentRouteIndex) : 0
            };
            
            Android.saveNavigationData(JSON.stringify(navigationData));
            console.log('[StorageManager] Zmigrowano dane nawigacji');
        }
    }

    /**
     * Migruje dane odwiedzonych i pominiętych adresów
     * WYŁĄCZONE - funkcjonalność statusów adresów została usunięta
     */
    migrateAddressesData() {
        console.log('[StorageManager] Migracja adresów WYŁĄCZONA - funkcjonalność statusów adresów została usunięta');
    }

    /**
     * Czyści sessionStorage po migracji
     */
    clearSessionStorage() {
        const keysToRemove = [
            'optimizedRouteData',
            'optimizationResult', 
            'currentRoute',
            'currentRouteIndex',
            'visitedAddresses',
            'skippedAddresses',
            'routeLoadingFlag'
        ];
        
        keysToRemove.forEach(key => {
            sessionStorage.removeItem(key);
        });
        
        console.log('[StorageManager] Wyczyszczono sessionStorage');
    }

    // === METODY PUBLICZNE API ===

    /**
     * Zapisuje dane optymalizacji trasy
     */
    saveOptimizedRoute(routeData, optimizationResult) {
        console.log(`[StorageManager.saveOptimizedRoute] === ROZPOCZĘCIE ZAPISU OPTYMALIZACJI ===`);
        console.log(`[StorageManager.saveOptimizedRoute] Czy Android: ${this.isAndroid}`);
        console.log(`[StorageManager.saveOptimizedRoute] Długość routeData: ${routeData ? routeData.length : 'null'}`);
        console.log(`[StorageManager.saveOptimizedRoute] Długość optimizationResult: ${optimizationResult ? optimizationResult.length : 'null'}`);
        console.log(`[StorageManager.saveOptimizedRoute] Treść routeData:`, routeData);
        console.log(`[StorageManager.saveOptimizedRoute] Treść optimizationResult:`, optimizationResult);
        
        if (!this.isAndroid) {
            console.log(`[StorageManager.saveOptimizedRoute] Zapis w sessionStorage`);
            sessionStorage.setItem('optimizedRouteData', routeData);
            sessionStorage.setItem('optimizationResult', optimizationResult);
            return true;
        }
        
        const data = {
            optimizedRouteData: routeData,
            optimizationResult: optimizationResult,
            timestamp: Date.now()
        };
        
        console.log(`[StorageManager.saveOptimizedRoute] Dane do wysłania do Android:`, JSON.stringify(data));
        const result = Android.saveOptimizedRoute(JSON.stringify(data));
        console.log(`[StorageManager.saveOptimizedRoute] Wynik z Android:`, result);
        console.log(`[StorageManager.saveOptimizedRoute] === ZAKOŃCZENIE ZAPISU OPTYMALIZACJI ===`);
        return result;
    }

    /**
     * Wczytuje dane optymalizacji trasy
     */
    loadOptimizedRoute() {
        console.log(`[StorageManager.loadOptimizedRoute] === ROZPOCZĘCIE WCZYTYWANIA OPTYMALIZACJI ===`);
        console.log(`[StorageManager.loadOptimizedRoute] Czy Android: ${this.isAndroid}`);
        
        if (!this.isAndroid) {
            console.log(`[StorageManager.loadOptimizedRoute] Wczytywanie z sessionStorage`);
            const result = {
                optimizedRouteData: sessionStorage.getItem('optimizedRouteData'),
                optimizationResult: sessionStorage.getItem('optimizationResult')
            };
            console.log(`[StorageManager.loadOptimizedRoute] Wynik z sessionStorage:`, result);
            return result;
        }
        
        try {
            console.log(`[StorageManager.loadOptimizedRoute] Wywołuję Android.loadOptimizedRoute()`);
            const data = Android.loadOptimizedRoute();
            console.log(`[StorageManager.loadOptimizedRoute] Dane z Android:`, data);
            
            if (data && data !== 'null') {
                const parsedData = JSON.parse(data);
                console.log(`[StorageManager.loadOptimizedRoute] Sparsowane dane:`, parsedData);
                const result = {
                    optimizedRouteData: parsedData.optimizedRouteData,
                    optimizationResult: parsedData.optimizationResult
                };
                console.log(`[StorageManager.loadOptimizedRoute] Wynik końcowy:`, result);
                console.log(`[StorageManager.loadOptimizedRoute] === ZAKOŃCZENIE WCZYTYWANIA OPTYMALIZACJI ===`);
                return result;
            } else {
                console.log(`[StorageManager.loadOptimizedRoute] Brak danych z Android`);
            }
        } catch (error) {
            console.error('[StorageManager] Błąd wczytywania danych optymalizacji:', error);
        }
        
        const emptyResult = { optimizedRouteData: null, optimizationResult: null };
        console.log(`[StorageManager.loadOptimizedRoute] Zwracam pusty wynik:`, emptyResult);
        console.log(`[StorageManager.loadOptimizedRoute] === ZAKOŃCZENIE WCZYTYWANIA OPTYMALIZACJI ===`);
        return emptyResult;
    }

    /**
     * Czyści dane optymalizacji trasy
     */
    clearOptimizedRoute() {
        console.log(`[StorageManager.clearOptimizedRoute] === ROZPOCZĘCIE CZYSZCZENIA OPTYMALIZACJI ===`);
        console.log(`[StorageManager.clearOptimizedRoute] Czy Android: ${this.isAndroid}`);
        
        if (!this.isAndroid) {
            console.log(`[StorageManager.clearOptimizedRoute] Usuwam z sessionStorage`);
            sessionStorage.removeItem('optimizedRouteData');
            sessionStorage.removeItem('optimizationResult');
            console.log(`[StorageManager.clearOptimizedRoute] Dane usunięte z sessionStorage`);
            return true;
        }
        
        const result = Android.clearOptimizedRoute();
        console.log(`[StorageManager.clearOptimizedRoute] Wynik z Android.clearOptimizedRoute():`, result);
        console.log(`[StorageManager.clearOptimizedRoute] === ZAKOŃCZENIE CZYSZCZENIA OPTYMALIZACJI ===`);
        return result;
    }

    /**
     * Zapisuje dane nawigacji z optymalizacją
     */
    saveNavigationData(currentRoute, currentRouteIndex) {
        if (!this.isAndroid) {
            const currentStoredRoute = sessionStorage.getItem('currentRoute');
            const currentStoredIndex = sessionStorage.getItem('currentRouteIndex');
            
            if (currentRoute && currentStoredRoute !== currentRoute) {
                sessionStorage.setItem('currentRoute', currentRoute);
            }
            if (currentRouteIndex !== undefined && currentStoredIndex !== currentRouteIndex.toString()) {
                sessionStorage.setItem('currentRouteIndex', currentRouteIndex.toString());
            }
            return true;
        }
        
        const navigationData = {
            currentRoute: currentRoute,
            currentRouteIndex: currentRouteIndex || 0
        };
        
        // Sprawdź czy dane się zmieniły przed zapisem
        const currentData = this.loadNavigationData();
        if (JSON.stringify(currentData) !== JSON.stringify(navigationData)) {
            const result = Android.saveNavigationData(JSON.stringify(navigationData));
            this.notifyListeners('navigationData');
            return result;
        }
        
        return true;
    }

    /**
     * Wczytuje dane nawigacji
     */
    loadNavigationData() {
        if (!this.isAndroid) {
            return {
                currentRoute: sessionStorage.getItem('currentRoute'),
                currentRouteIndex: parseInt(sessionStorage.getItem('currentRouteIndex')) || 0
            };
        }
        
        try {
            const data = Android.loadNavigationData();
            if (data && data !== 'null') {
                const parsedData = JSON.parse(data);
                return {
                    currentRoute: parsedData.currentRoute,
                    currentRouteIndex: parsedData.currentRouteIndex || 0
                };
            }
        } catch (error) {
            console.error('[StorageManager] Błąd wczytywania danych nawigacji:', error);
        }
        
        return { currentRoute: null, currentRouteIndex: 0 };
    }

    /**
     * Czyści dane nawigacji
     */
    clearNavigationData() {
        if (!this.isAndroid) {
            sessionStorage.removeItem('currentRoute');
            sessionStorage.removeItem('currentRouteIndex');
            return true;
        }
        
        return Android.clearNavigationData();
    }

    /**
     * Zapisuje aktualny indeks trasy z optymalizacją
     */
    saveCurrentRouteIndex(index) {
        if (!this.isAndroid) {
            const currentIndex = sessionStorage.getItem('currentRouteIndex');
            const newIndex = index.toString();
            if (currentIndex !== newIndex) {
                sessionStorage.setItem('currentRouteIndex', newIndex);
            }
            return true;
        }
        
        // Sprawdź czy indeks się zmienił
        const currentIndex = this.getCurrentRouteIndex();
        if (currentIndex !== index) {
            const result = Android.saveCurrentRouteIndex(index);
            this.notifyListeners('navigationData');
            return result;
        }
        
        return true;
    }

    /**
     * Pobiera aktualny indeks trasy
     */
    getCurrentRouteIndex() {
        if (!this.isAndroid) {
            return parseInt(sessionStorage.getItem('currentRouteIndex')) || 0;
        }
        
        return Android.getCurrentRouteIndex();
    }

    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    saveVisitedAddress(address) {
        console.log('[StorageManager] saveVisitedAddress WYŁĄCZONE - funkcjonalność statusów adresów została usunięta');
        return true; // Zwracamy true aby nie powodować błędów
    }

    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    getVisitedAddresses() {
        console.log('[StorageManager] getVisitedAddresses WYŁĄCZONE - funkcjonalność statusów adresów została usunięta');
        return []; // Zwracamy pustą tablicę aby nie powodować błędów
    }

    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    saveSkippedAddress(address) {
        console.log('[StorageManager] saveSkippedAddress WYŁĄCZONE - funkcjonalność statusów adresów została usunięta');
        return true; // Zwracamy true aby nie powodować błędów
    }

    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    getSkippedAddresses() {
        console.log('[StorageManager] getSkippedAddresses WYŁĄCZONE - funkcjonalność statusów adresów została usunięta');
        return []; // Zwracamy pustą tablicę aby nie powodować błędów
    }

    /**
     * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
     */
    clearAddressesData() {
        console.log('[StorageManager] clearAddressesData WYŁĄCZONE - funkcjonalność statusów adresów została usunięta');
        return true; // Zwracamy true aby nie powodować błędów
    }

    // === SYSTEM POWIADOMIEŃ ===

    /**
     * Dodaje nasłuchiwacz aktualizacji magazynu
     */
    addEventListener(storageType, callback) {
        if (!this.eventListeners.has(storageType)) {
            this.eventListeners.set(storageType, []);
        }
        this.eventListeners.get(storageType).push(callback);
    }

    /**
     * Usuwa nasłuchiwacz aktualizacji magazynu
     */
    removeEventListener(storageType, callback) {
        if (this.eventListeners.has(storageType)) {
            const listeners = this.eventListeners.get(storageType);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Powiadamia nasłuchiwaczy o aktualizacji
     */
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

    /**
     * Sprawdza czy aplikacja działa w środowisku Android
     */
    isAndroidEnvironment() {
        return this.isAndroid;
    }

    /**
     * Sprawdza czy migracja została zakończona
     */
    isMigrationCompleted() {
        return this.migrationCompleted;
    }

    /**
     * Wymusza ponowną migrację (tylko do celów debugowania)
     */
    forceMigration() {
        this.migrationCompleted = false;
        this.performMigration();
    }

    /**
     * Batch update - zapisuje wiele danych jednocześnie
     */
    batchUpdate(updates) {
        if (!updates || typeof updates !== 'object') {
            return false;
        }
        
        try {
            let hasChanges = false;
            const pendingUpdates = {};
            
            // Sprawdź które dane rzeczywiście się zmieniły
            if (updates.navigationData) {
                const currentData = this.loadNavigationData();
                if (JSON.stringify(currentData) !== JSON.stringify(updates.navigationData)) {
                    pendingUpdates.navigationData = updates.navigationData;
                    hasChanges = true;
                }
            }
            
            if (updates.routeIndex !== undefined) {
                const currentIndex = this.getCurrentRouteIndex();
                if (currentIndex !== updates.routeIndex) {
                    pendingUpdates.routeIndex = updates.routeIndex;
                    hasChanges = true;
                }
            }
            
            if (updates.optimizedRoute) {
                const currentRoute = this.loadOptimizedRoute();
                if (JSON.stringify(currentRoute) !== JSON.stringify(updates.optimizedRoute)) {
                    pendingUpdates.optimizedRoute = updates.optimizedRoute;
                    hasChanges = true;
                }
            }
            
            // Wykonaj aktualizacje tylko jeśli są zmiany
            if (hasChanges) {
                if (pendingUpdates.navigationData) {
                    this.saveNavigationData(pendingUpdates.navigationData.currentRoute, pendingUpdates.navigationData.currentRouteIndex);
                }
                if (pendingUpdates.routeIndex !== undefined) {
                    this.saveCurrentRouteIndex(pendingUpdates.routeIndex);
                }
                if (pendingUpdates.optimizedRoute) {
                    this.saveOptimizedRoute(JSON.stringify(pendingUpdates.optimizedRoute.route), JSON.stringify(pendingUpdates.optimizedRoute.result));
                }
                
                this.notifyListeners('batchUpdate', pendingUpdates);
            }
            
            return true;
        } catch (error) {
            console.error('Błąd podczas batch update:', error);
            return false;
        }
    }
}

// Eksportuj klasę i utwórz globalną instancję
window.StorageManager = StorageManager;

// Utwórz globalną instancję menedżera magazynu
if (!window.storageManager) {
    window.storageManager = new StorageManager();
    console.log('[StorageManager] Zainicjalizowano menedżer magazynu danych');
}

// Eksportuj dla modułów ES6 (jeśli używane)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}