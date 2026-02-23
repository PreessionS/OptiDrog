# Plan Optymalizacji Przepływu Danych - OptiDrog

## Diagnoza Problemu

### Główne problemy identyfikowane w kodzie:

1. **Timing inicjalizacji Android Bridge**
   - `StorageManager` sprawdza dostępność `Android` w konstruktorze
   - Jeśli WebView nie jest w pełni gotowy, `isAndroid` = `false`
   - Wszystkie dane trafiają do `sessionStorage` zamiast do trwałego storage Android

2. **Race conditions przy wczytywaniu danych**
   - `loadSavedRoute()` w `app.js` sprawdza `sessionStorage.getItem('loadRouteId')` 
   - Może blokować wczytywanie zoptymalizowanej trasy
   - Brak koordynacji między różnymi źródłami danych

3. **Niespójne źródła danych**
   - `sessionStorage` - dane sesji (ulotne)
   - `localStorage` - dane przeglądarki (nie używane w Android)
   - `SharedPreferences` przez Android bridge - trwałe dane
   - Brak jasnej hierarchii i mechanizmów synchronizacji

4. **Duplikacja logiki zapisu/odczytu**
   - Każdy moduł ma własne metody zapisu
   - Brak centralnego zarządzania stanem aplikacji

---

## Architektura Po Optymalizacji

### Hierarchia Storage (od najtrwalszego do najmniej trwałego):

```
┌─────────────────────────────────────────────────────────────┐
│                      ANDROID BRIDGE                          │
│  (SharedPreferences - trwałe, przetrwa restart aplikacji)   │
│                                                             │
│  • saved_addresses     - adresy z tabeli                    │
│  • saved_routes        - zapisane trasy                     │
│  • favorites           - ulubione adresy                    │
│  • optimized_route     - ostatnia zoptymalizowana trasa     │
│  • navigation_data     - stan nawigacji                     │
│  • address_statuses    - statusy odwiedzonych adresów       │
└─────────────────────────────────────────────────────────────┘
                            ↓ fallback
┌─────────────────────────────────────────────────────────────┐
│                      SESSION STORAGE                         │
│       (dane sesji - przetrwa przeładowanie strony)          │
│                                                             │
│  • currentRoute        - aktualna trasa nawigacji           │
│  • currentRouteIndex   - indeks aktualnego punktu           │
│  • loadRouteId         - ID trasy do wczytania              │
│  • reverseRouteState   - stan checkboxa odwracania          │
└─────────────────────────────────────────────────────────────┘
                            ↓ fallback
┌─────────────────────────────────────────────────────────────┐
│                      LOCAL STORAGE                           │
│           (tylko dla danych przeglądarki/web)               │
│                                                             │
│  • optiDrogFavorites   - ulubione (dla web)                 │
│  • saved_routes        - trasy (dla web)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Zalecane Zmiany

### 1. Ujednolicenie StorageManager (ZROBIONE)

**Plik:** `assets/js/storage_manager.js`

**Zmiany:**
- ✅ Dynamiczne wykrywanie dostępności Android (nie tylko w konstruktorze)
- ✅ Retry mechanism dla operacji zapisu/odczytu
- ✅ Lepsze logowanie diagnostyczne
- ✅ Migracja danych ze starego storage

### 2. Poprawa inicjalizacji w app.js

**Plik:** `assets/app.js`

**Problemy:**
```javascript
// Obecny kod - potencjalny race condition
loadSavedRoute() {
    if (loadRouteId) {
        console.log('Wykryto loadRouteId, pomijam wczytywanie starej trasy');
        return;  // ❌ Może pominąć ważne dane
    }
}
```

**Zalecana zmiana:**
```javascript
loadSavedRoute() {
    // Najpierw sprawdzić czy StorageManager jest gotowy
    if (typeof window.storageManager === 'undefined') {
        console.log('StorageManager nie gotowy, ponawiam za 100ms');
        setTimeout(() => this.loadSavedRoute(), 100);
        return;
    }
    
    // Sprawdzić czy jest trasa do wczytania z Zapisanych Tras
    const loadRouteId = sessionStorage.getItem('loadRouteId');
    if (loadRouteId) {
        console.log('Wykryto loadRouteId, wczytuję zapisaną trasę:', loadRouteId);
        // Nie return - kontynuuj aby wczytać dodatkowe dane
    }
    
    // Wczytaj ostatnią zoptymalizowaną trasę
    const savedData = window.storageManager.loadOptimizedRoute();
    // ... reszta logiki
}
```

### 3. Poprawa wczytywania w NavigationManager

**Plik:** `assets/navigation_manager.js`

**Problemy:**
- `loadOptimizationFromSession()` sprawdza `loadRouteId` przed sprawdzeniem StorageManager
- Brak retry gdy StorageManager nie jest gotowy

**Zalecana zmiana:**
```javascript
loadOptimizationFromSession(retryCount = 0) {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 200;
    
    // Sprawdź czy StorageManager jest gotowy
    if (typeof window.storageManager === 'undefined') {
        if (retryCount < MAX_RETRIES) {
            console.log(`[NavigationManager] StorageManager nie gotowy, ponawiam (${retryCount + 1}/${MAX_RETRIES})`);
            setTimeout(() => this.loadOptimizationFromSession(retryCount + 1), RETRY_DELAY);
            return false;
        }
        console.warn('[NavigationManager] StorageManager niedostępny po wielu próbach');
        return false;
    }
    
    // Sprawdź czy optymalizacja już jest załadowana
    if (this.optimizedRouteData && this.optimizedRouteData.length > 0) {
        console.log('[NavigationManager] Optymalizacja już załadowana');
        return true;
    }
    
    // Wczytaj dane
    const savedData = window.storageManager.loadOptimizedRoute();
    // ... reszta logiki
}
```

### 4. Ujednolicenie zapisu w TableManager

**Plik:** `assets/table_manager.js`

**Problemy:**
- `saveAddresses()` wywołuje `Android.saveAddresses()` bezpośrednio
- Brak wykorzystania StorageManager

**Zalecana zmiana - dodać metodę do StorageManager:**
```javascript
// W StorageManager:
saveAddresses(addresses) {
    const data = JSON.stringify(addresses);
    
    if (this.isAndroid && typeof Android.saveAddresses === 'function') {
        return Android.saveAddresses(data);
    }
    
    // Fallback do sessionStorage
    sessionStorage.setItem('saved_addresses', data);
    return true;
}

