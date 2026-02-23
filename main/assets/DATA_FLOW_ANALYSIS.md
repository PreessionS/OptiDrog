# Pełna Analiza Przepływu Danych - OptiDrog

## Spis Treści
1. [Architektura Komunikacji JS ↔ Kotlin](#architektura-komunikacji-js--kotlin)
2. [WebAppInterface - Most JavaScript-Kotlin](#webappinterface---most-javascript-kotlin)
3. [Przepływ Danych - Adresy](#przepływ-danych---adresy)
4. [Przepływ Danych - Optymalizacja Tras](#przepływ-danych---optymalizacja-tras)
5. [Przepływ Danych - Nawigacja](#przepływ-danych---nawigacja)
6. [Przepływ Danych - Statusy Adresów](#przepływ-danych---statusy-adresów)
7. [Przepływ Danych - Ulubione](#przepływ-danych---ulubione)
8. [Przepływ Danych - Ustawienia](#przepływ-danych---ustawienia)
9. [Przepływ Danych - Lokalizacja](#przepływ-danych---lokalizacja)
10. [Przepływ Danych - Historia Przejazdów](#przepływ-danych---historia-przejazdów)
11. [Przepływ Danych - Premium i Reklamy](#przepływ-danych---premium-i-reklamy)
12. [Diagramy Przepływu](#diagramy-przepływu)

---

## Architektura Komunikacji JS ↔ Kotlin

### Warstwy Aplikacji

```
┌─────────────────────────────────────────────────────────────────┐
│                      WARSTWA UI (HTML/CSS/JS)                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ leaflet_map │ │   app.js    │ │table_manager│ │navigation │ │
│  │    .html    │ │             │ │    .js      │ │ _manager  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │storage_mgr  │ │favorites_mgr│ │route_storage│ │status_chk │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   WebView Bridge      │
                    │  window.Android       │
                    │  @JavascriptInterface │
                    └───────────┬───────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                    WARSTWA NATYWNA (Kotlin)                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    MainActivity.kt                           ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            ││
│  │  │WebAppInterf │ │SharedPreferences│ │OverlayService│          ││
│  │  │    ace      │ │   Manager    │ │             │            ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘            ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            ││
│  │  │AdManager    │ │BillingMgr   │ │RideHistory  │            ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘            ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │CameraActiv. │ │SecurePrefs  │ │Statistics   │                │
│  └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Kluczowe Mechanizmy Komunikacji

1. **JavaScript → Kotlin**: `window.Android.methodName(params)`
2. **Kotlin → JavaScript**: `webView.evaluateJavascript("jsCode", callback)`
3. **SharedPreferences**: Trwałe przechowywanie danych po stronie Kotlin
4. **localStorage/sessionStorage**: Przechowywanie danych po stronie JS (z fallback)

---

## WebAppInterface - Most JavaScript-Kotlin

### Metody Dostępne z JavaScript (window.Android.*)

#### ADRESY I TRASY
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `saveAddresses(json)` | JSON string | Boolean | Zapisuje listę adresów |
| `saveOptimizedRoute(routeData)` | JSON string | Boolean | Zapisuje zoptymalizowaną trasę |
| `loadOptimizedRoute()` | - | JSON string | Wczytuje zoptymalizowaną trasę |
| `clearOptimizedRoute()` | - | Boolean | Czyści dane trasy |
| `saveNavigationData(data)` | JSON string | Boolean | Zapisuje dane nawigacji |
| `loadNavigationData()` | - | JSON string | Wczytuje dane nawigacji |
| `clearNavigationData()` | - | Boolean | Czyści dane nawigacji |
| `saveCurrentRouteIndex(idx)` | Int | Boolean | Zapisuje indeks aktualnego punktu |
| `getCurrentRouteIndex()` | - | Int | Pobiera indeks aktualnego punktu |

#### STATUSY ADRESÓW
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `saveAddressStatus(key, status)` | String, String | Boolean | Zapisuje status adresu |
| `getAddressStatus(key)` | String | String | Pobiera status adresu |
| `getAllAddressStatuses()` | - | JSON string | Pobiera wszystkie statusy |
| `removeAddressStatus(key)` | String | Boolean | Usuwa status adresu |
| `clearAllAddressStatuses()` | - | Boolean | Czyści wszystkie statusy |

#### ULUBIONE
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `saveFavorites(json)` | JSON string | Boolean | Zapisuje ulubione adresy |
| `loadFavorites()` | - | JSON string | Wczytuje ulubione adresy |

#### ZAPISANE TRASY
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `saveRoute(routeData)` | JSON string | Boolean | Zapisuje trasę |
| `getSavedRoutes()` | - | JSON string | Pobiera zapisane trasy |
| `deleteRoute(routeId)` | String | Boolean | Usuwa zapisaną trasę |

#### NAWIGACJA
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `openGoogleMaps(lat, lng, addr)` | Double, Double, String | - | Otwiera Google Maps |
| `openGoogleMapsWithPackageSettings(...)` | Double, Double, String, String | - | Otwiera nawigację z ustawieniami |
| `saveNavigationApp(appName)` | String | - | Zapisuje wybraną aplikację nawigacyjną |
| `getNavigationApp()` | - | String | Pobiera wybraną aplikację |

#### LOKALIZACJA I STATUS
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `isLocationEnabled()` | - | Boolean | Sprawdza czy GPS jest włączony |
| `isInternetAvailable()` | - | Boolean | Sprawdza dostępność internetu |
| `isInternetConnected()` | - | Boolean | Sprawdza połączenie internetowe |
| `hasLocationPermission()` | - | Boolean | Sprawdza uprawnienia lokalizacji |

#### APARAT I GALLERY
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `openCamera()` | - | - | Otwiera aparat |
| `openCameraForAddressPhotos()` | - | - | Otwiera aparat dla zdjęć adresowych |
| `openGallery()` | - | - | Otwiera galerię |
| `processImageForOcr(base64)` | String | - | Przetwarza zdjęcie przez OCR |
| `checkCameraAvailability()` | - | String | Sprawdza dostępność aparatu |

#### ROZPOZNAWANIE GŁOSU
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `startSpeechRecognition()` | - | - | Rozpoczyna rozpoznawanie |
| `checkSpeechRecognitionAvailability()` | - | String | Sprawdza dostępność |
| `getSpeechRecognitionDiagnostics()` | - | String | Diagnostyka problemów |
| `requestMicrophonePermission()` | - | - | Żąda uprawnień mikrofonu |

#### REKLAMY I PREMIUM
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `showAdAfterOptimize()` | - | - | Wyświetla reklamę po optymalizacji |
| `showAdAfterReoptimize()` | - | - | Wyświetla reklamę po reoptymalizacji |
| `showAdAfterStartNavigation()` | - | - | Wyświetla reklamę przed nawigacją |
| `isAdReady()` | - | Boolean | Czy reklama jest gotowa |
| `getTimeUntilNextAd()` | - | Long | Czas do następnej reklamy |
| `startPremiumPurchase(productId)` | String | Boolean | Rozpoczyna zakup premium |
| `getPremiumStatus()` | - | JSON string | Pobiera status premium |
| `restorePremium()` | - | Boolean | Przywraca zakup premium |
| `manageSubscription()` | - | Boolean | Otwiera zarządzanie subskrypcją |

#### HISTORIA PRZEJAZDÓW
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `isRideHistoryEnabled()` | - | Boolean | Czy historia jest włączona |
| `setRideHistoryEnabled(enabled)` | Boolean | - | Włącza/wyłącza historię |
| `rhStartRide(payloadJson)` | JSON string | String | Rozpoczyna przejazd |
| `rhCloseCurrentRide()` | - | Boolean | Zamyka bieżący przejazd |
| `rhGetRidesLast30Days()` | - | JSON string | Pobiera przejazdy z 30 dni |
| `rhGetRide(rideId)` | String | JSON string | Pobiera szczegóły przejazdu |
| `rhDeleteRide(rideId)` | String | Boolean | Usuwa przejazd |
| `rhRecordPointAction(id, action)` | String, String | Boolean | Zapisuje akcję punktu |
| `rhRemovePointAction(id)` | String | Boolean | Usuwa akcję punktu |

#### USTAWIENIA I INNE
| Metoda | Parametry | Zwraca | Opis |
|--------|-----------|--------|------|
| `saveAppTheme(theme)` | String | - | Zapisuje motyw aplikacji |
| `getAppTheme()` | - | String | Pobiera motyw |
| `setEarlyAccessNoticeClosed()` | - | - | Zapisuje zamknięcie powiadomienia |
| `isEarlyAccessNoticeClosed()` | - | Boolean | Czy powiadomienie zamknięte |
| `shareText(text, title)` | String, String | - | Udostępnia tekst |
| `shareFile(content, fileName)` | String, String | - | Udostępnia plik |
| `saveReportCsv(content, name)` | String, String | - | Zapisuje raport CSV |
| `openExternalUrl(url)` | String | - | Otwiera URL w przeglądarce |
| `openDiscordInvite()` | - | - | Otwiera zaproszenie Discord |
| `openPlayStoreForRating()` | - | - | Otwiera Play Store |

---

## Przepływ Danych - Adresy

### Inicjalizacja i Wczytywanie Adresów

```
┌────────────────────────────────────────────────────────────────────┐
│                     STARTEUP APPLIKACJI                            │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ MainActivity.onCreate()                                            │
│   ├── Wczytanie z SharedPreferences                                │
│   │   SHARED_PREFS_NAME = "OptiDrogPrefs"                          │
│   │   ADDRESSES_KEY = "saved_addresses"                            │
│   └── webView.loadUrl("file:///android_asset/leaflet_map.html")   │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebViewClient.onPageFinished()                                     │
│   ├── loadSavedAddresses() // po 500ms                             │
│   ├── loadCachedLocationForNavigation() // po 500ms                │
│   ├── loadOptimizedRoute() // po 1000ms                            │
│   └── pushPremiumStatusToWeb(currentPremiumStatus)                 │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ loadSavedAddresses()                                               │
│   ├── val addressesJson = sharedPreferences.getString(...)         │
│   └── webView.evaluateJavascript(                                  │
│         "window.optiDrogApp.tableManager.loadSavedAddresses(...)") │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ TableManager.loadSavedAddresses(json) [JavaScript]                 │
│   ├── JSON.parse(json)                                             │
│   ├── Dla każdego adresu:                                          │
│   │   ├── this.addresses.push(addr)                                │
│   │   ├── this.addressSet.add(key)                                 │
│   │   ├── this.updateSelectOptions(...)                            │
│   │   └── this.mapManager.addMarker(...)                           │
│   └── this.loadAddressStatuses() // jeśli trasa zoptymalizowana   │
└────────────────────────────────────────────────────────────────────┘
```

### Zapisywanie Adresów

```
┌────────────────────────────────────────────────────────────────────┐
│ TableManager.addAddressToTable(address, lat, lng, ...)            │
│   ├── this.addresses.push({...})                                   │
│   ├── this.addressSet.add(key)                                     │
│   ├── Dodanie wiersza do tabeli HTML                               │
│   ├── Dodanie znacznika na mapie                                   │
│   └── this.saveAddresses()                                         │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ TableManager.saveAddresses()                                       │
│   ├── const addressesJson = JSON.stringify(this.addresses)         │
│   └── Android.saveAddresses(addressesJson)                         │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.saveAddresses(json) [Kotlin]                       │
│   ├── val jsonArray = JSONArray(json)                              │
│   ├── sharedPreferences.edit().putString("saved_addresses", json)  │
│   └── editor.apply()                                               │
└────────────────────────────────────────────────────────────────────┘
```

### Struktura Danych Adresu

```javascript
// JavaScript (TableManager)
{
    address: "ul. Przykładowa 1, Miasto",
    lat: 52.229676,
    lng: 21.012229,
    id: "ul. Przykładowa 1, Miasto_52.229676_21.012229", // addressKey
    returnOnBack: false,
    timeFrom: "08:00",
    timeTo: "16:00",
    packageSettings: { /* ustawienia paczki */ },
    deliveryType: "delivery" | "pickup" | "",
    firstOnRoute: false,
    favoriteName: "",
    status: "BRAK" | "Odwiedzony" | "Pominięty"
}
```

---

## Przepływ Danych - Optymalizacja Tras

### Proces Optymalizacji

```
┌────────────────────────────────────────────────────────────────────┐
│ NavigationManager.optimizeRoute() [JavaScript]                     │
│   ├── Pobranie adresów z TableManager                              │
│   ├── Pobranie punktów startowego/końcowego                        │
│   ├── Wywołanie showAdAfterOptimize() (opcjonalnie)                │
│   └── Wysłanie żądania do API (optidrog.pl)                        │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ API optidrog.pl                                                    │
│   ├── Obliczenie optymalnej kolejności                             │
│   └── Zwrócenie: { optimizedOrder, durations, distances, ... }    │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ NavigationManager.handleOptimizationResult() [JavaScript]          │
│   ├── this.optimizedRouteData = result.route                       │
│   ├── this.optimizationResult = result                             │
│   ├── this.displayRouteInfo(...)                                   │
│   ├── this.tableManager.updateTable(...)                           │
│   ├── this.tableManager.calculateAndDisplayArrivalTimes(...)       │
│   └── window.storageManager.saveOptimizedRoute(...)                │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ StorageManager.saveOptimizedRoute(routeData, optimizationResult)  │
│   ├── Android.saveOptimizedRoute(JSON.stringify(data))             │
│   └── sessionStorage.setItem('optimizedRouteData', ...) // fallback│
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.saveOptimizedRoute(json) [Kotlin]                  │
│   ├── sharedPref = getSharedPreferences("OptiDrogOptimizedRoute")  │
│   ├── putString("optimized_route_data", json)                      │
│   ├── putLong("optimized_route_timestamp", System.currentTimeMillis())│
│   └── apply()                                                      │
└────────────────────────────────────────────────────────────────────┘
```

### Wczytywanie Zapisanej Optymalizacji

```
┌────────────────────────────────────────────────────────────────────┐
│                     STARTEUP APPLIKACJI                            │
│ MainActivity.onPageFinished() → loadOptimizedRoute() // po 1000ms │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.loadOptimizedRoute() [Kotlin]                      │
│   ├── Sprawdzenie wieku danych (max 7 dni)                         │
│   └── return sharedPref.getString("optimized_route_data", "null") │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ StorageManager.loadOptimizedRoute() [JavaScript]                   │
│   ├── const data = Android.loadOptimizedRoute()                    │
│   └── return { optimizedRouteData, optimizationResult }            │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ OptiDrogApp.loadSavedRoute() / NavigationManager.loadOptim...()   │
│   ├── Przywrócenie trasy do this.optimizedRouteData                │
│   ├── this.tableManager.updateTable(routeData)                     │
│   ├── this.mapManager.drawRoute(routeData)                         │
│   └── this.displayRouteInfo(result)                                │
└────────────────────────────────────────────────────────────────────┘
```

---

## Przepływ Danych - Nawigacja

### Rozpoczęcie Nawigacji

```
┌────────────────────────────────────────────────────────────────────┐
│ NavigationManager.startNavigation() [JavaScript]                   │
│   ├── Pobranie aktualnego indeksu trasy                            │
│   ├── Pobranie aktualnego punktu                                   │
│   ├── showAdAfterStartNavigation() (reklama)                       │
│   └── Android.openGoogleMapsWithPackageSettings(lat, lng, addr, settings)│
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.openGoogleMapsWithPackageSettings() [Kotlin]       │
│   ├── Sprawdzenie uprawnień SYSTEM_ALERT_WINDOW                    │
│   ├── Uruchomienie OverlayService z danymi adresu                  │
│   │   overlayIntent.putExtra("address", address)                   │
│   │   overlayIntent.putExtra("latitude", lat)                      │
│   │   overlayIntent.putExtra("longitude", lng)                     │
│   │   overlayIntent.putExtra("packageSettings", settings)          │
│   └── startNavigation(lat, lng) // uruchomienie wybranej aplikacji│
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ OverlayService [Kotlin]                                            │
│   ├── Wyświetlenie pływającego okna z adresem                      │
│   ├── Przyciski: "Dalej" → ACTION_OVERLAY_NEXT                     │
│   └── Przyciski: "OK" → ACTION_OVERLAY_DONE                        │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ MainActivity.BroadcastReceiver [Kotlin]                            │
│   ├── ACTION_OVERLAY_NEXT:                                         │
│   │   ├── Zapisz status "Pominięty"                                │
│   │   ├── Android.saveAddressStatus(key, "Pominięty")              │
│   │   ├── rideHistory.recordPointAction(key, "skipped")            │
│   │   ├── webView.evaluateJavascript("...updateAddressStatus()")   │
│   │   └── Uruchom nawigację do następnego punktu                   │
│   └── ACTION_OVERLAY_DONE:                                         │
│       ├── Zapisz status "Odwiedzony"                               │
│       ├── Android.saveAddressStatus(key, "Odwiedzony")             │
│       ├── rideHistory.recordPointAction(key, "delivered")          │
│       └── webView.evaluateJavascript("...updateAddressStatus()")   │
└────────────────────────────────────────────────────────────────────┘
```

### Aktualizacja Pozycji GPS

```
┌────────────────────────────────────────────────────────────────────┐
│ FusedLocationProviderClient [Kotlin]                               │
│   ├── locationCallback → onLocationResult()                        │
│   └── saveCachedLocation(lat, lng) // cache 5 minut               │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ updateNavigationWithLocation(lat, lng, source)                     │
│   └── webView.evaluateJavascript(`                                 │
│         if (window.optiDrogApp && window.optiDrogApp.getMapManager)│
│           mapManager.currentLat = lat;                             │
│           mapManager.currentLng = lng;                             │
│         if (typeof window.updateCurrentLocation === 'function')    │
│           window.updateCurrentLocation(lat, lng);                  │
│         localStorage.setItem('cachedLat', lat);                    │
│         localStorage.setItem('cachedLng', lng);                    │
│       `)                                                            │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ MapManager [JavaScript]                                            │
│   ├── Aktualizacja pozycji markera                                 │
│   └── Aktualizacja pozycji w localStorage                          │
└────────────────────────────────────────────────────────────────────┘
```

---

## Przepływ Danych - Statusy Adresów

### Zapisywanie Statusu

```
┌────────────────────────────────────────────────────────────────────┐
│ UI: Kliknięcie w status adresu                                     │
│   └── window.toggleAddressStatus(addressKey)                       │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ TableManager.updateAddressStatus(key, status) [JavaScript]         │
│   ├── Aktualizacja UI (status element)                             │
│   ├── this.addresses.find(addr => addr.id === key).status = status │
│   ├── Android.saveAddressStatus(key, status)                       │
│   ├── Android.rhRecordPointAction(key, actionType) // historia     │
│   └── this.mapManager.updateMarkerStatus(key, status)              │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.saveAddressStatus(key, status) [Kotlin]            │
│   ├── sharedPrefs = getSharedPreferences("OptiDrogData")           │
│   ├── statuses = JSONObject(currentStatusesJson)                   │
│   ├── statuses.put(key, status)                                    │
│   ├── editor.putString("address_statuses", statuses.toString())    │
│   └── editor.apply()                                               │
└────────────────────────────────────────────────────────────────────┘
```

### Wczytywanie Statusów

```
┌────────────────────────────────────────────────────────────────────┐
│                     STARTEUP / PO OPTIMALIZACJI                    │
│ TableManager.loadAddressStatuses()                                 │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ Android.getAllAddressStatuses() [Kotlin → JavaScript]              │
│   ├── sharedPrefs.getString("address_statuses", "{}")              │
│   └── return JSON string: { "addressKey": "status", ... }          │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ TableManager.loadAddressStatuses() [JavaScript]                    │
│   ├── const statuses = JSON.parse(Android.getAllAddressStatuses()) │
│   └── Dla każdego adresu: updateAddressStatus(key, status)         │
└────────────────────────────────────────────────────────────────────┘
```

---

## Przepływ Danych - Ulubione

### Zapisywanie Ulubionych

```
┌────────────────────────────────────────────────────────────────────┐
│ UI: Kliknięcie gwiazdki przy adresie                               │
│   └── favoritesManager.toggleFavorite({id, address, lat, lng, ...})│
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ FavoritesManager.saveFavorites() [JavaScript]                      │
│   ├── const json = JSON.stringify(this.favorites)                  │
│   ├── Android.saveFavorites(json) // preferowane                   │
│   └── localStorage.setItem('optiDrogFavorites', json) // backup   │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.saveFavorites(json) [Kotlin]                       │
│   ├── prefs = getSharedPreferences("OptiDrogData", MODE_PRIVATE)  │
│   ├── editor.putString("favorites", json)                          │
│   └── editor.apply()                                               │
└────────────────────────────────────────────────────────────────────┘
```

### Wczytywanie Ulubionych

```
┌────────────────────────────────────────────────────────────────────┐
│ FavoritesManager.constructor() [JavaScript]                        │
│   └── this.favorites = this.loadFavorites()                        │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ FavoritesManager.loadFavorites()                                   │
│   ├── if (Android && Android.loadFavorites)                        │
│   │     const json = Android.loadFavorites()                       │
│   │     return JSON.parse(json)                                    │
│   └── else: localStorage.getItem('optiDrogFavorites')              │
└────────────────────────────────────────────────────────────────────┘
```

### Struktura Danych Ulubionych

```javascript
// JavaScript (FavoritesManager)
{
    id: "ul. Przykładowa 1, Miasto_52.229676_21.012229", // addressKey
    address: "ul. Przykładowa 1, Miasto",
    lat: 52.229676,
    lng: 21.012229,
    timeFrom: "08:00",      // opcjonalne
    timeTo: "16:00",        // opcjonalne
    deliveryType: "delivery" | "pickup" | "",
    firstOnRoute: false,
    name: "Magazyn główny"  // opcjonalna nazwa użytkownika
}
```

---

## Przepływ Danych - Ustawienia

### Zapisane Ustawienia

```
┌────────────────────────────────────────────────────────────────────┐
│ SharedPreferences: "OptiDrogSettings"                              │
│   ├── navigationApp: "google-maps" | "waze" | "automapa" | ...    │
│   ├── appTheme: "light" | "dark" | "system"                       │
│   └── ride_history_enabled: true | false                          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ SharedPreferences: "OptiDrogPrefs"                                 │
│   ├── earlyAccessNoticeClosed: boolean                            │
│   ├── cached_location: { latitude, longitude }                    │
│   ├── location_timestamp: long                                     │
│   └── saved_addresses: JSON string                                 │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ SharedPreferences: "OptiDrogOptimizedRoute"                        │
│   ├── optimized_route_data: JSON string                            │
│   ├── optimized_route_timestamp: long                              │
│   ├── navigation_data: JSON string                                 │
│   ├── navigation_timestamp: long                                   │
│   └── current_route_index: int                                     │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ SharedPreferences: "OptiDrogRoutes"                                │
│   └── saved_routes: JSON string (array of route objects)           │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ SharedPreferences: "OptiDrogData"                                  │
│   ├── favorites: JSON string                                       │
│   └── address_statuses: JSON string                                │
└────────────────────────────────────────────────────────────────────┘
```

---

## Przepływ Danych - Lokalizacja

### Cykl Życia Lokalizacji

```
┌────────────────────────────────────────────────────────────────────┐
│                     INICJALIZACJA                                  │
│ MainActivity.onCreate()                                            │
│   ├── checkLocationPermission()                                    │
│   ├── fusedLocationClient = LocationServices.getFusedLocation...() │
│   └── requestLocationUpdates()                                     │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                     POBRANIE POZYCJI                               │
│ requestLocationUpdates()                                           │
│   ├── loadCachedLocation() → natychmiast jeśli cache ważny        │
│   │   └── updateNavigationWithLocation(cached, "cache")            │
│   ├── fusedLocationClient.lastLocation                             │
│   │   └── saveCachedLocation(lat, lng)                             │
│   ├── LocationRequest.Builder(PRIORITY_HIGH_ACCURACY, 1000ms)     │
│   └── locationCallback.onLocationResult()                          │
│       ├── saveCachedLocation(lat, lng)                             │
│       └── webView.evaluateJavascript("updateMarkerWithoutCentering")│
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                     CACHE POZYCJI (5 minut)                        │
│ SharedPreferences: "OptiDrogPrefs"                                 │
│   ├── cached_location: { "latitude": 52.229, "longitude": 21.012 }│
│   └── location_timestamp: 1234567890                               │
└────────────────────────────────────────────────────────────────────┘
```

---

## Przepływ Danych - Historia Przejazdów

### Rozpoczęcie Przejazdu

```
┌────────────────────────────────────────────────────────────────────┐
│ NavigationManager.optimizeRoute() → rhStartRide()                  │
│   ├── Android.isRideHistoryEnabled()                               │
│   └── if enabled: Android.rhStartRide(payloadJson)                 │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.rhStartRide(payloadJson) [Kotlin]                  │
│   ├── val store = RideHistoryStore.getInstance(activity)           │
│   └── store.startRide(pointsSnapshot, optimizeClickedTs)           │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ RideHistoryStore [Kotlin]                                          │
│   ├── Utworzenie nowego przejazdu w bazie SQLite                   │
│   ├── Zapisanie snapshot punktów                                   │
│   └── return rideId                                                │
└────────────────────────────────────────────────────────────────────┘
```

### Zapisywanie Akcji Punktu

```
┌────────────────────────────────────────────────────────────────────┐
│ UI: Kliknięcie "Dalej" lub "OK" w overlay                          │
│   └── ACTION_OVERLAY_NEXT / ACTION_OVERLAY_DONE                    │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ MainActivity.BroadcastReceiver                                     │
│   └── store.recordPointAction(pointId, "delivered" | "skipped")    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Przepływ Danych - Premium i Reklamy

### Status Premium

```
┌────────────────────────────────────────────────────────────────────┐
│ JavaScript: window.premium.onStatusChanged(statusJson)             │
│   └── Przekazane z Kotlin przez evaluateJavascript                 │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ Kotlin: pushPremiumStatusToWeb(status)                             │
│   ├── premiumStatusToJson(status)                                  │
│   │   └── { isActive, productId, displayName, autoRenewing, ... } │
│   └── webView.evaluateJavascript("window.premium.onStatusChanged")│
└────────────────────────────────────────────────────────────────────┘
```

### Zakup Premium

```
┌────────────────────────────────────────────────────────────────────┐
│ JavaScript: Android.startPremiumPurchase(productId)                │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.startPremiumPurchase(productId)                    │
│   └── activity.startPremiumPurchaseFlow(productId)                 │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ BillingManager.launchPremiumPurchase(productId)                    │
│   ├── Połączenie z Google Play Billing                             │
│   └── Wynik → BillingManager.Listener.onPremiumStatusChanged()     │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ pushPremiumStatusToWeb(status) → JavaScript                        │
│   └── window.premium.onStatusChanged(statusJson)                   │
└────────────────────────────────────────────────────────────────────┘
```

### Wyświetlanie Reklam

```
┌────────────────────────────────────────────────────────────────────┐
│ JavaScript: Android.showAdAfterOptimize()                          │
│   └── Wywołane PRZED optymalizacją                                 │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ WebAppInterface.showAdAfterOptimize()                              │
│   ├── activity.isOptimizationAd = true                             │
│   ├── adManager.showAd()                                           │
│   └── if (!adShown):                                               │
│         webView.evaluateJavascript(                                │
│           "navigationManager.onAdClosedForOptimize(false)")        │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ AdManager.onAdDismissedCallback                                    │
│   └── webView.evaluateJavascript("navigationManager.onAdClosed...")│
└────────────────────────────────────────────────────────────────────┘
```

---

## Diagramy Przepływu

### Kompletny Cykl Życia Adresu

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐
│  Dodanie │───▶│  Zapis do    │───▶│ SharedPreferences │───▶│ Tabela HTML │
│  adresu  │    │ Androida     │    │   (Kotlin)  │    │             │
└──────────┘    └──────────────┘    └─────────────┘    └─────────────┘
     │                                                        │
     │                                                        ▼
     │              ┌──────────────┐    ┌─────────────┐    ┌─────────────┐
     └─────────────▶│ Optymalizacja│───▶│ StorageMgr  │───▶│ Android     │
                    │   trasy      │    │   (JS)      │    │ saveOptimized│
                    └──────────────┘    └─────────────┘    │   Route()   │
                                        │                  └─────────────┘
                                        │                         │
                                        ▼                         ▼
                                   ┌─────────────┐    ┌─────────────────┐
                                   │ sessionStorage│   │ SharedPreferences│
                                   │  (fallback) │    │ OptiDrogOptimized│
                                   └─────────────┘    │    Route       │
                                                      └─────────────────┘
```

### Komunikacja Przy Nawigacji

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ JavaScript   │         │   Kotlin     │         │   System     │
│ (WebView)    │         │ (MainActivity)│        │ (Overlay)    │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │ startNavigation()      │                        │
       │───────────────────────▶│                        │
       │                        │                        │
       │                        │ startService(Overlay)  │
       │                        │───────────────────────▶│
       │                        │                        │
       │                        │ startNavigationApp()   │
       │                        │───────────────────────▶│
       │                        │                        │
       │                        │     [Użytkownik klika]│
       │                        │                        │
       │                        │◀─────── broadcast ─────│
       │                        │   ACTION_OVERLAY_DONE  │
       │                        │                        │
       │◀─────── evaluateJs ────│                        │
       │  updateAddressStatus() │                        │
       │                        │                        │
       │                        │ saveAddressStatus()    │
       │                        │───────────────────────▶│
       │                        │    SharedPreferences   │
       │                        │                        │
       │                        │ rhRecordPointAction()  │
       │                        │───────────────────────▶│
       │                        │      RideHistoryStore  │
       │                        │                        │
```

---

## Kluczowe Pliki i Ich Odpowiedzialności

### JavaScript (assets/)

| Plik | Odpowiedzialność |
|------|------------------|
| `app.js` | Inicjalizacja aplikacji, Orchestrator modułów |
| `table_manager.js` | Zarządzanie tabelą adresów, Statusy adresów |
| `navigation_manager.js` | Optymalizacja tras, Nawigacja |
| `map_init.js` | Inicjalizacja mapy Leaflet |
| `js/storage_manager.js` | Trwałe przechowywanie danych (bridge do Android) |
| `js/favorites_manager.js` | Zarządzanie ulubionymi adresami |
| `route_storage.js` | Zapisywanie/wczytywanie tras |
| `ride_history.js` | Interfejs historii przejazdów |
| `address_search.js` | Wyszukiwanie adresów (API Nominatim) |
| `address_settings_modal.js` | Modal ustawień adresu |
| `components.js` | Komponenty UI |
| `status_checker.js` | Sprawdzanie statusu GPS/Internet |

### Kotlin (java/pl/optidrog/app/)

| Plik | Odpowiedzialność |
|------|------------------|
| `MainActivity.kt` | Główna aktywność, WebAppInterface |
| `OverlayService.kt` | Pływające okno podczas nawigacji |
| `CameraActivity.kt` | Aparat z OCR |
| `AdManager.kt` | Zarządzanie reklamami AdMob |
| `AppRatingManager.kt` | System oceny aplikacji |
| `billing/BillingManager.kt` | Zakupy w aplikacji |
| `billing/PremiumRepository.kt` | Status premium |
| `history/RideHistoryStore.kt` | Baza danych historii |
| `statistics/StatisticsWorker.kt` | Statystyki użytkowania |
| `security/SecurePreferencesManager.kt` | Bezpieczne przechowywanie |

---

## Podsumowanie

Aplikacja OptiDrog wykorzystuje hybrydową architekturę WebView z rozbudowaną komunikacją dwukierunkową między JavaScript a Kotlin. Kluczowe aspekty:

1. **WebAppInterface** - główny most komunikacyjny z ponad 70 metodami
2. **StorageManager** - warstwa abstrakcji nad SharedPreferences
3. **Szereg mechanizmów cache'owania** - localStorage, sessionStorage, SharedPreferences
4. **Synchronizacja stanu** - aktualizacja UI po obu stronach przy zmianach
5. **Obsługa offline** - cache lokalizacji, zapisane trasy, ulubione
6. **Historia przejazdów** - SQLite database zarządzana przez RideHistoryStore