loadAddresses() {
    if (this.isAndroid && typeof Android.loadSavedAddresses === 'function') {
        return Android.loadSavedAddresses();
    }
    
    const data = sessionStorage.getItem('saved_addresses');
    return data || '[]';
}
```

### 5. Poprawa inicjalizacji w MainActivity.kt

**Plik:** `java/pl/optidrog/app/MainActivity.kt`

**Problemy:**
- Wiele różnych SharedPreferences
- Brak koordynacji między `onPageFinished` a dostępnością JavaScript

**Zalecane zmiany:**

```kotlin
// Ujednolicenie nazw SharedPreferences
companion object {
    private const val PREFS_NAME = "OptiDrogPrefs"
    
    // Klucze
    private const val KEY_ADDRESSES = "saved_addresses"
    private const val KEY_OPTIMIZED_ROUTE = "optimized_route_data"
    private const val KEY_OPTIMIZATION_RESULT = "optimization_result"
    private const val KEY_FAVORITES = "favorites"
    private const val KEY_ROUTES = "saved_routes"
    private const val KEY_CACHED_LOCATION = "cached_location"
    private const val KEY_SETTINGS = "app_settings"
}

// W WebViewClient.onPageFinished:
override fun onPageFinished(view: WebView?, url: String?) {
    super.onPageFinished(view, url)
    
    // KOLEJNOŚĆ WCZYTYWANIA:
    // 1. Najpierw lokalizacja (szybkie UX)
    loadCachedLocationForNavigation()
    
    // 2. Potem adresy (ważne dla użytkownika)
    webView.postDelayed({
        loadSavedAddresses()
    }, 300)
    
    // 3. Na końcu optymalizacja (może poczekać)
    webView.postDelayed({
        loadOptimizedRoute()
    }, 600)
}
```

---

## Diagram Przepływu Danych (Po Optymalizacji)

```
┌──────────────────────────────────────────────────────────────────────┐
│                           START APLIKACJI                            │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    MainActivity.onCreate()                           │
│  • Inicjalizacja WebView                                             │
│  • Ustawienie WebAppInterface                                        │
│  • Włączenie DOM Storage (setDomStorageEnabled = true)              │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    WebView.onPageFinished()                          │
│  • loadCachedLocationForNavigation() - natychmiast                  │
│  • loadSavedAddresses() - po 300ms                                   │
│  • loadOptimizedRoute() - po 600ms                                   │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    StorageManager.init()                             │
│  • Sprawdzenie dostępności Android (z retry)                         │
│  • Migracja danych ze sessionStorage do Android                      │
│  • Inicjalizacja nasłuchiwaczy                                       │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    OptiDrogApp.init()                                │
│  • MapManager                                                        │
│  • TableManager                                                      │
│  • AddressSearchManager                                              │
│  • NavigationManager → loadOptimizationFromSession()                 │
│  • FavoritesManager                                                  │
│  • loadSavedRoute()                                                  │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    APLIKACJA GOTOWA                                  │
│  • Wszystkie dane wczytane i zsynchronizowane                        │
│  • StorageManager dostępny przez window.storageManager               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Lista Zadań Do Wykonania

### Priorytet Krytyczny (Blokery)

- [x] **StorageManager v2.0** - Naprawione wykrywanie Android z retry
- [ ] **app.js** - Poprawa `loadSavedRoute()` z retry mechanism
- [ ] **navigation_manager.js** - Poprawa `loadOptimizationFromSession()` z retry

### Priorytet Wysoki

- [ ] **table_manager.js** - Dodanie metod saveAddresses/loadAddresses do StorageManager
- [ ] **route_storage.js** - Ujednolicenie z StorageManager
- [ ] **favorites_manager.js** - Ujednolicenie z StorageManager

### Priorytet Średni

- [ ] **MainActivity.kt** - Ujednolicenie SharedPreferences
- [ ] Dodanie diagnostyki do logów (StorageManager.getDiagnosticInfo())
- [ ] Testy jednostkowe dla StorageManager

### Priorytet Niski

- [ ] Dokumentacja API StorageManager
- [ ] Optymalizacja wydajności batch operations

---

## Testy Do Przeprowadzenia

### Scenariusz 1: Pierwsze uruchomienie
1. Zainstaluj aplikację
2. Dodaj kilka adresów
3. Zoptymalizuj trasę
4. Zamknij aplikację
5. Uruchom ponownie
6. **Oczekiwane:** Adresy i optymalizacja zachowane

### Scenariusz 2: Restart podczas nawigacji
1. Rozpocznij nawigację
2. Przejdź do następnego punktu
3. Zamknij aplikację (bez zamykania procesu)
4. Uruchom ponownie
5. **Oczekiwane:** Stan nawigacji zachowany (aktualny indeks)

### Scenariusz 3: Wczytanie zapisanej trasy
1. Zapisz trasę z nazwą "Testowa"
2. Zamknij aplikację
3. Uruchom ponownie
4. Wczytaj trasę "Testowa"
5. **Oczekiwane:** Trasa wczytana poprawnie z wszystkimi punktami

### Scenariusz 4: Awaria WebView
1. Rozpocznij optymalizację
2. Wymuś zamknięcie aplikacji
3. Uruchom ponownie
4. **Oczekiwane:** Ostatnia optymalizacja dostępna

---

## Metryki Sukcesu

1. **Czas wczytywania danych** < 500ms
2. **Zero utraty danych** po restarcie aplikacji
3. **Spójność danych** między modułami
4. **Brak race conditions** w logice wczytywania

---

## Notatki Implementacyjne

### Kluczowe Zasady

1. **Zawsze używaj StorageManager** - nie wywołuj Android bezpośrednio
2. **Retry mechanism** - każda operacja odczytu powinna mieć retry
3. **Fallback do sessionStorage** - zawsze miej plan B
4. **Logowanie diagnostyczne** - console.log z prefiksem `[StorageManager]`
5. **Synchronizacja** - używaj `notifyListeners()` po zapisie

### Przykład Użycia

```javascript
// Zapis optymalizacji
window.storageManager.saveOptimizedRoute(
    JSON.stringify(routeData),
    JSON.stringify(optimizationResult)
);

// Odczyt optymalizacji
const savedData = window.storageManager.loadOptimizedRoute();
if (savedData.optimizedRouteData) {
    const route = JSON.parse(savedData.optimizedRouteData);
    // użyj trasy
}

// Diagnostyka
console.log(window.storageManager.getDiagnosticInfo());
```

---

## Autorzy i Data

- **Data analizy:** 2024
- **Wersja dokumentu:** 1.0
- **Zaktualizowane pliki:** `storage_manager.js` (v2.0)