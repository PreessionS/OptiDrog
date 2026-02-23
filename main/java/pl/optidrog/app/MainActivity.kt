package pl.optidrog.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.Priority
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
// Usunięto Toast (zgodnie z wymaganiem)
// Poprawka: import Uri był przypadkowo "schowany" w komentarzu przez sekwencję \n, co powodowało Unresolved reference 'Uri'
import android.net.Uri
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AlertDialog
import org.json.JSONArray
import org.json.JSONObject
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
// import android.net.NetworkInfo - usunięte, używamy NetworkCapabilities dla nowszych wersji Android
import android.os.PowerManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

// Google AdMob imports
import com.google.android.gms.ads.MobileAds

// SecurePreferencesManager - nowoczesne API do bezpiecznego przechowywania danych
import pl.optidrog.app.security.SecurePreferencesManager

// Rozpoznawanie mowy imports - standardowe Android API
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

// Edge-to-edge imports - dla obsługi wyświetlania bez ramki w Android 15+
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.WindowCompat
// Import dla enableEdgeToEdge (Android 15+)
import androidx.activity.enableEdgeToEdge
import android.content.ActivityNotFoundException
import android.view.View
import android.provider.MediaStore
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.InputStream
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

// Import dla systemu oceny aplikacji
import pl.optidrog.app.AppRatingManager
import pl.optidrog.app.billing.BillingManager
import pl.optidrog.app.billing.PremiumRepository
import pl.optidrog.app.billing.PremiumStatus
import pl.optidrog.app.statistics.StatisticsWorker

// ML Kit OCR
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class MainActivity : AppCompatActivity() {
// Companion object z nazwami akcji broadcastów oraz stałym TAG do logów edge-to-edge
    companion object {
        // Stałe akcji broadcastów z prefiksem pakietu dla bezpieczeństwa (uniknięcie kolizji z innymi aplikacjami)
        private const val ACTION_OVERLAY_NEXT = "pl.optidrog.app.ACTION_OVERLAY_NEXT"
        private const val ACTION_OVERLAY_DONE = "pl.optidrog.app.ACTION_OVERLAY_DONE"
        private const val ACTION_ALL_ADDRESSES_COMPLETED = "pl.optidrog.app.ACTION_ALL_ADDRESSES_COMPLETED"
        // Stały TAG dla spójnego logowania edge-to-edge (eliminuje ostrzeżenia lint o niespójnych tagach)
        private const val TAG_EDGE = "EdgeToEdge"
    }

    private lateinit var webView: WebView
    private lateinit var locationManager: LocationManager
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var locationCallback: LocationCallback? = null
    private var backgroundLocationCallback: LocationCallback? = null
    private val LOCATION_PERMISSION_REQUEST_CODE = 1
    // ActivityResultLauncher dla uprawnień nakładki
    private lateinit var overlayPermissionLauncher: ActivityResultLauncher<Intent>
    
    // ActivityResultLauncher dla aparatu
    private lateinit var cameraActivityResultLauncher: ActivityResultLauncher<Intent>
    
    // Photo Picker Launcher dla wyboru zdjęć z galerii (bez uprawnień)
    private lateinit var photoPickerLauncher: ActivityResultLauncher<PickVisualMediaRequest>
    private val SHARED_PREFS_NAME = "OptiDrogPrefs" // Zmień na public
    private val ADDRESSES_KEY = "saved_addresses"   // Zmień na public
    private val LOCATION_KEY = "cached_location"     // Klucz dla zapisanej pozycji
    private val LOCATION_TIMESTAMP_KEY = "location_timestamp" // Klucz dla czasu zapisania pozycji
    
    // WindowInsets caching dla optymalizacji wydajności
    private var cachedInsets: androidx.core.graphics.Insets? = null
    private var lastInsetsTimestamp = 0L
    private val INSETS_CACHE_DURATION = 100L // 100ms cache duration

    // Klucze dla statusów adresów
    private val ADDRESS_STATUSES_KEY = "address_statuses"

    // Nowe klucze dla trwałego magazynu danych
    private val OPTIMIZED_ROUTE_DATA_KEY = "optimized_route_data"
    private val OPTIMIZATION_RESULT_KEY = "optimization_result"
    private val CURRENT_ROUTE_INDEX_KEY = "current_route_index"
    private val LOAD_ROUTE_ID_KEY = "load_route_id"
    private val LOAD_ROUTE_TIMESTAMP_KEY = "load_route_timestamp"
    private val EARLY_ACCESS_NOTICE_CLOSED_KEY = "early_access_notice_closed"

    // AdMob - zarządzanie reklamami
    private lateinit var adManager: AdManager
    private lateinit var billingManager: BillingManager
    private lateinit var premiumRepository: PremiumRepository
    private var currentPremiumStatus: PremiumStatus = PremiumStatus.INACTIVE
    private val LOCATION_CACHE_DURATION = 5 * 60 * 1000L // 5 minut w milisekundach
    private var isNavigationAd = false // Flaga określająca, czy wyświetlana reklama to reklama nawigacji
    private var isOptimizationAd = false // Flaga dla reklamy przed optymalizacją
    private var isReoptimizationAd = false // Flaga dla reklamy przed reoptymalizacją (przycisk "Reoptymalizuj")
    // Usunięto nieużywane klucze dla sprawdzania sesji - sprawdzenie statusu wykonuje się przy każdym uruchomieniu

    // Dodaj receiver jako pole klasy
    private var overlayActionReceiver: BroadcastReceiver? = null

    // SharedPreferences dla różnych danych aplikacji
    private val OPTIDROG_DATA_PREFS = "OptiDrogData"
    private val OPTIDROG_OPTIMIZED_ROUTE_PREFS = "OptiDrogOptimizedRoute"
    private val OPTIDROG_ROUTES_PREFS = "OptiDrogRoutes"
    private val OPTIDROG_SETTINGS_PREFS = "OptiDrogSettings"

    // WakeLock do zapobiegania blokowaniu ekranu
    private var wakeLock: PowerManager.WakeLock? = null

    // Rozpoznawanie mowy - zmienne
    private var speechRecognizer: SpeechRecognizer? = null
    private val SPEECH_REQUEST_CODE = 100
    private val AUDIO_PERMISSION_REQUEST_CODE = 2
    private val CAMERA_PERMISSION_REQUEST_CODE = 3
    private val STORAGE_PERMISSION_REQUEST_CODE = 4
    private val CAMERA_REQUEST_CODE = 5

    // Flaga zapobiegająca wielokrotnemu wyświetleniu dialogu nakładki podczas pierwszego uruchomienia
    private var overlayDialogShown = false

    // Zmienne do obsługi zapisu CSV przez SAF (Storage Access Framework)
    var pendingCsvContent: String? = null
    lateinit var createCsvLauncher: ActivityResultLauncher<String>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Inicjalizacja systemu oceny aplikacji - tylko zwiększ licznik
        // Wyświetlanie dialogu zostanie wywołane w onResume gdy Activity będzie gotowa
        AppRatingManager.getInstance(this).incrementLaunchCount()
        // IMPLEMENTACJA EDGE-TO-EDGE - ZGODNIE Z WYMAGANIAMI ANDROID 15 (API 35+)
        // enableEdgeToEdge() jest zalecanym sposobem obsługi wyświetlania bez ramki.
        // Od Androida 15 edge-to-edge jest wymuszone dla aplikacji targetujących SDK 35.
        try {
            enableEdgeToEdge()
            Log.d(TAG_EDGE, "Edge-to-edge enabled using enableEdgeToEdge()")
        } catch (e: Exception) {
            Log.e(TAG_EDGE, "Failed to enable edge-to-edge: ${e.message}")
            // Na wypadek błędu w starszych wersjach systemowych
            @Suppress("DEPRECATION")
            WindowCompat.setDecorFitsSystemWindows(window, false)
        }
        
        // Ustawienie widoku aktywności na podstawie pliku activity_main.xml
        setContentView(R.layout.activity_main)

        // KONFIGURACJA OKNA - PRZEZROCZYSTE PASKI SYSTEMOWE
        WindowInsetsControllerCompat(window, window.decorView).apply {
            // Ustaw przezroczyste paski systemowe
            isAppearanceLightStatusBars = false // Ciemny tekst na pasku statusu
            isAppearanceLightNavigationBars = false // Ciemny tekst na pasku nawigacji
        }
        Log.d(TAG_EDGE, "Transparent system bars configured with WindowInsetsController")
        
        // OBSŁUGA WINDOW INSETS Z OPTYMALIZACJĄ I LEPSZĄ OBSŁUGĄ CUTOUTS
        setupWindowInsetsListener()

        // Dodatkowe ustawienia okna - zapobiega wygaszaniu ekranu
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Inicjalizacja ActivityResultLauncher dla uprawnień nakładki
        overlayPermissionLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            // Obsługa wyniku żądania uprawnień nakładki
            if (!Settings.canDrawOverlays(this)) {
                // Jeśli uprawnienia nadal nie zostały przyznane, wyświetl komunikat
                // Usunięto Toast (zgodnie z wymaganiem)
            } else {
                // Usunięto Toast (zgodnie z wymaganiem)
            }
        }
        
        // Inicjalizacja launcher'a dla zapisu pliku CSV (SAF)
        createCsvLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
            uri?.let {
                pendingCsvContent?.let { content ->
                    try {
                        contentResolver.openOutputStream(it)?.use { outputStream ->
                            outputStream.write(content.toByteArray(Charsets.UTF_8))
                        }
                        Log.d("MainActivity", "Zapisano raport CSV pomyślnie do: $it")
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Błąd podczas zapisu raportu CSV: ${e.message}")
                    } finally {
                        pendingCsvContent = null
                    }
                }
            }
        }

        // Inicjalizacja ActivityResultLauncher dla aparatu
        cameraActivityResultLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            if (result.resultCode == RESULT_OK) {
                // Rozróżnij dwa możliwe tryby zwrotu danych z CameraActivity:
                // 1. camera_image_base64 -> tryb analizy AI
                // 2. camera_photo_base64 -> tryb dodawania zdjęć do adresu
                val base64ImageAi = result.data?.getStringExtra("camera_image_base64")
                val base64AddressPhoto = result.data?.getStringExtra("camera_photo_base64")
                val ocrResults = result.data?.getStringArrayListExtra("ocr_results")

                if (!base64AddressPhoto.isNullOrEmpty()) {
                    // Tryb zdjęcia adresowego
                    Log.d("MainActivity", "Odebrano zdjęcie adresu (length=${base64AddressPhoto.length}), przekazywanie do PhotosModal")
                    // Przekaż do JS jeśli istnieje handler handleAddressPhoto
                    webView.evaluateJavascript(
                        "if (window.handleAddressPhoto) { " +
                                "  window.handleAddressPhoto('${base64AddressPhoto}');" +
                                "} else { console.error('Funkcja handleAddressPhoto nie jest zdefiniowana'); }",
                        null
                    )
                } else if (!ocrResults.isNullOrEmpty()) {
                    // NOWOŚĆ: Tryb OCR (zamiast AI)
                    Log.d("MainActivity", "Odebrano wyniki OCR: ${ocrResults.size} linii")
                    val jsonArray = JSONArray(ocrResults)
                    val escapedJson = jsonArray.toString()
                        .replace("\\", "\\\\")
                        .replace("'", "\\'")
                    
                    webView.evaluateJavascript(
                        "if (window.handleOcrResults) { " +
                                "  window.handleOcrResults($escapedJson);" +
                                "} else if (window.handleCameraPhoto) { " +
                                "  console.log('handleOcrResults nie istnieje, fallback do handleCameraPhoto');" +
                                "  window.handleCameraPhoto('${base64ImageAi ?: ""}');" +
                                "} else { " +
                                "  console.error('Brak handlerów dla wyników OCR');" +
                                "}", null
                    )
                } else if (!base64ImageAi.isNullOrEmpty()) {
                    // Tryb analizy AI (legacy / fallback)
                    Log.d("MainActivity", "Odebrano zdjęcie z aparatu do analizy AI (length=${base64ImageAi.length})")
                    webView.evaluateJavascript(
                        "if (window.handleCameraPhoto) { " +
                                "  window.handleCameraPhoto('${base64ImageAi}');" +
                                "} else { " +
                                "  console.error('Funkcja handleCameraPhoto nie jest zdefiniowana');" +
                                "}", null
                    )
                } else {
                    // Brak poprawnych danych
                    Log.e("MainActivity", "Błąd: Brak danych zdjęcia lub wyników OCR w rezultacie CameraActivity")
                }
            }
        }
        
        // Inicjalizacja Photo Picker Launcher (nie wymaga uprawnień READ_MEDIA_IMAGES)
        photoPickerLauncher = registerForActivityResult(
            ActivityResultContracts.PickVisualMedia()
        ) { uri ->
            uri?.let {
                try {
                    Log.d("MainActivity", "Odebrano zdjęcie z Photo Picker, konwertowanie do base64...")
                    
                    // Konwertuj URI na base64
                    val base64Image = convertImageUriToBase64(it)
                    
                    if (base64Image != null && base64Image.isNotEmpty()) {
                        Log.d("MainActivity", "Zdjęcie przekonwertowane, rozmiar base64: ${base64Image.length} znaków")
                        
                        // Przekaż zdjęcie do JavaScript do analizy przez AI
                        val escapedBase64 = base64Image
                            .replace("\\", "\\\\")  // Escape backslashes
                            .replace("'", "\\'")    // Escape single quotes
                            .replace("\n", "\\n")   // Escape newlines
                            .replace("\r", "\\r")   // Escape carriage returns
                            .replace("\"", "\\\"")  // Escape double quotes
                        
                        // Użyj evaluateJavascript z localStorage dla bardzo długich stringów
                        val javascriptCode = """
                            (function() {
                                try {
                                    var imageData = '$escapedBase64';
                                    if (window.handleGalleryPhoto) {
                                        window.handleGalleryPhoto(imageData);
                                    } else {
                                        console.error('Funkcja handleGalleryPhoto nie jest zdefiniowana');
                                    }
                                } catch(e) {
                                    console.error('Błąd podczas przekazywania zdjęcia z galerii:', e);
                                }
                            })();
                        """.trimIndent()
                        
                        webView.evaluateJavascript(javascriptCode, null)
                        
                        Log.d("MainActivity", "Zdjęcie przekazane do JavaScript")
                    } else {
                        Log.e("MainActivity", "Błąd: Nie udało się przekonwertować zdjęcia z Photo Picker")
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Błąd podczas przetwarzania zdjęcia z Photo Picker: ${e.message}", e)
                }
            } ?: run {
                Log.d("MainActivity", "Użytkownik anulował wybór zdjęcia z Photo Picker")
            }
        }

        // Znalezienie WebView w układzie
        webView = findViewById(R.id.webview)

        // Włączenie obsługi JavaScript w WebView
        webView.settings.javaScriptEnabled = true
        // Włączenie DOM Storage (localStorage + sessionStorage) dla trwałego przechowywania danych w WebView
        // Bez tego localStorage nie będzie utrwalany między uruchomieniami aplikacji
        webView.settings.domStorageEnabled = true

        // Wyłączenie automatycznego ciemnego motywu w WebView
        // To pozwala aplikacji samodzielnie kontrolować motywy przez CSS
        @Suppress("DEPRECATION")
        webView.settings.forceDark = android.webkit.WebSettings.FORCE_DARK_OFF

        // Dodanie interfejsu JavaScript
        webView.addJavascriptInterface(WebAppInterface(this), "Android");
        
        // Dodanie interfejsu do odświeżania Insetsów z poziomu JavaScript
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun refreshInsets() {
                Log.d(TAG_EDGE, "JavaScript zażądał odświeżenia Insetsów")
                forceInsetsUpdate()
            }
        }, "AndroidInsets")

        // Ustawienie WebViewClient, aby linki otwierały się wewnątrz WebView
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                
                // Wymuś aktualizację Insetsów przy każdym załadowaniu strony
                // Rozwiązuje problem z przełączaniem między podstronami
                webView.postDelayed({
                    forceInsetsUpdate()
                }, 100) // Krótkie opóźnienie, aby upewnić się, że JS jest gotowy
                
                // Optymalizacja: zmniejszone opóźnienia dla krytycznych operacji
                webView.postDelayed({
                    // Krytyczne operacje - wczytaj szybciej
                    loadSavedAddresses()
                    loadCachedLocationForNavigation()
                }, 500) // Zmniejszone z 1500ms do 500ms dla krytycznych operacji

                // Mniej krytyczne operacje - z większym opóźnieniem
                webView.postDelayed({
                    loadOptimizedRoute()
                }, 1000) // Zmniejszone z 1500ms do 1000ms

                pushPremiumStatusToWeb(currentPremiumStatus)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                // Natychmiast przekaż pozycję z cache przy każdym rozpoczęciu ładowania strony
                // To zapewnia, że pozycja jest dostępna nawet podczas przełączania między podstronami
                loadCachedLocationForNavigation()
            }

            override fun shouldInterceptRequest(view: WebView?, request: android.webkit.WebResourceRequest?): android.webkit.WebResourceResponse? {
                // Obsługa żądań do app-ads.txt
                val url = request?.url?.toString() ?: ""
                if (url.endsWith("/app-ads.txt")) {
                    try {
                        val inputStream = assets.open("app-ads.txt")
                        return android.webkit.WebResourceResponse("text/plain", "UTF-8", inputStream)
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Błąd podczas ładowania app-ads.txt: ${e.message}")
                    }
                }
                return super.shouldInterceptRequest(view, request)
            }
        }

        // Załadowanie pliku HTML z zasobów 'assets'
        // Upewnij się, że plik leaflet_map.html znajduje się w katalogu app/src/main/assets
        webView.loadUrl("file:///android_asset/leaflet_map.html")

        // Inicjalizacja LocationManager (backup)
        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager

        // Inicjalizacja FusedLocationProviderClient (nowoczesne API)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        // Sprawdzenie i żądanie uprawnień do lokalizacji
        checkLocationPermission()

        // Usunięto automatyczne żądanie uprawnień do mikrofonu przy starcie
        // Uprawnienia do mikrofonu będą żądane tylko gdy użytkownik spróbuje użyć rozpoznawania mowy

        // Inicjalizacja magazynu statusu premium oraz systemów reklam/płatności
        premiumRepository = PremiumRepository(this)
        currentPremiumStatus = premiumRepository.getStatus()

        adManager = AdManager(this)
        adManager.updatePremiumStatus(currentPremiumStatus.isActive)
        adManager.initialize()

        billingManager = BillingManager(
            activity = this,
            adManager = adManager,
            repository = premiumRepository,
            listener = object : BillingManager.Listener {
                override fun onPremiumStatusChanged(status: PremiumStatus) {
                    currentPremiumStatus = status
                    pushPremiumStatusToWeb(status)
                }

                override fun onBillingReady() {
                    pushPremiumStatusToWeb(currentPremiumStatus)
                }

                override fun onBillingError(message: String) {
                    Log.e("MainActivity", message)
                    showBillingMessage(false, message)
                }
                
                override fun onRestoreComplete(success: Boolean, message: String) {
                    Log.d("MainActivity", "Przywracanie zakończone: success=$success, message=$message")
                    showBillingMessage(success, message)
                }
            }
        )
        billingManager.startBillingConnection()
        
        // Ustaw callback dla zamknięcia reklamy nawigacji
        adManager.onAdDismissedCallback = {
            webView.post {
                if (isNavigationAd) {
                    Log.d("MainActivity", "🚀 Kontynuacja nawigacji po zamknięciu reklamy")
                    webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosed(); }", null)
                    isNavigationAd = false
                } else if (isOptimizationAd) {
                    Log.d("MainActivity", "🚀 Kontynuacja optymalizacji po zamknięciu reklamy (reklama wyświetlona)")
                    // Przekazujemy true, bo reklama faktycznie została zamknięta (wyświetlona)
                    webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosedForOptimize(true); }", null)
                    isOptimizationAd = false
                } else if (isReoptimizationAd) {
                    Log.d("MainActivity", "🚀 Kontynuacja reoptymalizacji po zamknięciu reklamy (reklama wyświetlona)")
                    // Przekazujemy true, bo reklama faktycznie została zamknięta (wyświetlona)
                    webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosedForReoptimize(true); }", null)
                    isReoptimizationAd = false
                }
            }
        }

        // Wycofano natychmiastowe sprawdzanie SYSTEM_ALERT_WINDOW.
        // Dialog nakładki zostanie pokazany dopiero po zakończeniu przepływu uprawnienia lokalizacji (onRequestPermissionsResult
        // lub gałąź "już przyznane" w checkLocationPermission()).

        // Sprawdzenie statusu GPS i internetu tylko raz po uruchomieniu aplikacji
        checkStatusOnAppStart()

        // Inicjalizacja WakeLock - zapobiega blokowaniu ekranu podczas działania aplikacji
        initializeWakeLock()

        // RAPORTOWANIE STATYSTYK - Start przy uruchomieniu aplikacji
        Log.d("StatisticsRepo", "Inicjalizacja raportowania statystyk w MainActivity")
        StatisticsWorker.startPeriodicReporting(this, isOverlay = false)

        // Dodaj receiver do obsługi akcji z OverlayService
        overlayActionReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val action = intent?.action
                val address = intent?.getStringExtra("address") ?: ""
                when (action) {
                    ACTION_OVERLAY_NEXT -> {
                        Log.d("MainActivity", "[OVERLAY_NEXT] Rozpoczęcie obsługi dla adresu: $address")

                        // Ustaw status adresu jako "Pominięty"
                        val addressKey = "${address}_${0.0}_${0.0}" // Użyjemy współrzędnych z kontekstu jeśli dostępne
                        webView.evaluateJavascript(
                            "window.optiDrogApp && window.optiDrogApp.getTableManager ? window.optiDrogApp.getTableManager().getAddressKeyByAddress('$address') : null"
                        ) { addressKeyResult ->
                            val actualAddressKey = if (addressKeyResult != null && addressKeyResult != "null" && addressKeyResult != "\"\"") {
                                addressKeyResult.trim('"')
                            } else {
                                addressKey // Fallback
                            }

                            // Zapisz status przez Android interface
                            webView.evaluateJavascript(
                                "if (typeof Android !== 'undefined' && Android.saveAddressStatus) { Android.saveAddressStatus('$actualAddressKey', 'Pominięty'); true; } else { false; }"
                            ) { saveResult ->
                                Log.d("MainActivity", "[OVERLAY_NEXT] Zapisano status 'Pominięty' dla adresu: $actualAddressKey, wynik: $saveResult")
                            }

                            // HISTORIA PRZEJAZDÓW - zapisz akcję "Pominięty"
                            try {
                                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(this@MainActivity)
                                store.recordPointAction(actualAddressKey, "skipped", System.currentTimeMillis())
                            } catch (e: Exception) {
                                Log.e("MainActivity", "[RideHistory] Błąd zapisu akcji NEXT: ${e.message}")
                            }

                            // Aktualizuj status w interfejsie JS
                            webView.evaluateJavascript(
                                "if (window.optiDrogApp && window.optiDrogApp.getTableManager) { window.optiDrogApp.getTableManager().updateAddressStatus('$actualAddressKey', 'Pominięty'); }"
                            ) { updateResult ->
                                Log.d("MainActivity", "[OVERLAY_NEXT] Zaktualizowano status w JS dla adresu: $actualAddressKey")
                            }
                            // Zaktualizuj tekst przycisku nawigacji w UI
                            webView.evaluateJavascript(
                                "if (window.navigationManager) { window.navigationManager.updateNavigationButtonText(); }",
                                null
                            )
                        }

                        // Wyświetl log w konsoli
                        Log.d("MainActivity", "[OVERLAY_NEXT] Adres pominięty: $address")
                        println("Adres pominięty: $address")

                        // Sprawdź czy istnieje trasa w sessionStorage
                        webView.evaluateJavascript(
                            "sessionStorage.getItem('currentRoute');",
                            { routeJson ->
                                if (routeJson != null && routeJson != "null" && routeJson != "\"\"") {
                                    // Pobierz aktualny indeks
                                    webView.evaluateJavascript(
                                        "sessionStorage.getItem('currentRouteIndex');",
                                        { indexStr ->
                                            try {
                                                val cleanRouteJson = routeJson.trim('"').replace("\\\"", "\"")
                                                val routeArray = org.json.JSONArray(cleanRouteJson)
                                                val currentIndex = indexStr?.trim('"')?.toIntOrNull() ?: 0
                                                val nextIndex = currentIndex + 1

                                                if (nextIndex < routeArray.length()) {
                                                    // Są jeszcze adresy - pobierz następny adres
                                                    val nextPoint = routeArray.getJSONObject(nextIndex)
                                                    val newAddress = nextPoint.optString("address", "")
                                                    val lat = nextPoint.optDouble("lat", 0.0)
                                                    val lng = nextPoint.optDouble("lng", 0.0)

                                                    if (newAddress.isNotEmpty() && newAddress != "Aktualna pozycja") {
                                                        // Zaktualizuj indeks w sessionStorage
                                                        webView.evaluateJavascript(
                                                            "sessionStorage.setItem('currentRouteIndex', '$nextIndex');", null)

                                                        // Zsynchronizuj indeks nawigacji w TableManager
                                                        webView.evaluateJavascript(
                                                            "if (window.optiDrogApp && window.optiDrogApp.getTableManager()) { window.optiDrogApp.getTableManager().currentAddressIndex = $nextIndex; }", null)

                                                        // Uruchom overlay service z następnym adresem
                                                        val overlayIntent = Intent(this@MainActivity, OverlayService::class.java)
                                                        overlayIntent.putExtra("address", newAddress)
                                                        overlayIntent.putExtra("latitude", lat)
                                                        overlayIntent.putExtra("longitude", lng)

                                                        // Pobierz pełne ustawienia dla następnego adresu (packageSettings, deliveryType, notes, photos)
                                                        try {
                                                            val rawPackageSettings = nextPoint.optString("packageSettings", "")
                                                            val deliveryType = nextPoint.optString("deliveryType", "")
                                                            val notes = nextPoint.optString("notes", "")
                                                            val photosJsonArray = nextPoint.optJSONArray("photos")
        
                                                            // Buduj obiekt JSON tylko jeśli są jakieś dane
                                                            val hasAnyData = rawPackageSettings.isNotEmpty() || deliveryType.isNotEmpty() || notes.isNotEmpty() ||
                                                                    (photosJsonArray != null && photosJsonArray.length() > 0)
                                                            
                                                            val finalPackageSettings = if (hasAnyData) {
                                                                val existingSettings = if (rawPackageSettings.isNotEmpty()) {
                                                                    org.json.JSONObject(rawPackageSettings)
                                                                } else {
                                                                    org.json.JSONObject()
                                                                }
                
                                                                // deliveryType jeśli brak lub pusty wewnątrz
                                                                if (deliveryType.isNotEmpty() && !existingSettings.has("deliveryType")) {
                                                                    existingSettings.put("deliveryType", deliveryType)
                                                                }
                
                                                                // notes jeśli istnieją
                                                                if (notes.isNotEmpty() && !existingSettings.has("notes")) {
                                                                    existingSettings.put("notes", notes)
                                                                }
                                                                
                                                                if (photosJsonArray != null && photosJsonArray.length() > 0 && !existingSettings.has("photos")) {
                                                                    val validPhotos = org.json.JSONArray()
                                                                    for (i in 0 until kotlin.math.min(photosJsonArray.length(), 2)) {
                                                                        val p = photosJsonArray.optString(i, "")
                                                                        if (p.startsWith("data:image/jpeg;base64,")) {
                                                                            validPhotos.put(p)
                                                                        }
                                                                    }
                                                                    if (validPhotos.length() > 0) {
                                                                        existingSettings.put("photos", validPhotos)
                                                                    }
                                                                }
                                                                
                                                                existingSettings.toString()
                                                            } else {
                                                                "" // Pusty string jeśli nie ma żadnych danych
                                                            }
        
                                                            overlayIntent.putExtra("packageSettings", finalPackageSettings)
                                                            Log.d("MainActivity", "[OVERLAY_NEXT] Scalono ustawienia paczki: $finalPackageSettings")
                                                        } catch (e: Exception) {
                                                            Log.e("MainActivity", "[OVERLAY_NEXT] Błąd podczas scalania ustawień paczki: ${e.message}")
                                                        }

                                                        startService(overlayIntent)

                                                        // Uruchom nawigację do kolejnego adresu
                                                        val webAppInterface = WebAppInterface(this@MainActivity)
                                                        webAppInterface.startNavigation(lat, lng)
                                                    } else {
                                                        // Pomiń "Aktualna pozycja" i przejdź do następnego
                                                        val skipIntent = Intent(ACTION_OVERLAY_NEXT)
                                                        skipIntent.setPackage(packageName)
                                                        sendBroadcast(skipIntent)
                                                    }
                                                } else {
                                                    // Wszystkie adresy zostały odwiedzone
                                                    val completionIntent = Intent(ACTION_ALL_ADDRESSES_COMPLETED)
                                                    completionIntent.setPackage(packageName)
                                                    sendBroadcast(completionIntent)
                                                }
                                            } catch (e: Exception) {
                                                // Błąd parsowania - zakończ nawigację
                                                val completionIntent = Intent(ACTION_ALL_ADDRESSES_COMPLETED)
                                                completionIntent.setPackage(packageName)
                                                sendBroadcast(completionIntent)
                                            }
                                        }
                                    )
                                } else {
                                    // Brak trasy w sessionStorage - spróbuj użyć tableManager
                                    webView.evaluateJavascript(
                                        "window.optiDrogApp && window.optiDrogApp.getTableManager ? window.optiDrogApp.getTableManager().goToNextAddress() : false;",
                                        { hasMoreAddresses ->
                                            if (hasMoreAddresses == "true") {
                                                webView.evaluateJavascript(
                                                    "window.optiDrogApp && window.optiDrogApp.getTableManager ? window.optiDrogApp.getTableManager().getCurrentAddressJson() : '';",
                                                    { result ->
                                                        if (result != null && result != "null" && result != "\"\"") {
                                                            val cleanJson = result.trim('"').replace("\\\"", "\"")
                                                            try {
                                                                val json = org.json.JSONObject(cleanJson)
                                                                val newAddress = json.optString("address", "")
                                                                val lat = json.optDouble("lat", 0.0)
                                                                val lng = json.optDouble("lng", 0.0)
                                                                if (newAddress.isNotEmpty()) {
                                                                    val overlayIntent = Intent(this@MainActivity, OverlayService::class.java)
                                                                    overlayIntent.putExtra("address", newAddress)
                                                                    overlayIntent.putExtra("latitude", lat)
                                                                    overlayIntent.putExtra("longitude", lng)

                                                                    // Pobierz ustawienia paczki, typ dostawy, notatki i zdjęcia z TableManager
                                                                    try {
                                                                        val rawPackageSettings = json.optString("packageSettings", "")
                                                                        val deliveryType = json.optString("deliveryType", "")
                                                                        val notes = json.optString("notes", "")
                                                                        val photosArray = json.optJSONArray("photos")
        
                                                                        // Buduj obiekt JSON tylko jeśli są jakieś dane
                                                                        val hasAnyData = rawPackageSettings.isNotEmpty() || deliveryType.isNotEmpty() || notes.isNotEmpty() ||
                                                                                (photosArray != null && photosArray.length() > 0)
                                                                        
                                                                        val finalPackageSettings = if (hasAnyData) {
                                                                            val existingSettings = if (rawPackageSettings.isNotEmpty()) {
                                                                                org.json.JSONObject(rawPackageSettings)
                                                                            } else {
                                                                                org.json.JSONObject()
                                                                            }
                                                                            
                                                                            if (deliveryType.isNotEmpty() && !existingSettings.has("deliveryType")) {
                                                                                existingSettings.put("deliveryType", deliveryType)
                                                                            }
                                                                            
                                                                            if (notes.isNotEmpty() && !existingSettings.has("notes")) {
                                                                                existingSettings.put("notes", notes)
                                                                            }
                                                                            
                                                                            if (photosArray != null && photosArray.length() > 0 && !existingSettings.has("photos")) {
                                                                                val validPhotos = org.json.JSONArray()
                                                                                for (i in 0 until kotlin.math.min(photosArray.length(), 2)) {
                                                                                    val p = photosArray.optString(i, "")
                                                                                    if (p.startsWith("data:image/jpeg;base64,")) {
                                                                                        validPhotos.put(p)
                                                                                    }
                                                                                }
                                                                                if (validPhotos.length() > 0) {
                                                                                    existingSettings.put("photos", validPhotos)
                                                                                }
                                                                            }
                                                                            
                                                                            existingSettings.toString()
                                                                        } else {
                                                                            "" // Pusty string jeśli nie ma żadnych danych
                                                                        }
        
                                                                        overlayIntent.putExtra("packageSettings", finalPackageSettings)
                                                                        Log.d("MainActivity", "[OVERLAY_NEXT] Scalono ustawienia paczki z TableManager: $finalPackageSettings")
                                                                    } catch (e: Exception) {
                                                                        Log.e("MainActivity", "[OVERLAY_NEXT] Błąd podczas scalania ustawień paczki z TableManager: ${e.message}")
                                                                    }

                                                                    startService(overlayIntent)

                                                                    val webAppInterface = WebAppInterface(this@MainActivity)
                                                                    webAppInterface.startNavigation(lat, lng)
                                                                }
                                                            } catch (_: Exception) {}
                                                        }
                                                    }
                                                )
                                            } else {
                                                val completionIntent = Intent(ACTION_ALL_ADDRESSES_COMPLETED)
                                                completionIntent.setPackage(packageName)
                                                sendBroadcast(completionIntent)
                                            }
                                        }
                                    )
                                }
                            }
                        )
                    }
                    ACTION_OVERLAY_DONE -> {
                        Log.d("MainActivity", "[OVERLAY_DONE] Rozpoczęcie obsługi dla adresu: $address")

                        // Ustaw status adresu jako "Odwiedzony"
                        val addressKey = "${address}_${0.0}_${0.0}" // Użyjemy współrzędnych z kontekstu jeśli dostępne
                        webView.evaluateJavascript(
                            "window.optiDrogApp && window.optiDrogApp.getTableManager ? window.optiDrogApp.getTableManager().getAddressKeyByAddress('$address') : null"
                        ) { addressKeyResult ->
                            val actualAddressKey = if (addressKeyResult != null && addressKeyResult != "null" && addressKeyResult != "\"\"") {
                                addressKeyResult.trim('"')
                            } else {
                                addressKey // Fallback
                            }

                            // Zapisz status przez Android interface
                            webView.evaluateJavascript(
                                "if (typeof Android !== 'undefined' && Android.saveAddressStatus) { Android.saveAddressStatus('$actualAddressKey', 'Odwiedzony'); true; } else { false; }"
                            ) { saveResult ->
                                Log.d("MainActivity", "[OVERLAY_DONE] Zapisano status 'Odwiedzony' dla adresu: $actualAddressKey, wynik: $saveResult")
                            }

                            // HISTORIA PRZEJAZDÓW - zapisz akcję "Dostarczone"
                            try {
                                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(this@MainActivity)
                                store.recordPointAction(actualAddressKey, "delivered", System.currentTimeMillis())
                            } catch (e: Exception) {
                                Log.e("MainActivity", "[RideHistory] Błąd zapisu akcji DONE: ${e.message}")
                            }

                            // Aktualizuj status w interfejsie JS
                            webView.evaluateJavascript(
                                "if (window.optiDrogApp && window.optiDrogApp.getTableManager) { window.optiDrogApp.getTableManager().updateAddressStatus('$actualAddressKey', 'Odwiedzony'); }"
                            ) { updateResult ->
                                Log.d("MainActivity", "[OVERLAY_DONE] Zaktualizowano status w JS dla adresu: $actualAddressKey")
                            }
                            // Zaktualizuj tekst przycisku nawigacji w UI
                            webView.evaluateJavascript(
                                "if (window.navigationManager) { window.navigationManager.updateNavigationButtonText(); }",
                                null
                            )
                        }

                        // Wyświetl log w konsoli
                        Log.d("MainActivity", "[OVERLAY_DONE] Adres oznaczony jako OK: $address")
                        println("Adres oznaczony jako OK: $address")

                        // Sprawdź czy istnieje trasa w sessionStorage
                        webView.evaluateJavascript(
                            "sessionStorage.getItem('currentRoute');",
                            { routeJson ->
                                if (routeJson != null && routeJson != "null" && routeJson != "\"\"") {
                                    // Pobierz aktualny indeks
                                    webView.evaluateJavascript(
                                        "sessionStorage.getItem('currentRouteIndex');",
                                        { indexStr ->
                                            try {
                                                val cleanRouteJson = routeJson.trim('"').replace("\\\"", "\"")
                                                val routeArray = org.json.JSONArray(cleanRouteJson)
                                                val currentIndex = indexStr?.trim('"')?.toIntOrNull() ?: 0
                                                val nextIndex = currentIndex + 1

                                                if (nextIndex < routeArray.length()) {
                                                    // Są jeszcze adresy - pobierz następny adres
                                                    val nextPoint = routeArray.getJSONObject(nextIndex)
                                                    val newAddress = nextPoint.optString("address", "")
                                                    val lat = nextPoint.optDouble("lat", 0.0)
                                                    val lng = nextPoint.optDouble("lng", 0.0)

                                                    if (newAddress.isNotEmpty() && newAddress != "Aktualna pozycja") {
                                                        // Zaktualizuj indeks w sessionStorage
                                                        webView.evaluateJavascript(
                                                            "sessionStorage.setItem('currentRouteIndex', '$nextIndex');", null)

                                                        // Zsynchronizuj indeks nawigacji w TableManager
                                                        webView.evaluateJavascript(
                                                            "if (window.optiDrogApp && window.optiDrogApp.getTableManager()) { window.optiDrogApp.getTableManager().currentAddressIndex = $nextIndex; }", null)

                                                        // Uruchom overlay service z następnym adresem
                                                        val overlayIntent = Intent(this@MainActivity, OverlayService::class.java)
                                                        overlayIntent.putExtra("address", newAddress)
                                                        overlayIntent.putExtra("latitude", lat)
                                                        overlayIntent.putExtra("longitude", lng)

                                                        // Pobierz pełne ustawienia dla kolejnego adresu po zakończeniu (DONE)
                                                        try {
                                                            val rawPackageSettings = nextPoint.optString("packageSettings", "")
                                                            val deliveryType = nextPoint.optString("deliveryType", "")
                                                            val notes = nextPoint.optString("notes", "")
                                                            val photosArray = nextPoint.optJSONArray("photos")
                                                            
                                                            // Sprawdź czy są jakiekolwiek dane do przekazania
                                                            val hasAnyData = rawPackageSettings.isNotEmpty() || deliveryType.isNotEmpty() || notes.isNotEmpty() ||
                                                                    (photosArray != null && photosArray.length() > 0)
        
                                                            val finalPackageSettings = if (hasAnyData) {
                                                                val existingSettings = if (rawPackageSettings.isNotEmpty()) {
                                                                    org.json.JSONObject(rawPackageSettings)
                                                                } else {
                                                                    org.json.JSONObject()
                                                                }
                
                                                                if (deliveryType.isNotEmpty() && !existingSettings.has("deliveryType")) {
                                                                    existingSettings.put("deliveryType", deliveryType)
                                                                }
                
                                                                if (notes.isNotEmpty() && !existingSettings.has("notes")) {
                                                                    existingSettings.put("notes", notes)
                                                                }
                
                                                                if (photosArray != null && photosArray.length() > 0 && !existingSettings.has("photos")) {
                                                                    val validPhotos = org.json.JSONArray()
                                                                    for (i in 0 until kotlin.math.min(photosArray.length(), 2)) {
                                                                        val p = photosArray.optString(i, "")
                                                                        if (p.startsWith("data:image/jpeg;base64,")) {
                                                                            validPhotos.put(p)
                                                                        }
                                                                    }
                                                                    if (validPhotos.length() > 0) {
                                                                        existingSettings.put("photos", validPhotos)
                                                                    }
                                                                }
                                                                
                                                                existingSettings.toString()
                                                            } else {
                                                                "" // Pusty string jeśli nie ma żadnych danych
                                                            }
        
                                                            overlayIntent.putExtra("packageSettings", finalPackageSettings)
                                                            Log.d("MainActivity", "[OVERLAY_DONE] Scalono ustawienia paczki: $finalPackageSettings")
                                                        } catch (e: Exception) {
                                                            Log.e("MainActivity", "[OVERLAY_DONE] Błąd podczas scalania ustawień paczki: ${e.message}")
                                                        }

                                                        startService(overlayIntent)

                                                        // Uruchom nawigację do kolejnego adresu
                                                        val webAppInterface = WebAppInterface(this@MainActivity)
                                                        webAppInterface.startNavigation(lat, lng)
                                                    } else {
                                                        // Pomiń "Aktualna pozycja" i przejdź do następnego
                                                        val skipIntent = Intent(ACTION_OVERLAY_DONE)
                                                        skipIntent.setPackage(packageName)
                                                        sendBroadcast(skipIntent)
                                                    }
                                                } else {
                                                    // Wszystkie adresy zostały odwiedzone
                                                    val completionIntent = Intent(ACTION_ALL_ADDRESSES_COMPLETED)
                                                    completionIntent.setPackage(packageName)
                                                    sendBroadcast(completionIntent)
                                                }
                                            } catch (e: Exception) {
                                                // Błąd parsowania - zakończ nawigację
                                                val completionIntent = Intent(ACTION_ALL_ADDRESSES_COMPLETED)
                                                completionIntent.setPackage(packageName)
                                                sendBroadcast(completionIntent)
                                            }
                                        }
                                    )
                                } else {
                                    // Brak trasy w sessionStorage - spróbuj użyć tableManager
                                    webView.evaluateJavascript(
                                        "window.optiDrogApp && window.optiDrogApp.getTableManager ? window.optiDrogApp.getTableManager().goToNextAddress() : false;",
                                        { hasMoreAddresses ->
                                            if (hasMoreAddresses == "true") {
                                                webView.evaluateJavascript(
                                                    "window.optiDrogApp && window.optiDrogApp.getTableManager ? window.optiDrogApp.getTableManager().getCurrentAddressJson() : '';",
                                                    { result ->
                                                        if (result != null && result != "null" && result != "\"\"") {
                                                            val cleanJson = result.trim('"').replace("\\\"", "\"")
                                                            try {
                                                                val json = org.json.JSONObject(cleanJson)
                                                                val newAddress = json.optString("address", "")
                                                                val lat = json.optDouble("lat", 0.0)
                                                                val lng = json.optDouble("lng", 0.0)
                                                                if (newAddress.isNotEmpty()) {
                                                                    val overlayIntent = Intent(this@MainActivity, OverlayService::class.java)
                                                                    overlayIntent.putExtra("address", newAddress)
                                                                    overlayIntent.putExtra("latitude", lat)
                                                                    overlayIntent.putExtra("longitude", lng)

                                                                    // Pobierz ustawienia paczki i typ dostawy z TableManager
                                                                    try {
                                                                        val packageSettings = json.optString("packageSettings", "")
                                                                        val deliveryType = json.optString("deliveryType", "")

                                                                        if (packageSettings.isNotEmpty()) {
                                                                            overlayIntent.putExtra("packageSettings", packageSettings)
                                                                            Log.d("MainActivity", "[OVERLAY_DONE] Przekazywanie ustawień paczki z TableManager: $packageSettings")
                                                                        }

                                                                        // Sprawdź czy są jakiekolwiek dane do przekazania
                                                                        val hasAnyData = packageSettings.isNotEmpty() || deliveryType.isNotEmpty()
                                                                        
                                                                        if (hasAnyData) {
                                                                            if (deliveryType.isNotEmpty() && packageSettings.isNotEmpty()) {
                                                                                // Dodaj deliveryType do istniejących ustawień paczki jeśli nie ma go już tam
                                                                                val existingSettings = org.json.JSONObject(packageSettings)
                                                                                if (!existingSettings.has("deliveryType")) {
                                                                                    existingSettings.put("deliveryType", deliveryType)
                                                                                    overlayIntent.putExtra("packageSettings", existingSettings.toString())
                                                                                    Log.d("MainActivity", "[OVERLAY_DONE] Dodano deliveryType z TableManager: $deliveryType")
                                                                                } else {
                                                                                    overlayIntent.putExtra("packageSettings", packageSettings)
                                                                                }
                                                                            } else if (deliveryType.isNotEmpty()) {
                                                                                // Tylko deliveryType bez innych ustawień
                                                                                val settings = org.json.JSONObject()
                                                                                settings.put("deliveryType", deliveryType)
                                                                                overlayIntent.putExtra("packageSettings", settings.toString())
                                                                                Log.d("MainActivity", "[OVERLAY_DONE] Ustawiono tylko deliveryType: $deliveryType")
                                                                            } else if (packageSettings.isNotEmpty()) {
                                                                                // Tylko istniejące ustawienia paczki bez deliveryType
                                                                                overlayIntent.putExtra("packageSettings", packageSettings)
                                                                            }
                                                                        }
                                                                    } catch (e: Exception) {
                                                                        Log.e("MainActivity", "[OVERLAY_DONE] Błąd podczas przetwarzania ustawień paczki z TableManager: ${e.message}")
                                                                    }

                                                                    startService(overlayIntent)

                                                                    val webAppInterface = WebAppInterface(this@MainActivity)
                                                                    webAppInterface.startNavigation(lat, lng)
                                                                }
                                                            } catch (_: Exception) {}
                                                        }
                                                    }
                                                )
                                            } else {
                                                val completionIntent = Intent(ACTION_ALL_ADDRESSES_COMPLETED)
                                                completionIntent.setPackage(packageName)
                                                sendBroadcast(completionIntent)
                                            }
                                        }
                                    )
                                }
                            }
                        )
                    }
                }
            }
        }

        // Zarejestruj receiver globalnie w onCreate
        val filter = IntentFilter().apply {
            addAction(ACTION_OVERLAY_NEXT)
            addAction(ACTION_OVERLAY_DONE)
            addAction(ACTION_ALL_ADDRESSES_COMPLETED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(overlayActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(overlayActionReceiver, filter)
        }
    }

    // Metoda do wczytywania zapisanych adresów i przywracania ich statusu
    private fun loadSavedAddresses() {
        val sharedPreferences = getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
        val addressesJson = sharedPreferences.getString(ADDRESSES_KEY, null)

        Log.d("MainActivity", "Wczytywanie zapisanych adresów")

        if (addressesJson != null) {
            Log.d("MainActivity", "Znaleziono zapisane adresy: $addressesJson")

            try {
                // Sprawdźmy, czy JSON zawiera pola timeFrom i timeTo
                val jsonArray = JSONArray(addressesJson)
                Log.d("MainActivity", "Liczba zapisanych adresów: ${jsonArray.length()}")

                for (i in 0 until jsonArray.length()) {
                    val address = jsonArray.getJSONObject(i)
                    val hasTimeFrom = address.has("timeFrom")
                    val hasTimeTo = address.has("timeTo")
                    val timeFrom = if (hasTimeFrom) address.getString("timeFrom") else ""
                    val timeTo = if (hasTimeTo) address.getString("timeTo") else ""
                    Log.d("MainActivity", "Adres ${i+1}: ${address.optString("address", "")}, " +
                            "timeFrom: $timeFrom, timeTo: $timeTo, " +
                            "hasTimeFrom: $hasTimeFrom, hasTimeTo: $hasTimeTo")
                }
            } catch (e: Exception) {
                Log.e("MainActivity", "Błąd podczas analizy JSON adresów: ${e.message}", e)
            }

            // Użyj mechanizmu oczekiwania na inicjalizację aplikacji
            waitForAppInitializationAndLoadAddresses(addressesJson)
        } else {
            Log.d("MainActivity", "Brak zapisanych adresów")
        }
    }

    // Metoda oczekująca na pełną inicjalizację aplikacji JavaScript przed wczytaniem adresów
    private fun waitForAppInitializationAndLoadAddresses(addressesJson: String, attempt: Int = 1, maxAttempts: Int = 10) {
        webView.evaluateJavascript(
            "(function() { " +
                    "return window.optiDrogApp && " +
                    "window.optiDrogApp.tableManager && " +
                    "typeof window.optiDrogApp.tableManager.loadSavedAddresses === 'function' && " +
                    "typeof window.optiDrogApp.tableManager.isAppFullyLoaded === 'function' && " +
                    "window.optiDrogApp.tableManager.isAppFullyLoaded(); " +
                    "})()"
        ) { result ->
            val isReady = result == "true"
            Log.d("MainActivity", "Sprawdzanie gotowości aplikacji (próba $attempt/$maxAttempts): $isReady")

            if (isReady) {
                // Aplikacja jest gotowa - wczytaj adresy
                val escapedJson = addressesJson.replace("\\", "\\\\").replace("'", "\\'")
                webView.evaluateJavascript(
                    "window.optiDrogApp.tableManager.loadSavedAddresses('$escapedJson'); " +
                            "console.log('Adresy wczytane z MainActivity po sprawdzeniu pełnej gotowości aplikacji');" +
                            "if (window.navigationManager) { window.navigationManager.updateNavigationButtonText(); }"
                ) { loadResult ->
                    Log.d("MainActivity", "Wynik wczytywania adresów: $loadResult")
                }
            } else if (attempt < maxAttempts) {
                // Aplikacja nie jest jeszcze gotowa - spróbuj ponownie za 200ms (zoptymalizowane)
                webView.postDelayed({
                    waitForAppInitializationAndLoadAddresses(addressesJson, attempt + 1, maxAttempts)
                }, 200) // Zmniejszone z 300ms do 200ms
            } else {
                // Przekroczono maksymalną liczbę prób - spróbuj wczytać mimo wszystko
                Log.w("MainActivity", "Przekroczono maksymalną liczbę prób inicjalizacji, próbuję wczytać adresy mimo wszystko")
                val escapedJson = addressesJson.replace("\\", "\\\\").replace("'", "\\'")
                webView.evaluateJavascript(
                    "if (window.optiDrogApp && window.optiDrogApp.tableManager) { " +
                            "window.optiDrogApp.tableManager.loadSavedAddresses('$escapedJson'); " +
                            "console.log('Adresy wczytane z MainActivity (fallback po przekroczeniu prób)'); " +
                            "if (window.navigationManager) { window.navigationManager.updateNavigationButtonText(); }" +
                            "} else { " +
                            "console.log('OptiDrogApp nadal nie jest zainicjalizowany - nie można wczytać adresów'); " +
                            "}"
                ) { fallbackResult ->
                    Log.d("MainActivity", "Wynik fallback wczytywania adresów: $fallbackResult")
                }
            }
        }
    }

    // Funkcja przywracająca status adresów po uruchomieniu aplikacji
    // Funkcja przywracająca statusy adresów po załadowaniu strony - WYŁĄCZONA
    private fun restoreAddressStatuses(retryCount: Int = 0) {
        Log.d("MainActivity", "[DISABLED] Funkcja przywracania statusów adresów została wyłączona")
        // Funkcjonalność statusów adresów została usunięta z aplikacji
    }

    // Metoda wyświetlająca dialog proszący o SYSTEM_ALERT_WINDOW z pełnym wyjaśnieniem
    // Wywoływana dopiero PO zakończeniu przepływu uprawnienia lokalizacji.
    private fun showOverlayPermissionDialog() {
        // Ustawiamy flagę aby nie wyświetlać dialogu ponownie
        overlayDialogShown = true

        // Użycie stylu zdefiniowanego w XML (OverlayPermissionDialogStyle) dla spójności z motywem
        val builder = AlertDialog.Builder(this, R.style.OverlayPermissionDialogStyle)
            .setTitle(getString(R.string.overlay_permission_title))
            .setMessage(getString(R.string.overlay_permission_message))
            .setPositiveButton(getString(R.string.overlay_permission_positive)) { _, _ ->
                // Przekierowanie do ustawień nadpisywania nakładek
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                overlayPermissionLauncher.launch(intent)
            }
            .setNegativeButton(getString(R.string.overlay_permission_negative)) { dialog, _ ->
                // Użytkownik odracza decyzję – informujemy krótkim komunikatem
                dialog.dismiss()
                // Usunięto Toast (zgodnie z wymaganiem)\n
            }
            .setCancelable(false) // Wymagamy świadomej decyzji

        val dialog = builder.create()

        // Dodatkowe zabezpieczenie przed wyciekiem: pokaż tylko jeśli nie kończymy Activity
        if (!isFinishing) {
            dialog.show()
        }
    }

    // Funkcja pomocnicza wywoływana po zakończeniu obsługi uprawnienia lokalizacji (grant / deny)
    // Sprawdza czy mamy już pozwolenie SYSTEM_ALERT_WINDOW; jeśli nie – pokazuje dialog.
    private fun maybeShowOverlayPermissionAfterLocation() {
        // Warunek: wersja M+, brak pozwolenia, dialog nie był jeszcze pokazany
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !overlayDialogShown &&
            !Settings.canDrawOverlays(this)
        ) {
            showOverlayPermissionDialog()
        }
    }

    // Funkcja sprawdzająca uprawnienia do lokalizacji
    private fun checkLocationPermission() {
        // Sprawdzenie, czy uprawnienia ACCESS_FINE_LOCATION zostały przyznane
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            // Jeśli uprawnienia nie zostały przyznane: wywołujemy systemowy prompt.
            // Dialog nakładki zostanie pokazany dopiero w onRequestPermissionsResult po zamknięciu tego promptu.
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
                LOCATION_PERMISSION_REQUEST_CODE
            )
        } else {
            // Uprawnienia już przyznane – możemy od razu zacząć aktualizację lokalizacji
            requestLocationUpdates()

            // A także przejść do następnego kroku first-launch flow: sprawdzenie nakładki
            maybeShowOverlayPermissionAfterLocation()
        }
    }

    // Obsługa odpowiedzi użytkownika na prośbę o uprawnienia
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        when (requestCode) {
            LOCATION_PERMISSION_REQUEST_CODE -> {
                // Sprawdzenie, czy odpowiedź dotyczy prośby o uprawnienia do lokalizacji
                if ((grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)) {
                    // Jeśli uprawnienia zostały przyznane, rozpocznij aktualizację lokalizacji
                    requestLocationUpdates()
                } else {
                    // Jeśli uprawnienia nie zostały przyznane, wyświetl komunikat dla użytkownika
                    // Usunięto Toast (zgodnie z wymaganiem)\n
                }

                // Niezależnie od wyniku lokalizacji (grant / deny) przechodzimy do etapu nakładki.
                // Dzięki temu dialog SYSTEM_ALERT_WINDOW zawsze pojawia się dopiero po zamknięciu promptu lokalizacji.
                maybeShowOverlayPermissionAfterLocation()
            }
            AUDIO_PERMISSION_REQUEST_CODE -> {
                Log.d("MainActivity", "Otrzymano wynik żądania uprawnień AUDIO_PERMISSION_REQUEST_CODE")
                Log.d("MainActivity", "grantResults: ${grantResults.contentToString()}")

                // Sprawdzenie, czy odpowiedź dotyczy prośby o uprawnienia do nagrywania dźwięku
                if ((grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)) {
                    Log.d("MainActivity", "Uprawnienia do nagrywania dźwięku zostały przyznane")
                    // Przekaż informację do JavaScript o przyznaniu uprawnień
                    webView.evaluateJavascript(
                        "window.speechRecognitionPermissionResult && window.speechRecognitionPermissionResult('granted');",
                        null
                    )
                    // Usunięto Toast (zgodnie z wymaganiem)\n
                } else {
                    Log.d("MainActivity", "Uprawnienia do nagrywania dźwięku zostały odrzucone")

                    // Sprawdź czy uprawnienia zostały trwale odrzucone (tylko jeśli użytkownik już wcześniej odrzucił)
                    val shouldShowRationale = ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO)
                    val permanentlyDenied = !shouldShowRationale && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_DENIED

                    if (permanentlyDenied) {
                        // Pokaż dialog z informacją o trwałym odrzuceniu
                        showPermanentlyDeniedAudioPermissionDialog()
                    } else {
                        // Przekaż informację do JavaScript o odmowie uprawnień
                        webView.evaluateJavascript(
                            "window.speechRecognitionPermissionResult && window.speechRecognitionPermissionResult('denied');",
                            null
                        )
                        // Usunięto Toast (zgodnie z wymaganiem)\n
                    }
                }
            }
            CAMERA_PERMISSION_REQUEST_CODE -> {
                Log.d("MainActivity", "Otrzymano wynik żądania uprawnień CAMERA_PERMISSION_REQUEST_CODE")
                Log.d("MainActivity", "grantResults: ${grantResults.contentToString()}")

                // Sprawdzenie, czy odpowiedź dotyczy prośby o uprawnienia do aparatu
                if ((grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)) {
                    Log.d("MainActivity", "Uprawnienia do aparatu zostały przyznane")
                    // Przekaż informację do JavaScript o przyznaniu uprawnień
                    webView.evaluateJavascript(
                        "window.cameraPermissionResult && window.cameraPermissionResult('granted');",
                        null
                    )
                    // Usunięto Toast (zgodnie z wymaganiem)\n
                } else {
                    Log.d("MainActivity", "Uprawnienia do aparatu zostały odrzucone")

                    // Sprawdź czy uprawnienia zostały trwale odrzucone (tylko jeśli użytkownik już wcześniej odrzucił)
                    val shouldShowRationale = ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.CAMERA)
                    val permanentlyDenied = !shouldShowRationale && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_DENIED

                    if (permanentlyDenied) {
                        // Pokaż dialog z informacją o trwałym odrzuceniu
                        showPermanentlyDeniedCameraPermissionDialog()
                    } else {
                        // Przekaż informację do JavaScript o odmowie uprawnień
                        webView.evaluateJavascript(
                            "window.cameraPermissionResult && window.cameraPermissionResult('denied');",
                            null
                        )
                        // Usunięto Toast (zgodnie z wymaganiem)\n
                    }
                }
            }
            // STORAGE_PERMISSION_REQUEST_CODE został usunięty - Photo Picker nie wymaga uprawnień
        }
    }

    // Funkcja sprawdzająca status GPS i internetu przy każdym uruchomieniu aplikacji
    private fun checkStatusOnAppStart() {
        // Sprawdź czy to pierwsze uruchomienie aplikacji w tej sesji
        val sharedPrefs = getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
        val lastStatusCheck = sharedPrefs.getLong("last_status_check", 0)
        val currentTime = System.currentTimeMillis()

        // Sprawdzaj status tylko raz na 5 minut lub przy pierwszym uruchomieniu
        if (currentTime - lastStatusCheck > 5 * 60 * 1000 || lastStatusCheck == 0L) {
            // Poczekaj aż WebView się załaduje, a następnie sprawdź status
            webView.post {
                // Zmniejszone opóźnienie z 2s do 1s
                webView.postDelayed({
                    performInitialStatusCheck()
                    // Zapisz czas sprawdzenia
                    sharedPrefs.edit().putLong("last_status_check", currentTime).apply()
                }, 1000) // Zmniejszone opóźnienie z 2000ms do 1000ms
            }
        } else {
            Log.d("MainActivity", "Pomijam sprawdzenie statusu - ostatnie sprawdzenie było niedawno")
        }
    }

    // Funkcja wykonująca jednorazowe sprawdzenie statusu przy starcie
    private fun performInitialStatusCheck() {
        // Zmniejszone opóźnienie z 2s do 1s
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            android.util.Log.d("MainActivity", "Rozpoczynam sprawdzanie statusu GPS i internetu...")
            webView.evaluateJavascript(
                "console.log('🔍 KOTLIN: Wywołuję performStartupCheck...'); " +
                        "if (window.optiDrogApp && window.optiDrogApp.getStatusChecker) { " +
                        "  console.log('✅ KOTLIN: OptiDrogApp i StatusChecker są dostępne'); " +
                        "  window.optiDrogApp.getStatusChecker().performStartupCheck(); " +
                        "} else { " +
                        "  console.log('❌ KOTLIN: StatusChecker nie jest jeszcze dostępny'); " +
                        "  console.log('window.optiDrogApp:', window.optiDrogApp); " +
                        "  if (window.optiDrogApp) console.log('getStatusChecker:', window.optiDrogApp.getStatusChecker); " +
                        "}", null
            )
        }, 1000) // Zmniejszone z 2000ms do 1000ms
    }

    // Obsługa wyniku uprawnień nakładki została przeniesiona do ActivityResultLauncher w onCreate()

    // Funkcja do uruchamiania ciągłego śledzenia lokalizacji w tle
    // Ta funkcja zapewnia, że pozycja użytkownika jest zawsze aktualna w cache
    private fun startContinuousLocationTracking() {
        // Sprawdzenie uprawnień przed próbą uzyskania lokalizacji
        if (ContextCompat.checkSelfPermission(this,
                Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return // Zakończ, jeśli uprawnienia nie są przyznane
        }

        try {
            // Skonfiguruj żądanie lokalizacji dla ciągłego śledzenia w tle
            val backgroundLocationRequest = LocationRequest.Builder(
                Priority.PRIORITY_BALANCED_POWER_ACCURACY, // Zbalansowana dokładność - oszczędza baterię
                30000L // Aktualizacje co 30 sekund w tle
            ).apply {
                setMinUpdateDistanceMeters(10f) // Minimalna odległość 10 metrów
                setMaxUpdateDelayMillis(60000L) // Maksymalne opóźnienie 1 minuta
                setWaitForAccurateLocation(false) // Nie czekaj na bardzo dokładną pozycję
            }.build()

            // Zatrzymaj poprzedni callback jeśli istnieje
            backgroundLocationCallback?.let {
                fusedLocationClient.removeLocationUpdates(it)
            }

            // Utwórz callback do odbierania aktualizacji w tle
            backgroundLocationCallback = object : LocationCallback() {
                override fun onLocationResult(locationResult: LocationResult) {
                    locationResult.lastLocation?.let { location ->
                        // Zapisz nową pozycję w cache - to jest kluczowe dla szybkiego dostępu
                        saveCachedLocation(location.latitude, location.longitude)

                        // Natychmiast przekaż nową pozycję do JavaScript
                        updateNavigationWithLocation(location.latitude, location.longitude, "śledzenie w tle")

                        Log.d("BackgroundLocation", "Pozycja zaktualizowana w tle: ${location.latitude}, ${location.longitude}")
                        println("Pozycja zaktualizowana w tle: ${location.latitude}, ${location.longitude}")
                    }
                }
            }

            // Rozpocznij żądania aktualizacji pozycji w tle
            backgroundLocationCallback?.let {
                fusedLocationClient.requestLocationUpdates(
                    backgroundLocationRequest,
                    it,
                    mainLooper
                )
            }

        } catch (e: SecurityException) {
            e.printStackTrace()
            println("Błąd uprawnień podczas uruchamiania śledzenia w tle: ${e.message}")
        }
    }

    // Funkcja rozpoczynająca aktualizację lokalizacji
    private fun requestLocationUpdates() {
        // Sprawdzenie uprawnień przed próbą uzyskania lokalizacji (wymagane przez Android API)
        if (ContextCompat.checkSelfPermission(this,
                Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return // Zakończ, jeśli uprawnienia nie są przyznane
        }

        try {
            // KROK 0: Sprawdź czy mamy zapisaną pozycję w cache
            val cachedLocation = loadCachedLocation()
            if (cachedLocation != null) {
                // Użyj pozycji z cache - natychmiast aktualizuj mapę i przekaż do nawigacji
                webView.evaluateJavascript("updateMarkerWithoutCentering(${cachedLocation.first}, ${cachedLocation.second});", null)
                // Ukryj status pobierania pozycji, ponieważ mamy pozycję z cache
                webView.evaluateJavascript("document.getElementById('location-status').style.display = 'none';", null)
                // Przekaż pozycję z cache do systemu nawigacji JavaScript
                updateNavigationWithLocation(cachedLocation.first, cachedLocation.second, "cache")
                //// Usunięto Toast (zgodnie z wymaganiem)\n
                println("Użyto pozycji z cache: ${cachedLocation.first}, ${cachedLocation.second}")
            } else {
                // Pokaż status pobierania pozycji jeśli nie ma cache
                webView.evaluateJavascript("showLocationStatus();", null)
            }

            // KROK 1: Pobierz ostatnią znaną pozycję (natychmiastowe) - zawsze w tle
            fusedLocationClient.lastLocation.addOnSuccessListener { location: Location? ->
                location?.let {
                    // Zapisz pozycję w cache
                    saveCachedLocation(it.latitude, it.longitude)

                    // Aktualizuj pozycję na mapie tylko jeśli nie było cache lub pozycja się zmieniła
                    if (cachedLocation == null ||
                        Math.abs(cachedLocation.first - it.latitude) > 0.0001 ||
                        Math.abs(cachedLocation.second - it.longitude) > 0.0001) {
                        webView.evaluateJavascript("updateMarkerWithoutCentering(${it.latitude}, ${it.longitude});", null)

                        // Przekaż pozycję do systemu nawigacji JavaScript
                        updateNavigationWithLocation(it.latitude, it.longitude, "ostatnia znana pozycja")

                        if (cachedLocation == null) {

                        }
                    }
                }
            }

            // KROK 2: Skonfiguruj żądanie aktualnej pozycji (wysokiej dokładności)
            val locationRequest = LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, // Najwyższa dokładność
                1000L // Aktualizacje co 1 sekundę
            ).apply {
                setMinUpdateDistanceMeters(1f) // Minimalna odległość 1 metr
                setMaxUpdateDelayMillis(2000L) // Maksymalne opóźnienie 2 sekundy
                setWaitForAccurateLocation(false) // Nie czekaj na bardzo dokładną pozycję
            }.build()

            // KROK 3: Utwórz callback do odbierania aktualizacji
            locationCallback = object : LocationCallback() {
                override fun onLocationResult(locationResult: LocationResult) {
                    locationResult.lastLocation?.let { location ->
                        // Zapisz nową pozycję w cache
                        saveCachedLocation(location.latitude, location.longitude)

                        // Aktualizuj pozycję na mapie
                        webView.evaluateJavascript("updateMarkerWithoutCentering(${location.latitude}, ${location.longitude});", null)

                        // Przekaż nową pozycję do systemu nawigacji JavaScript
                        updateNavigationWithLocation(location.latitude, location.longitude, "nowa pozycja GPS")
                    }
                }
            }

            // KROK 4: Rozpocznij żądania aktualizacji pozycji (nowe API z Executor zamiast Looper)
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                ContextCompat.getMainExecutor(this), // Użycie Executor - zgodne z nowszym API Play Services
                locationCallback!!
            )

        } catch (e: SecurityException) {
            // Obsługa wyjątku SecurityException, jeśli uprawnienia nie zostały prawidłowo przyznane
            e.printStackTrace()
            // Usunięto Toast (zgodnie z wymaganiem)\n
        }
    }

    // Metoda wywoływana, gdy aktywność jest niszczona
    override fun onDestroy() {
        super.onDestroy()
        
        // Czyść cache WindowInsets
        cleanupWindowInsetsCache()
        
        // Zatrzymaj aktualizacje pozycji z FusedLocationProviderClient
        locationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
        }
        // Zatrzymaj ciągłe śledzenie lokalizacji w tle
        backgroundLocationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
        }

        // Usunięto przestarzały blok usuwania anonimowego LocationListener (nigdy nie był rejestrowany). FusedLocationProviderClient obsługuje całość.
        // Wyrejestruj receiver w onDestroy
        overlayActionReceiver?.let { unregisterReceiver(it) }

        // Zatrzymaj rozpoznawanie mowy
        stopSpeechRecognition()

        // Zwolnij WakeLock przy niszczeniu aktywności
        releaseWakeLock()

        if (::billingManager.isInitialized) {
            billingManager.destroy()
        }

        // Wyczyść zasoby AdManagera
        adManager.destroy()
    }

    // Funkcja do zapisywania aktualnej pozycji w cache
    private fun saveCachedLocation(latitude: Double, longitude: Double) {
        val sharedPreferences = getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()

        // Zapisz pozycję jako JSON
        val locationJson = JSONObject().apply {
            put("latitude", latitude)
            put("longitude", longitude)
        }

        editor.putString(LOCATION_KEY, locationJson.toString())
        editor.putLong(LOCATION_TIMESTAMP_KEY, System.currentTimeMillis())
        editor.apply()

        println("Pozycja zapisana w cache: $latitude, $longitude")
    }

    // Funkcja do wczytywania pozycji z cache (jeśli jest aktualna)
    private fun loadCachedLocation(): Pair<Double, Double>? {
        val sharedPreferences = getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
        val locationString = sharedPreferences.getString(LOCATION_KEY, null)
        val timestamp = sharedPreferences.getLong(LOCATION_TIMESTAMP_KEY, 0)

        // Sprawdź czy pozycja nie jest za stara
        val currentTime = System.currentTimeMillis()
        if (currentTime - timestamp > LOCATION_CACHE_DURATION) {
            println("Pozycja w cache jest za stara (${(currentTime - timestamp) / 1000} sekund)")
            return null
        }

        return try {
            locationString?.let {
                val locationJson = JSONObject(it)
                val latitude = locationJson.getDouble("latitude")
                val longitude = locationJson.getDouble("longitude")
                println("Pozycja wczytana z cache: $latitude, $longitude")
                Pair(latitude, longitude)
            }
        } catch (e: Exception) {
            println("Błąd podczas wczytywania pozycji z cache: ${e.message}")
            null
        }
    }

    // Funkcja przekazująca pozycję z cache do systemu nawigacji JavaScript
    // Wywoływana po załadowaniu strony, aby upewnić się, że pozycja z cache jest dostępna dla nawigacji
    private fun loadCachedLocationForNavigation() {
        val cachedLocation = loadCachedLocation()
        if (cachedLocation != null) {
            Log.d("CachedLocation", "Przekazywanie pozycji z cache: ${cachedLocation.first}, ${cachedLocation.second}")

            // Optymalizacja: tylko jedno przekazanie pozycji zamiast trzech
            updateNavigationWithLocation(cachedLocation.first, cachedLocation.second, "cache zoptymalizowane")

            println("Przekazano pozycję z cache do nawigacji: ${cachedLocation.first}, ${cachedLocation.second}")
        } else {
            Log.d("CachedLocation", "Brak pozycji w cache - nie można przekazać do nawigacji")
        }
    }

    // Funkcja pomocnicza do przekazywania pozycji do systemu nawigacji JavaScript
    // Ta funkcja zapewnia, że pozycja użytkownika jest natychmiast dostępna dla systemu nawigacji
    // bez konieczności czekania na nowe dane GPS
    private fun updateNavigationWithLocation(latitude: Double, longitude: Double, source: String) {
        // Wielokrotne próby przekazania pozycji dla maksymalnej niezawodności
        val jsCode = """
            try {
                // Metoda 1: Przez optiDrogApp.getMapManager
                if (window.optiDrogApp && window.optiDrogApp.getMapManager) {
                    const mapManager = window.optiDrogApp.getMapManager();
                    if (mapManager) {
                        mapManager.currentLat = $latitude;
                        mapManager.currentLng = $longitude;
                        console.log('Pozycja przekazana przez MapManager ($source):', $latitude, $longitude);
                    }
                }
                
                // Metoda 2: Bezpośrednio przez window.mapManager (fallback)
                if (window.mapManager) {
                    window.mapManager.currentLat = $latitude;
                    window.mapManager.currentLng = $longitude;
                    console.log('Pozycja przekazana przez window.mapManager ($source):', $latitude, $longitude);
                }
                
                // Metoda 3: Wywołanie funkcji aktualizacji pozycji jeśli istnieje
                if (typeof window.updateCurrentLocation === 'function') {
                    window.updateCurrentLocation($latitude, $longitude);
                    console.log('Pozycja przekazana przez updateCurrentLocation ($source):', $latitude, $longitude);
                }
                
                // Metoda 4: Zapisanie w localStorage jako backup
                localStorage.setItem('cachedLat', '$latitude');
                localStorage.setItem('cachedLng', '$longitude');
                localStorage.setItem('cachedLocationTimestamp', Date.now().toString());
                
                console.log('Pozycja z cache Android ($source) zapisana:', $latitude, $longitude);
            } catch (e) {
                console.error('Błąd podczas przekazywania pozycji z cache:', e);
            }
        """.trimIndent()

        webView.evaluateJavascript(jsCode, null)
    }

    // ===== PREMIUM & BILLING BRIDGE =====

    private fun pushPremiumStatusToWeb(status: PremiumStatus) {
        if (!::webView.isInitialized) return
        val statusJson = premiumStatusToJson(status)
        val jsCode = """
            (function(){
                if (window.premium && typeof window.premium.onStatusChanged === 'function') {
                    window.premium.onStatusChanged($statusJson);
                }
            })();
        """.trimIndent()
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }

    private fun premiumStatusToJson(status: PremiumStatus): String {
        val jsonObject = JSONObject().apply {
            put("isActive", status.isActive)
            if (status.productId != null) {
                put("productId", status.productId)
            } else {
                put("productId", JSONObject.NULL)
            }
            put("displayName", status.displayName)
            put("autoRenewing", status.autoRenewing)
            put("lastSyncedAt", status.lastSyncedAt)
            
            // Dodaj informacje o dacie wygaśnięcia
            put("expiryDateFormatted", status.expiryDateFormatted ?: JSONObject.NULL)
            put("estimatedExpiryDateFormatted", status.estimatedExpiryDateFormatted ?: JSONObject.NULL)
            put("isExpiringSoon", status.isExpiringSoon)
            put("purchaseTimeMillis", status.purchaseTimeMillis ?: JSONObject.NULL)
        }
        return jsonObject.toString()
    }

    fun getPremiumStatusJson(): String = premiumStatusToJson(currentPremiumStatus)

    /**
     * Otwiera stronę zarządzania subskrypcjami w Google Play.
     * Najpierw próbuje otworzyć w aplikacji Google Play, a jeśli się nie powiedzie,
     * otwiera stronę webową w przeglądarce.
     */
    fun openSubscriptionManagement() {
        try {
            // Najpierw spróbuj otworzyć stronę zarządzania subskrypcjami w aplikacji Google Play
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("https://play.google.com/store/account/subscriptions")
                setPackage("com.android.vending")
            }
            startActivity(intent)
            Log.d("MainActivity", "Otwarto stronę zarządzania subskrypcjami w Google Play")
        } catch (e: Exception) {
            try {
                // Fallback: otwórz w przeglądarce
                val webIntent = Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/account/subscriptions"))
                startActivity(webIntent)
                Log.d("MainActivity", "Otwarto stronę zarządzania subskrypcjami w przeglądarce")
            } catch (webException: Exception) {
                Log.e("MainActivity", "Nie udało się otworzyć strony zarządzania subskrypcjami", webException)
            }
        }
    }

    fun startPremiumPurchaseFlow(productId: String) {
        if (!::billingManager.isInitialized) {
            Log.w("MainActivity", "BillingManager nie jest gotowy - nie można rozpocząć zakupu")
            return
        }
        runOnUiThread {
            billingManager.launchPremiumPurchase(productId)
        }
    }

    fun requestPremiumRestore() {
        if (!::billingManager.isInitialized) return
        runOnUiThread {
            billingManager.restorePremium()
        }
    }

    /**
     * Przekazuje komunikat o wyniku operacji billing do JavaScript
     */
    private fun showBillingMessage(success: Boolean, message: String) {
        if (!::webView.isInitialized) return
        
        val escapedMessage = message
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\"", "\\\"")
        
        val jsCode = """
            (function(){
                if (window.premium && typeof window.premium.onBillingResult === 'function') {
                    window.premium.onBillingResult($success, '$escapedMessage');
                }
            })();
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }

    // ===== METODY ZARZĄDZANIA REKLAMAMI =====

    /**
     * Wyświetla reklamę z kontrolą częstotliwości
     */
    private fun showInterstitialAd() {
        Log.d("MainActivity", "🔄 Żądanie wyświetlenia reklamy")
        val adShown = adManager.showAd()
        
        if (!adShown) {
            val timeUntilNextAd = adManager.getTimeUntilNextAd() / 1000
            Log.d("MainActivity", "⏰ Reklama nie może być pokazana jeszcze przez ${timeUntilNextAd}s")
            
            webView.post {
                // Jeśli to była reklama nawigacji i nie można jej pokazać, kontynuuj bez reklamy
                if (isNavigationAd) {
                    Log.d("MainActivity", "⚠️ Reklama nawigacji nie może być pokazana - kontynuacja bez reklamy")
                    webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosed(); }", null)
                    isNavigationAd = false
                }
                // Jeśli to była reklama optymalizacji
                else if (isOptimizationAd) {
                    Log.d("MainActivity", "⚠️ Reklama optymalizacji nie może być pokazana - kontynuacja bez reklamy")
                    // Przekazujemy false, bo reklama nie została wyświetlona
                    webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosedForOptimize(false); }", null)
                    isOptimizationAd = false
                }
            }
        }
    }

    // Klasa interfejsu JavaScript
    class WebAppInterface(private val activity: MainActivity) {

        @android.webkit.JavascriptInterface
        fun processImageForOcr(base64Image: String) {
            Log.d("WebAppInterface", "Odebrano zdjęcie z galerii do OCR (length=${base64Image.length})")
            
            activity.runOnUiThread {
                try {
                    // Usuń prefix data:image/jpeg;base64, jeśli istnieje
                    val pureBase64 = if (base64Image.contains(",")) {
                        base64Image.substring(base64Image.indexOf(",") + 1)
                    } else {
                        base64Image
                    }

                    val decodedString = android.util.Base64.decode(pureBase64, android.util.Base64.DEFAULT)
                    val bitmap = android.graphics.BitmapFactory.decodeByteArray(decodedString, 0, decodedString.size)

                    if (bitmap != null) {
                        Log.d("WebAppInterface", "Bitmapa zdekodowana pomyślnie, uruchamiam OCR")
                        activity.runOcrFromGallery(bitmap)
                    } else {
                        Log.e("WebAppInterface", "Nie udało się zdekodować bitmapy")
                        activity.webView.evaluateJavascript("showCameraAnalysisError('Błąd dekodowania zdjęcia z galerii.');", null)
                    }
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd podczas przetwarzania zdjęcia z galerii: ${e.message}", e)
                    activity.webView.evaluateJavascript("showCameraAnalysisError('Wystąpił błąd podczas przygotowania zdjęcia: ${e.message}');", null)
                }
            }
        }

        // === ULUBIONE (Favorites) - zapis/odczyt przez SharedPreferences ===
        // Te metody umożliwiają trwałe przechowywanie listy ulubionych adresów po stronie Androida.
        // JS (favorites_manager.js) wywołuje je via Android.saveFavorites() / Android.loadFavorites().
        @android.webkit.JavascriptInterface
        fun saveFavorites(json: String): Boolean {
            return try {
                val prefs = activity.getSharedPreferences("OptiDrogData", Context.MODE_PRIVATE)
                prefs.edit().putString("favorites", json).apply()
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd zapisu ulubionych: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun loadFavorites(): String {
            return try {
                val prefs = activity.getSharedPreferences("OptiDrogData", Context.MODE_PRIVATE)
                prefs.getString("favorites", "[]") ?: "[]"
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd odczytu ulubionych: ${e.message}")
                "[]"
            }
        }

        // === PREMIUM & BILLING ===
        @android.webkit.JavascriptInterface
        fun startPremiumPurchase(productId: String): Boolean {
            return try {
                activity.startPremiumPurchaseFlow(productId)
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rozpoczęcia zakupu premium: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun restorePremium(): Boolean {
            return try {
                activity.requestPremiumRestore()
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas przywracania premium: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun getPremiumStatus(): String {
            return try {
                activity.getPremiumStatusJson()
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd pobierania statusu premium: ${e.message}")
                "{\"isActive\":false}"
            }
        }

        @android.webkit.JavascriptInterface
        fun manageSubscription(): Boolean {
            return try {
                activity.openSubscriptionManagement()
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas otwierania zarządzania subskrypcją: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun openGoogleMaps(latitude: Double, longitude: Double, address: String) {
            // Wywołaj nową metodę z pustymi ustawieniami paczki dla zachowania kompatybilności
            openGoogleMapsWithPackageSettings(latitude, longitude, address, "")
        }

        @android.webkit.JavascriptInterface
        fun openGoogleMapsWithPackageSettings(latitude: Double, longitude: Double, address: String, packageSettingsJson: String) {
            // Sprawdź czy adres to "Aktualna pozycja" - jeśli tak, nie uruchamiaj overlay
            if (address == "Aktualna pozycja") {
                Log.d("MainActivity", "[openGoogleMaps] Pomijanie overlay dla 'Aktualna pozycja' - uruchamianie tylko nawigacji")
                startNavigation(latitude, longitude)
                return
            }

            // Najpierw sprawdź uprawnienia do nakładki
            if (!OverlayService.canDrawOverlays(activity)) {
                activity.runOnUiThread {
                    AlertDialog.Builder(activity)
                        .setTitle("Potrzebne uprawnienie")
                        .setMessage("Aby wyświetlać adres podczas nawigacji, aplikacja potrzebuje uprawnienia do wyświetlania nad innymi aplikacjami. Czy chcesz przyznać to uprawnienie teraz?")
                        .setPositiveButton("Tak") { _, _ ->
                            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:${activity.packageName}"))
                            activity.startActivity(intent)
                        }
                        .setNegativeButton("Nie") { dialog, _ ->
                            dialog.dismiss()
                            startNavigation(latitude, longitude)
                        }
                        .show()
                }
            } else {
                // Uruchom usługę OverlayService tylko dla prawidłowych adresów (nie "Aktualna pozycja")
                Log.d("MainActivity", "[openGoogleMaps] Uruchamianie overlay dla adresu: $address")
                val overlayIntent = Intent(activity, OverlayService::class.java)
                overlayIntent.putExtra("address", address)
                overlayIntent.putExtra("latitude", latitude)
                overlayIntent.putExtra("longitude", longitude)

                // Przekazuj informacje o ustawieniach paczki tylko jeśli istnieją
                // Nie tworzymy domyślnego deliveryType, aby umożliwić ukrycie kontenera gdy brak danych
                val finalPackageSettings = if (packageSettingsJson.isNullOrEmpty() || packageSettingsJson == "null") {
                    "" // Pusty string zamiast domyślnych ustawień
                } else {
                    packageSettingsJson
                }
                
                overlayIntent.putExtra("packageSettings", finalPackageSettings)
                Log.d("MainActivity", "[openGoogleMaps] Przekazywanie ustawień paczki: $finalPackageSettings")

                activity.startService(overlayIntent)

                // Uruchom wybraną nawigację
                startNavigation(latitude, longitude)
            }
        }

        @android.webkit.JavascriptInterface
        fun openDiscordInvite() {
            Log.d("WebAppInterface", "Otwieranie zaproszenia do Discorda")
            try {
                // Używamy stałego ID serwera zamiast linku, który może wygasnąć
                // ID serwera: 1441149755525697588
                // Alternatywnie, można użyć trwałego linku zapraszającego:
                // 1. Otwórz ustawienia serwera Discord
                // 2. Przejdź do "Zaproszenia" (Invites)
                // 3. Stwórz nowe zaproszenie z ustawieniami: "Nigdy nie wygasa" (Never expire)
                // 4. Skopiuj wygenerowany link i użyj go zamiast ID serwera
                val serverId = "1441149755525697588" // ID Twojego serwera Discord (numeryczne)
                
                // Najpierw spróbuj otworzyć aplikację Discord za pomocą bezpośredniego ID serwera
                val discordIntent = Intent(Intent.ACTION_VIEW, Uri.parse("discord://discord.com/channels/$serverId"))
                discordIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                
                // Sprawdź czy jest aplikacja, która może obsłużyć ten intent
                val packageManager = activity.packageManager
                val activities = packageManager.queryIntentActivities(discordIntent, PackageManager.MATCH_DEFAULT_ONLY)
                
                if (activities.isNotEmpty()) {
                    // Znaleziono aplikację Discord - uruchom ją
                    activity.startActivity(discordIntent)
                    Log.d("WebAppInterface", "Aplikacja Discord uruchomiona pomyślnie")
                } else {
                    // Nie znaleziono aplikacji Discord - otwórz w przeglądarce z zaproszeniem
                    Log.d("WebAppInterface", "Aplikacja Discord nie znaleziona, otwieranie w przeglądarce")
                    val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://discord.gg/QCNRHSjt5D"))
                    webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(webIntent)
                }
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas otwierania Discorda: ${e.message}")
                // W przypadku błędu otwórz link w przeglądarce (fallback)
                try {
                    val fallbackIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://discord.gg/QCNRHSjt5D"))
                    fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(fallbackIntent)
                } catch (fallbackException: Exception) {
                    Log.e("WebAppInterface", "Błąd podczas otwierania zapasowego linku Discorda: ${fallbackException.message}")
                }
            }
        }

        fun startNavigation(latitude: Double, longitude: Double) {
            val sharedPreferences = activity.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
            val navigationApp = sharedPreferences.getString("navigationApp", "google-maps") ?: "google-maps"

            when (navigationApp) {
                "yanosik" -> {
                    try {
                        val yanosikUri = Uri.parse("geo:0,0?q=$latitude,$longitude")
                        val yanosikIntent = Intent(Intent.ACTION_VIEW, yanosikUri)
                        yanosikIntent.setPackage("pl.neptis.yanosik.mobi.android")
                        activity.startActivity(yanosikIntent)
                    } catch (e: Exception) {
                        val marketIntent = Intent(Intent.ACTION_VIEW,
                            Uri.parse("market://details?id=pl.neptis.yanosik.mobi.android"))
                        activity.startActivity(marketIntent)
                    }
                }
                "automapa" -> {
                    // Obsługa AutoMapa (pakiet: pl.aqurat.automapa)
                    // Strategia:
                    // 1) Spróbuj otworzyć przez geo:$lat,$lng z przypisanym pakietem AutoMapa
                    // 2) Fallback: google.navigation:q=$lat,$lng z setPackage na AutoMapa (jeśli wspiera zamiar)
                    // 3) Ostatecznie: przekierowanie do Google Play, aby zainstalować AutoMapa
                    try {
                        val geoUri = Uri.parse("geo:$latitude,$longitude")
                        val intent = Intent(Intent.ACTION_VIEW, geoUri)
                        intent.setPackage("pl.aqurat.automapa")
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) // Bezpiecznie uruchom nową aktywność
                        activity.startActivity(intent)
                    } catch (e: Exception) {
                        try {
                            val navUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                            val navIntent = Intent(Intent.ACTION_VIEW, navUri)
                            navIntent.setPackage("pl.aqurat.automapa")
                            navIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            activity.startActivity(navIntent)
                        } catch (e2: Exception) {
                            // Jeśli AutoMapa nie jest zainstalowana, otwórz stronę w Google Play
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=pl.aqurat.automapa"))
                            marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                "waze" -> {
                    try {
                        val wazeUri = Uri.parse("waze://?ll=$latitude,$longitude&navigate=yes")
                        val wazeIntent = Intent(Intent.ACTION_VIEW, wazeUri)
                        activity.startActivity(wazeIntent)
                    } catch (e: Exception) {
                        val marketIntent = Intent(Intent.ACTION_VIEW,
                            Uri.parse("market://details?id=com.waze"))
                        activity.startActivity(marketIntent)
                    }
                }
                "herewego" -> {
                    try {
                        // Próba uruchomienia nawigacji w HERE WeGo
                        val hereUri = Uri.parse("here.directions://v1.0/mylocation/$latitude,$longitude?m=w")
                        val hereIntent = Intent(Intent.ACTION_VIEW, hereUri)
                        hereIntent.setPackage("com.here.app.maps")
                        activity.startActivity(hereIntent)
                    } catch (e: Exception) {
                        try {
                            // Fallback - otwórz HERE WeGo z geo URI
                            val geoUri = Uri.parse("geo:$latitude,$longitude")
                            val geoIntent = Intent(Intent.ACTION_VIEW, geoUri)
                            geoIntent.setPackage("com.here.app.maps")
                            activity.startActivity(geoIntent)
                        } catch (e2: Exception) {
                            // Przekieruj do Google Play Store
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=com.here.app.maps"))
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                "osmand" -> {
                    try {
                        // Próba uruchomienia nawigacji w OsmAnd (darmowa wersja) z geo URI
                        val osmandUri = Uri.parse("geo:$latitude,$longitude")
                        val osmandIntent = Intent(Intent.ACTION_VIEW, osmandUri)
                        osmandIntent.setPackage("net.osmand")
                        activity.startActivity(osmandIntent)
                    } catch (e: Exception) {
                        try {
                            // Fallback - próba z google.navigation URI
                            val navUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                            val navIntent = Intent(Intent.ACTION_VIEW, navUri)
                            navIntent.setPackage("net.osmand")
                            activity.startActivity(navIntent)
                        } catch (e2: Exception) {
                            // Przekieruj do Google Play Store (darmowa wersja)
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=net.osmand"))
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                "osmandplus" -> {
                    try {
                        // Próba uruchomienia nawigacji w OsmAnd+ (płatna wersja) z geo URI
                        val osmandPlusUri = Uri.parse("geo:$latitude,$longitude")
                        val osmandPlusIntent = Intent(Intent.ACTION_VIEW, osmandPlusUri)
                        osmandPlusIntent.setPackage("net.osmand.plus")
                        activity.startActivity(osmandPlusIntent)
                    } catch (e: Exception) {
                        try {
                            // Fallback - próba z google.navigation URI
                            val navUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                            val navIntent = Intent(Intent.ACTION_VIEW, navUri)
                            navIntent.setPackage("net.osmand.plus")
                            activity.startActivity(navIntent)
                        } catch (e2: Exception) {
                            // Przekieruj do Google Play Store (płatna wersja)
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=net.osmand.plus"))
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                "magicearth" -> {
                    try {
                        // Próba uruchomienia nawigacji w Magic Earth
                        val magicEarthUri = Uri.parse("geo:$latitude,$longitude")
                        val magicEarthIntent = Intent(Intent.ACTION_VIEW, magicEarthUri)
                        magicEarthIntent.setPackage("com.generalmagic.magicearth")
                        activity.startActivity(magicEarthIntent)
                    } catch (e: Exception) {
                        try {
                            // Fallback - próba z google.navigation URI
                            val navUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                            val navIntent = Intent(Intent.ACTION_VIEW, navUri)
                            navIntent.setPackage("com.generalmagic.magicearth")
                            activity.startActivity(navIntent)
                        } catch (e2: Exception) {
                            // Przekieruj do Google Play Store
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=com.generalmagic.magicearth"))
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                "eurowagnavi" -> {
                    try {
                        // Próba uruchomienia nawigacji w Eurowag Navi (dawniej Road Lords)
                        val eurowagUri = Uri.parse("geo:$latitude,$longitude")
                        val eurowagIntent = Intent(Intent.ACTION_VIEW, eurowagUri)
                        eurowagIntent.setPackage("com.roadlords.android")
                        activity.startActivity(eurowagIntent)
                    } catch (e: Exception) {
                        try {
                            // Fallback - próba z google.navigation URI
                            val navUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                            val navIntent = Intent(Intent.ACTION_VIEW, navUri)
                            navIntent.setPackage("com.roadlords.android")
                            activity.startActivity(navIntent)
                        } catch (e2: Exception) {
                            // Przekieruj do Google Play Store
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=com.roadlords.android"))
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                "tomtomgo" -> {
                    try {
                        // Próba uruchomienia nawigacji w TomTom GO
                        val tomtomUri = Uri.parse("geo:$latitude,$longitude")
                        val tomtomIntent = Intent(Intent.ACTION_VIEW, tomtomUri)
                        tomtomIntent.setPackage("com.tomtom.gplay.navapp")
                        activity.startActivity(tomtomIntent)
                    } catch (e: Exception) {
                        try {
                            // Fallback - próba z google.navigation URI
                            val navUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                            val navIntent = Intent(Intent.ACTION_VIEW, navUri)
                            navIntent.setPackage("com.tomtom.gplay.navapp")
                            activity.startActivity(navIntent)
                        } catch (e2: Exception) {
                            // Przekieruj do Google Play Store
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=com.tomtom.gplay.navapp"))
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                "mapycz" -> {
                    try {
                        // Obsługa Mapy.cz (pakiet: cz.seznam.mapy)
                        // Strategia:
                        // 1) Próba uruchomienia nawigacji przez geo:$lat,$lng z przypisanym pakietem Mapy.cz
                        // 2) Fallback: google.navigation:q=$lat,$lng z setPackage na Mapy.cz
                        // 3) Przekierowanie do Google Play, aby zainstalować Mapy.cz
                        val mapyCzUri = Uri.parse("geo:$latitude,$longitude")
                        val mapyCzIntent = Intent(Intent.ACTION_VIEW, mapyCzUri)
                        mapyCzIntent.setPackage("cz.seznam.mapy")
                        mapyCzIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        activity.startActivity(mapyCzIntent)
                    } catch (e: Exception) {
                        try {
                            // Fallback - próba z google.navigation URI
                            val navUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                            val navIntent = Intent(Intent.ACTION_VIEW, navUri)
                            navIntent.setPackage("cz.seznam.mapy")
                            navIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            activity.startActivity(navIntent)
                        } catch (e2: Exception) {
                            // Przekieruj do Google Play Store
                            val marketIntent = Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=cz.seznam.mapy"))
                            marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            activity.startActivity(marketIntent)
                        }
                    }
                }
                else -> {
                    // Domyślnie: Google Maps
                    val gmmIntentUri = Uri.parse("google.navigation:q=$latitude,$longitude")
                    val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                    mapIntent.setPackage("com.google.android.apps.maps")

                    // Bezpieczna kontrola dostępności aktywności
                    if (mapIntent.resolveActivity(activity.packageManager) != null) {
                        activity.startActivity(mapIntent)
                    } else {
                        // Fallback do przeglądarki – otwórz trasę w webowej wersji Google Maps
                        val webIntent = Intent(Intent.ACTION_VIEW,
                            Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude"))
                        activity.startActivity(webIntent)
                    }
                }
            }
        }

        // Dodaj tę metodę do zapisywania adresów
        @android.webkit.JavascriptInterface
        fun saveAddresses(addressesJson: String) {
            Log.d("WebAppInterface", "Zapisywanie adresów: $addressesJson")
            try {
                // Sprawdźmy, czy JSON zawiera pola timeFrom i timeTo
                val jsonArray = JSONArray(addressesJson)
                for (i in 0 until jsonArray.length()) {
                    val address = jsonArray.getJSONObject(i)
                    val hasTimeFrom = address.has("timeFrom")
                    val hasTimeTo = address.has("timeTo")
                    val timeFrom = if (hasTimeFrom) address.getString("timeFrom") else ""
                    val timeTo = if (hasTimeTo) address.getString("timeTo") else ""
                    Log.d("WebAppInterface", "Adres ${i+1}: ${address.optString("address", "")}, " +
                            "timeFrom: $timeFrom, timeTo: $timeTo, " +
                            "hasTimeFrom: $hasTimeFrom, hasTimeTo: $hasTimeTo")
                }

                // Zapisz dane w SharedPreferences
                val sharedPreferences = activity.getSharedPreferences(activity.SHARED_PREFS_NAME, Context.MODE_PRIVATE)
                val editor = sharedPreferences.edit()
                editor.putString(activity.ADDRESSES_KEY, addressesJson)
                editor.apply()

                Log.d("WebAppInterface", "Adresy zapisane pomyślnie")
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas zapisywania adresów: ${e.message}", e)
            }
        }

        // Dodaj metodę do wyświetlania powiadomień Toast
        @android.webkit.JavascriptInterface
        fun showToast(message: String) {
            activity.runOnUiThread {
                // Usunięto Toast (zgodnie z wymaganiem)\n
            }
        }

        @android.webkit.JavascriptInterface
        fun saveNavigationApp(appName: String) {
            val sharedPreferences = activity.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
            sharedPreferences.edit().putString("navigationApp", appName).apply()
        }

        /**
         * Rejestruje żądanie reklamy przed optymalizacją trasy
         */
        @android.webkit.JavascriptInterface
        fun showAdAfterOptimize() {
            activity.runOnUiThread {
                activity.isOptimizationAd = true
                val adShown = activity.adManager.showAd()
                Log.d("WebAppInterface", "🔄 Reklama przed optymalizacją: ${if (adShown) "wyświetlona" else "pominięta (limit czasowy)"}")
                
                if (!adShown) {
                    activity.webView.post {
                        // Przekazujemy false do JS
                        activity.webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosedForOptimize(false); }", null)
                    }
                    activity.isOptimizationAd = false
                }
            }
        }

        /**
         * Proste wyświetlenie reklamy po optymalizacji (bez blokowania flow JS)
         */
        @android.webkit.JavascriptInterface
        fun showAdPostOptimize() {
            activity.runOnUiThread {
                Log.d("WebAppInterface", "🔄 Próba wyświetlenia reklamy po optymalizacji (fallback)")
                activity.adManager.showAd()
            }
        }

        /**
         * Wyświetla reklamę przed reoptymalizacją trasy (gdy użytkownik klika przycisk "Reoptymalizuj")
         * Działa podobnie jak showAdAfterOptimize, ale z osobną flagą dla analityki i logowania
         */
        @android.webkit.JavascriptInterface
        fun showAdAfterReoptimize() {
            activity.runOnUiThread {
                activity.isReoptimizationAd = true
                val adShown = activity.adManager.showAd()
                Log.d("WebAppInterface", "🔄 Reklama przed reoptymalizacją: ${if (adShown) "wyświetlona" else "pominięta (limit czasowy)"}")

                if (!adShown) {
                    activity.webView.post {
                        // Przekazujemy false do JS - reklama nie została wyświetlona
                        activity.webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosedForReoptimize(false); }", null)
                    }
                    activity.isReoptimizationAd = false
                }
            }
        }

        /**
         * Wyświetla reklamę po kliknięciu przycisku "Rozpocznij nawigację"
         */
        @android.webkit.JavascriptInterface
        fun showAdAfterStartNavigation() {
            activity.runOnUiThread {
                activity.isNavigationAd = true // Ustaw flagę przed wyświetleniem reklamy nawigacji
                val adShown = activity.adManager.showAd()
                Log.d("WebAppInterface", "🔄 Reklama nawigacyjna: ${if (adShown) "wyświetlona" else "pominięta (limit czasowy)"}")
                
                if (!adShown) {
                    // Jeśli reklama nie została pokazana, kontynuuj nawigację
                    activity.webView.post {
                        activity.webView.evaluateJavascript("if(window.navigationManager) { window.navigationManager.onAdClosed(); }", null)
                    }
                    activity.isNavigationAd = false
                }
            }
        }

        /**
         * Wyświetla reklamę po wyborze aplikacji nawigacyjnej w ustawieniach
         */
        @android.webkit.JavascriptInterface
        fun showAdAfterNavigationAppSelection() {
            activity.runOnUiThread {
                val adShown = activity.adManager.showAd()
                Log.d("WebAppInterface", "🔄 Reklama po wyborze nawigacji: ${if (adShown) "wyświetlona" else "pominięta (limit czasowy)"}")
            }
        }

        /**
         * Wyświetla reklamę po kliknięciu przycisku "Zapisz ustawienia"
         */
        @android.webkit.JavascriptInterface
        fun showAdAfterSaveSettings() {
            activity.runOnUiThread {
                val adShown = activity.adManager.showAd()
                Log.d("WebAppInterface", "🔄 Reklama po zapisie ustawień: ${if (adShown) "wyświetlona" else "pominięta (limit czasowy)"}")
            }
        }

        /**
         * Sprawdza dostępność rozpoznawania mowy
         */
        @android.webkit.JavascriptInterface
        fun checkSpeechRecognitionAvailability(): String {
            return activity.checkSpeechRecognitionAvailability()
        }

        /**
         * Zwraca szczegółową diagnostykę problemu z rozpoznawaniem mowy
         */
        @android.webkit.JavascriptInterface
        fun getSpeechRecognitionDiagnostics(): String {
            return activity.diagnoseSpeechRecognitionIssue()
        }

        /**
         * Otwiera Google Play Store z aplikacją Google
         */
        @android.webkit.JavascriptInterface
        fun openGooglePlayForGoogleApp() {
            activity.runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        data = Uri.parse("market://details?id=com.google.android.googlequicksearchbox")
                        setPackage("com.android.vending")
                    }
                    activity.startActivity(intent)
                } catch (e: Exception) {
                    // Jeśli nie można otworzyć sklepu Play, otwórz w przeglądarce
                    try {
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            data = Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.googlequicksearchbox")
                        }
                        activity.startActivity(intent)
                    } catch (browserError: Exception) {
                        Log.e("WebAppInterface", "Nie można otworzyć Google Play: ${browserError.message}")
                    }
                }
            }
        }

        /**
         * Rozpoczyna rozpoznawanie mowy
         */
        @android.webkit.JavascriptInterface
        fun startSpeechRecognition() {
            activity.runOnUiThread {
                activity.startSpeechRecognition()
            }
        }

        /**
         * Żąda uprawnień do rozpoznawania mowy
         */
        @android.webkit.JavascriptInterface
        fun requestMicrophonePermission() {
            Log.d("WebAppInterface", "Wywołano requestMicrophonePermission z JavaScript")
            activity.runOnUiThread {
                activity.requestAudioPermission()
            }
        }

        /**
         * Sprawdza dostępność aparatu
         */
        @android.webkit.JavascriptInterface
        fun checkCameraAvailability(): String {
            return activity.checkCameraAvailability()
        }

        /**
         * Otwiera aktywność aparatu
         */
        @android.webkit.JavascriptInterface
        fun openCamera() {
            // Domyślny tryb analizy AI
            activity.runOnUiThread {
                if (activity.checkCameraPermission()) {
                    val intent = Intent(activity, CameraActivity::class.java)
                    intent.putExtra("captureMode", "ai_analysis")
                    activity.cameraActivityResultLauncher.launch(intent)
                } else {
                    activity.requestCameraPermission()
                }
            }
        }

        /**
         * Otwiera aparat w trybie dodawania zdjęć do adresu (bez analizy AI)
         */
        @android.webkit.JavascriptInterface
        fun openCameraForAddressPhotos() {
            activity.runOnUiThread {
                if (activity.checkCameraPermission()) {
                    val intent = Intent(activity, CameraActivity::class.java)
                    intent.putExtra("captureMode", "address_photos") // Ustaw tryb dodawania zdjęć do adresu
                    activity.cameraActivityResultLauncher.launch(intent)
                } else {
                    activity.requestCameraPermission()
                }
            }
        }

        /**
         * Otwiera Photo Picker do wyboru zdjęć z galerii (nie wymaga uprawnień)
         */
        @android.webkit.JavascriptInterface
        fun openGallery() {
            activity.runOnUiThread {
                // Uruchom Photo Picker - automatyczny fallback do ACTION_OPEN_DOCUMENT na starszych wersjach
                activity.photoPickerLauncher.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            }
        }

        /**
         * Żąda uprawnień do aparatu
         */
        @android.webkit.JavascriptInterface
        fun requestCameraPermission() {
            Log.d("WebAppInterface", "Wywołano requestCameraPermission z JavaScript")
            activity.runOnUiThread {
                activity.requestCameraPermission()
            }
        }

        /**
         * Otwiera ustawienia aplikacji
         */
        @android.webkit.JavascriptInterface
        fun openAppSettings() {
            activity.runOnUiThread {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = Uri.fromParts("package", activity.packageName, null)
                activity.startActivity(intent)
            }
        }

        /**
         * Wyświetla reklamę po wyborze motywu aplikacji
         */
        @android.webkit.JavascriptInterface
        fun showAdAfterThemeSelection() {
            activity.runOnUiThread {
                val adShown = activity.adManager.showAd()
                Log.d("WebAppInterface", "🔄 Reklama po wyborze motywu: ${if (adShown) "wyświetlona" else "pominięta (limit czasowy)"}")
            }
        }
        
        /**
         * Sprawdza czy reklama jest gotowa do wyświetlenia
         */
        @android.webkit.JavascriptInterface
        fun isAdReady(): Boolean {
            return activity.adManager.isAdReady()
        }
        
        /**
         * Zwraca czas do następnego możliwego wyświetlenia reklamy (w sekundach)
         */
        @android.webkit.JavascriptInterface
        fun getTimeUntilNextAd(): Long {
            return activity.adManager.getTimeUntilNextAd() / 1000
        }

        /**
         * Zapisuje wybrany motyw aplikacji
         */
        @android.webkit.JavascriptInterface
        fun saveAppTheme(theme: String) {
            val sharedPreferences = activity.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
            sharedPreferences.edit().putString("appTheme", theme).apply()
        }

        /**
         * Pobiera zapisany motyw aplikacji
         */
        @android.webkit.JavascriptInterface
        fun getAppTheme(): String {
            val sharedPreferences = activity.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
            return sharedPreferences.getString("appTheme", "light") ?: "light"
        }

        @android.webkit.JavascriptInterface
        fun getNavigationApp(): String {
            val sharedPreferences = activity.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
            return sharedPreferences.getString("navigationApp", "google-maps") ?: "google-maps"
        }

        @android.webkit.JavascriptInterface
        fun saveRoute(routeData: String): Boolean {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogRoutes", Context.MODE_PRIVATE)
                val existingRoutes = sharedPref.getString("saved_routes", "[]")

                // Parse existing routes
                val routesArray = org.json.JSONArray(existingRoutes)
                val newRoute = org.json.JSONObject(routeData)

                // Add new route
                routesArray.put(newRoute)

                // Save back to preferences
                with(sharedPref.edit()) {
                    putString("saved_routes", routesArray.toString())
                    apply()
                }

                // Powiadom JS o aktualizacji danych
                activity.runOnUiThread {
                    activity.webView.evaluateJavascript("window.onStorageUpdated && window.onStorageUpdated('routes')", null)
                }

                true
            } catch (e: Exception) {
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun getSavedRoutes(): String {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogRoutes", Context.MODE_PRIVATE)
                sharedPref.getString("saved_routes", "[]") ?: "[]"
            } catch (e: Exception) {
                "[]"
            }
        }

        @android.webkit.JavascriptInterface
        fun deleteRoute(routeId: String): Boolean {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogRoutes", Context.MODE_PRIVATE)
                val existingRoutes = sharedPref.getString("saved_routes", "[]")

                // Parse existing routes
                val routesArray = org.json.JSONArray(existingRoutes)
                val newRoutesArray = org.json.JSONArray()

                // Copy all routes except the one to delete
                for (i in 0 until routesArray.length()) {
                    val route = routesArray.getJSONObject(i)
                    if (route.optString("id") != routeId) {
                        newRoutesArray.put(route)
                    }
                }

                // Save back to preferences
                with(sharedPref.edit()) {
                    putString("saved_routes", newRoutesArray.toString())
                    apply()
                }

                true
            } catch (e: Exception) {
                false
            }
        }

        // Sprawdzanie czy lokalizacja jest włączona
        @android.webkit.JavascriptInterface
        fun isLocationEnabled(): Boolean {
            val locationManager = activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }

        // Funkcja do czyszczenia historii adresów (odwiedzone i pominięte)
        @android.webkit.JavascriptInterface
        fun clearAddressHistory(): Boolean {
            return try {
                activity.clearAddressHistory()
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas czyszczenia historii adresów: ${e.message}")
                false
            }
        }

        // Sprawdzanie czy internet jest dostępny
        @android.webkit.JavascriptInterface
        fun isInternetAvailable(): Boolean {
            val connectivityManager = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val network = connectivityManager.activeNetwork ?: return false
                val networkCapabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
                return networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                        networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                        networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            } else {
                // Dla starszych wersji Android (poniżej API 23) używamy przestarzałego NetworkInfo
                @Suppress("DEPRECATION")
                val networkInfo: android.net.NetworkInfo? = connectivityManager.activeNetworkInfo
                @Suppress("DEPRECATION")
                return networkInfo?.isConnected == true
            }
        }

        // Sprawdzanie czy połączenie internetowe działa (uproszczona wersja)
        @android.webkit.JavascriptInterface
        fun isInternetConnected(): Boolean {
            return try {
                // Sprawdź podstawową dostępność sieci
                if (!isInternetAvailable()) {
                    Log.d("MainActivity", "Brak podstawowej dostępności sieci")
                    return false
                }

                // Dla aplikacji nawigacyjnej wystarczy sprawdzenie dostępności sieci
                // Ping może być blokowany przez niektóre sieci/firewalle
                Log.d("MainActivity", "Sieć jest dostępna - uznajemy za połączone")
                return true

            } catch (e: Exception) {
                Log.e("MainActivity", "Błąd podczas sprawdzania połączenia internetowego: ${e.message}")
                // W przypadku błędu, sprawdź tylko podstawową dostępność sieci
                return isInternetAvailable()
            }
        }

        // Sprawdzanie uprawnień do lokalizacji
        @android.webkit.JavascriptInterface
        fun hasLocationPermission(): Boolean {
            return ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }

        /**
         * Otwiera link w zewnętrznej przeglądarce
         */
        @android.webkit.JavascriptInterface
        fun openExternalUrl(url: String) {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                activity.startActivity(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        /**
         * Otwiera sklep Google Play z możliwością wystawienia oceny aplikacji.
         * Działa tak samo jak przycisk w modalu, który pokazuje się co 10 uruchomień.
         * Używane w sekcji Kontakt -> "Pomóż nam..."
         */
        @android.webkit.JavascriptInterface
        fun openPlayStoreForRating() {
            activity.runOnUiThread {
                try {
                    Log.d("WebAppInterface", "Otwieranie Sklepu Play dla oceny aplikacji")
                    
                    // Otwórz aplikację w Sklepie Play z parametrem hl=pl dla polskiego języka
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        data = Uri.parse("https://play.google.com/store/apps/details?id=${activity.packageName}&hl=pl")
                        setPackage("com.android.vending") // Otwórz bezpośrednio w aplikacji Google Play
                    }
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(intent)
                    
                    Log.d("WebAppInterface", "Sklep Play otwarty pomyślnie")
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd podczas otwierania Sklepu Play: ${e.message}")
                    
                    // Fallback - otwórz w przeglądarce jeśli aplikacja Google Play nie jest dostępna
                    try {
                        val webIntent = Intent(Intent.ACTION_VIEW).apply {
                            data = Uri.parse("https://play.google.com/store/apps/details?id=${activity.packageName}&hl=pl")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        activity.startActivity(webIntent)
                        Log.d("WebAppInterface", "Otwarto sklep Play w przeglądarce (fallback)")
                    } catch (e2: Exception) {
                        Log.e("WebAppInterface", "Błąd podczas otwierania w przeglądarce: ${e2.message}")
                    }
                }
            }
        }

        /**
         * Wysyła broadcast do aktualizacji pływającego okienka po przeniesieniu adresów
         */
        @android.webkit.JavascriptInterface
        fun sendBroadcast(broadcastData: String) {
            try {
                val json = org.json.JSONObject(broadcastData)
                val action = json.optString("action")
                val address = json.optString("address")
                val latitude = json.optDouble("latitude", 0.0)
                val longitude = json.optDouble("longitude", 0.0)

                when (action) {
                    "ACTION_UPDATE_OVERLAY_ADDRESS" -> {
                        // Wyślij broadcast do aktualizacji pływającego okienka
                        val intent = Intent("ACTION_UPDATE_OVERLAY_ADDRESS")
                        intent.putExtra("address", address)
                        intent.putExtra("latitude", latitude)
                        intent.putExtra("longitude", longitude)
                        // Dodaj ustawienia paczki jeśli są dostępne w danych broadcastu
                        val packageSettings = json.optString("packageSettings", "")
                        if (packageSettings.isNotEmpty()) {
                            intent.putExtra("packageSettings", packageSettings)
                            Log.d("WebAppInterface", "Dodano ustawienia paczki do broadcastu: $packageSettings")
                        }
                        intent.setPackage(activity.packageName)
                        activity.sendBroadcast(intent)
                    }
                    else -> {
                        Log.w("WebAppInterface", "Nieznana akcja broadcast: $action")
                    }
                }
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas wysyłania broadcast: ${e.message}")
            }
        }

        /**
         * Zapisuje zoptymalizowaną trasę w trwałym magazynie
         */
        @android.webkit.JavascriptInterface
        fun saveOptimizedRoute(routeData: String): Boolean {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                with(sharedPref.edit()) {
                    putString("optimized_route_data", routeData)
                    putLong("optimized_route_timestamp", System.currentTimeMillis())
                    apply()
                }
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas zapisywania zoptymalizowanej trasy: ${e.message}")
                false
            }
        }

        /**
         * Wczytuje zoptymalizowaną trasę z trwałego magazynu
         */
        @android.webkit.JavascriptInterface
        fun loadOptimizedRoute(): String {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                val routeData = sharedPref.getString("optimized_route_data", null)
                val timestamp = sharedPref.getLong("optimized_route_timestamp", 0)

                // Sprawdź czy dane nie są za stare (7 dni)
                val currentTime = System.currentTimeMillis()
                val maxAge = 7 * 24 * 60 * 60 * 1000L // 7 dni w milisekundach

                if (routeData != null && (currentTime - timestamp) < maxAge) {
                    return routeData
                } else {
                    // Wyczyść stare dane
                    with(sharedPref.edit()) {
                        remove("optimized_route_data")
                        remove("optimized_route_timestamp")
                        apply()
                    }
                    return "null"
                }
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas wczytywania zoptymalizowanej trasy: ${e.message}")
                return "null"
            }
        }

        /**
         * Czyści zoptymalizowaną trasę z trwałego magazynu
         */
        @android.webkit.JavascriptInterface
        fun clearOptimizedRoute(): Boolean {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                with(sharedPref.edit()) {
                    remove("optimized_route_data")
                    remove("optimized_route_timestamp")
                    remove("current_route_index")
                    apply()
                }

                // Powiadom JS o aktualizacji danych
                activity.runOnUiThread {
                    activity.webView.evaluateJavascript("window.onStorageUpdated && window.onStorageUpdated('navigation')", null)
                }

                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas czyszczenia zoptymalizowanej trasy: ${e.message}")
                false
            }
        }

        /**
         * Zapisuje dane nawigacji (currentRoute, currentRouteIndex) do trwałego magazynu
         */
        @android.webkit.JavascriptInterface
        fun saveNavigationData(navigationData: String): Boolean {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                val currentData = sharedPref.getString("navigation_data", null)

                // Zapisz tylko jeśli dane się zmieniły
                if (currentData != navigationData) {
                    with(sharedPref.edit()) {
                        putString("navigation_data", navigationData)
                        putLong("navigation_timestamp", System.currentTimeMillis())
                        apply()
                    }

                    // Powiadom JS o aktualizacji danych
                    activity.runOnUiThread {
                        activity.webView.evaluateJavascript("window.onStorageUpdated && window.onStorageUpdated('navigation')", null)
                    }
                }

                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas zapisywania danych nawigacji: ${e.message}")
                false
            }
        }

        /**
         * Wczytuje dane nawigacji z trwałego magazynu
         */
        @android.webkit.JavascriptInterface
        fun loadNavigationData(): String {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                val navigationData = sharedPref.getString("navigation_data", null)
                val timestamp = sharedPref.getLong("navigation_timestamp", 0)

                // Sprawdź czy dane nie są za stare (24 godziny)
                val currentTime = System.currentTimeMillis()
                val maxAge = 24 * 60 * 60 * 1000L // 24 godziny w milisekundach

                if (navigationData != null && (currentTime - timestamp) < maxAge) {
                    return navigationData
                } else {
                    // Wyczyść stare dane
                    with(sharedPref.edit()) {
                        remove("navigation_data")
                        remove("navigation_timestamp")
                        apply()
                    }
                    return "null"
                }
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas wczytywania danych nawigacji: ${e.message}")
                return "null"
            }
        }

        /**
         * Czyści dane nawigacji z trwałego magazynu
         */
        @android.webkit.JavascriptInterface
        fun clearNavigationData(): Boolean {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                with(sharedPref.edit()) {
                    remove("navigation_data")
                    remove("navigation_timestamp")
                    remove("current_route_index")
                    apply()
                }

                // Powiadom JS o aktualizacji danych
                activity.runOnUiThread {
                    activity.webView.evaluateJavascript("window.onStorageUpdated && window.onStorageUpdated('navigation')", null)
                }

                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas czyszczenia danych nawigacji: ${e.message}")
                false
            }
        }

        /**
         * Zapisuje aktualny indeks trasy
         */
        @android.webkit.JavascriptInterface
        fun saveCurrentRouteIndex(index: Int): Boolean {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                val currentIndex = sharedPref.getInt("current_route_index", -1)

                // Zapisz tylko jeśli indeks się zmienił
                if (currentIndex != index) {
                    with(sharedPref.edit()) {
                        putInt("current_route_index", index)
                        apply()
                    }

                    // Powiadom JS o aktualizacji danych
                    activity.runOnUiThread {
                        activity.webView.evaluateJavascript("window.onStorageUpdated && window.onStorageUpdated('navigation')", null)
                    }
                }

                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas zapisywania indeksu trasy: ${e.message}")
                false
            }
        }

        /**
         * Pobiera aktualny indeks trasy
         */
        @android.webkit.JavascriptInterface
        fun getCurrentRouteIndex(): Int {
            return try {
                val sharedPref = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                sharedPref.getInt("current_route_index", 0)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas pobierania indeksu trasy: ${e.message}")
                0
            }
        }

        /**
         * Zapisuje odwiedzony adres do zaszyfrowanego magazynu - WYŁĄCZONE
         */
        @android.webkit.JavascriptInterface
        fun saveVisitedAddress(address: String): Boolean {
            Log.d("WebAppInterface", "[DISABLED] Funkcja saveVisitedAddress została wyłączona - adres: $address")
            return true // Zwracamy true żeby nie powodować błędów w JS
        }

        /**
         * Pobiera listę odwiedzonych adresów z zaszyfrowanego magazynu - WYŁĄCZONE
         */
        @android.webkit.JavascriptInterface
        fun getVisitedAddresses(): String {
            Log.d("WebAppInterface", "[DISABLED] Funkcja getVisitedAddresses została wyłączona")
            return "[]" // Zwracamy pustą listę
        }

        /**
         * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
         */
        @android.webkit.JavascriptInterface
        fun saveSkippedAddress(address: String): Boolean {
            Log.d("WebAppInterface", "[saveSkippedAddress] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
            return true // Zwracamy true aby nie powodować błędów w JavaScript
        }

        /**
         * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
         */
        @android.webkit.JavascriptInterface
        fun getSkippedAddresses(): String {
            Log.d("WebAppInterface", "[getSkippedAddresses] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
            return "[]" // Zwracamy pustą tablicę aby nie powodować błędów w JavaScript
        }

        /**
         * Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
         */
        @android.webkit.JavascriptInterface
        fun clearAddressesData(): Boolean {
            Log.d("WebAppInterface", "[clearAddressesData] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
            return true // Zwracamy true aby nie powodować błędów w JavaScript
        }

        /**
         * Zoptymalizowana metoda czyszczenia wszystkich danych aplikacji
         * Łączy funkcjonalność clearOptimizedRoute, clearNavigationData i clearAddressesData
         */
        @android.webkit.JavascriptInterface
        fun clearAllAppData(): Boolean {
            return try {
                var success = true

                // Wyczyść dane zoptymalizowanej trasy
                try {
                    val optimizedRoutePrefs = activity.getSharedPreferences("OptiDrogOptimizedRoute", Context.MODE_PRIVATE)
                    with(optimizedRoutePrefs.edit()) {
                        remove("optimized_route_data")
                        remove("optimized_route_timestamp")
                        remove("navigation_data")
                        remove("navigation_timestamp")
                        remove("current_route_index")
                        apply()
                    }
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd podczas czyszczenia danych trasy: ${e.message}")
                    success = false
                }

                // Wyczyść dane adresów (odwiedzone i pominięte)
                try {
                    // Używamy nowoczesnego API SecurePreferencesManager zamiast przestarzałego EncryptedSharedPreferences
                    val securePrefs = SecurePreferencesManager(activity, "OptiDrogData")

                    // Usuwamy klucze z bezpiecznych preferencji
                    securePrefs.remove("VISITED_ADDRESSES_KEY")
                    securePrefs.remove("SKIPPED_ADDRESSES_KEY")
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd podczas czyszczenia danych adresów: ${e.message}")
                    success = false
                }

                // Wyczyść historię adresów z głównych preferencji
                try {
                    activity.clearAddressHistory()
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd podczas czyszczenia historii adresów: ${e.message}")
                    success = false
                }

                // Powiadom JavaScript o aktualizacji wszystkich danych
                if (success) {
                    activity.runOnUiThread {
                        activity.webView.evaluateJavascript("window.onStorageUpdated && window.onStorageUpdated('all')", null)
                    }
                }

                success
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas czyszczenia wszystkich danych aplikacji: ${e.message}")
                false
            }
        }

        // --- DODAJ PONIŻEJ --- //
        // === STATUSY ADRESÓW ===
        @android.webkit.JavascriptInterface
        fun saveAddressStatus(addressKey: String, status: String): Boolean {
            return try {
                val sharedPreferences = activity.getSharedPreferences("OptiDrogData", Context.MODE_PRIVATE)
                val currentStatusesJson = sharedPreferences.getString("address_statuses", "{}")
                val statuses = org.json.JSONObject(currentStatusesJson ?: "{}")
                statuses.put(addressKey, status)
                sharedPreferences.edit().putString("address_statuses", statuses.toString()).apply()
                Log.d("WebAppInterface", "Zapisano status adresu: $addressKey -> $status")
                // Zaktualizuj tekst przycisku nawigacji po zmianie statusu
                activity.runOnUiThread {
                    activity.webView.evaluateJavascript(
                        "if (window.navigationManager) { window.navigationManager.updateNavigationButtonText(); }",
                        null
                    )
                }
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas zapisywania statusu adresu: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun getAddressStatus(addressKey: String): String {
            return try {
                val sharedPreferences = activity.getSharedPreferences("OptiDrogData", Context.MODE_PRIVATE)
                val currentStatusesJson = sharedPreferences.getString("address_statuses", "{}")
                val statuses = org.json.JSONObject(currentStatusesJson ?: "{}")
                statuses.optString(addressKey, "BRAK")
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas pobierania statusu adresu: ${e.message}")
                "BRAK"
            }
        }

        @android.webkit.JavascriptInterface
        fun getAllAddressStatuses(): String {
            return try {
                val sharedPreferences = activity.getSharedPreferences("OptiDrogData", Context.MODE_PRIVATE)
                sharedPreferences.getString("address_statuses", "{}") ?: "{}"
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas pobierania wszystkich statusów adresów: ${e.message}")
                "{}"
            }
        }

        @android.webkit.JavascriptInterface
        fun removeAddressStatus(addressKey: String): Boolean {
            return try {
                val sharedPreferences = activity.getSharedPreferences("OptiDrogData", Context.MODE_PRIVATE)
                val currentStatusesJson = sharedPreferences.getString("address_statuses", "{}")
                val statuses = org.json.JSONObject(currentStatusesJson ?: "{}")
                statuses.remove(addressKey)
                sharedPreferences.edit().putString("address_statuses", statuses.toString()).apply()
                Log.d("WebAppInterface", "Usunięto status adresu: $addressKey")
                // Zaktualizuj tekst przycisku nawigacji po zmianie statusu
                activity.runOnUiThread {
                    activity.webView.evaluateJavascript(
                        "if (window.navigationManager) { window.navigationManager.updateNavigationButtonText(); }",
                        null
                    )
                }
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas usuwania statusu adresu: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun clearAllAddressStatuses(): Boolean {
            return try {
                val sharedPreferences = activity.getSharedPreferences("OptiDrogData", Context.MODE_PRIVATE)
                sharedPreferences.edit().putString("address_statuses", "{}").apply()
                Log.d("WebAppInterface", "Wyczyszczono wszystkie statusy adresów")
                // Zaktualizuj tekst przycisku nawigacji po wyczyszczeniu statusów
                activity.runOnUiThread {
                    activity.webView.evaluateJavascript(
                        "if (window.navigationManager) { window.navigationManager.updateNavigationButtonText(); }",
                        null
                    )
                }
                true
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas czyszczenia wszystkich statusów adresów: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun setEarlyAccessNoticeClosed() {
            try {
                val sharedPreferences = activity.getSharedPreferences("OptiDrogPrefs", Context.MODE_PRIVATE)
                sharedPreferences.edit().putBoolean("earlyAccessNoticeClosed", true).apply()
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas zapisu earlyAccessNoticeClosed: ${e.message}", e)
            }
        }

        @android.webkit.JavascriptInterface
        fun isEarlyAccessNoticeClosed(): Boolean {
            return try {
                val sharedPreferences = activity.getSharedPreferences("OptiDrogPrefs", Context.MODE_PRIVATE)
                sharedPreferences.getBoolean("earlyAccessNoticeClosed", false)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd podczas odczytu earlyAccessNoticeClosed: ${e.message}", e)
                false
            }
        }

        // === HISTORIA PRZEJAZDÓW ===

        /**
         * Sprawdza czy historia przejazdów jest włączona.
         * Domyślnie wyłączona (false) przy pierwszej instalacji aplikacji.
         * Użytkownik może włączyć historię w ustawieniach aplikacji.
         */
        @android.webkit.JavascriptInterface
        fun isRideHistoryEnabled(): Boolean {
            val sharedPreferences = activity.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
            return sharedPreferences.getBoolean("ride_history_enabled", false)
        }

        /**
         * Ustawia stan historii przejazdów.
         * @param enabled true - włącz historię, false - wyłącz
         */
        @android.webkit.JavascriptInterface
        fun setRideHistoryEnabled(enabled: Boolean) {
            val sharedPreferences = activity.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
            sharedPreferences.edit().putBoolean("ride_history_enabled", enabled).apply()
            
            // Jeśli wyłączono historię, zamknij bieżący przejazd jeśli istnieje
            if (!enabled) {
                try {
                    val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                    store.closeCurrentRide("history_disabled")
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd zamykania przejazdu: ${e.message}")
                }
            }
            
            Log.d("WebAppInterface", "Historia przejazdów: ${if (enabled) "WŁĄCZONA" else "WYŁĄCZONA"}")
        }

        @android.webkit.JavascriptInterface
        fun rhStartRide(payloadJson: String): String {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                val payload = org.json.JSONObject(payloadJson)
                val optimizeClickedTs = payload.optLong("optimizeClickedTs", System.currentTimeMillis())
                val pointsSnapshot = payload.optJSONArray("pointsSnapshot") ?: org.json.JSONArray()
                store.startRide(pointsSnapshot.toString(), optimizeClickedTs)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhStartRide: ${e.message}")
                ""
            }
        }

        @android.webkit.JavascriptInterface
        fun rhCloseCurrentRide(): Boolean {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.closeCurrentRide("manual")
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhCloseCurrentRide: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun rhGetRidesLast30Days(): String {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.getRidesLast30Days()
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhGetRidesLast30Days: ${e.message}")
                "[]"
            }
        }

        @android.webkit.JavascriptInterface
        fun rhGetRide(rideId: String): String {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.getRide(rideId)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhGetRide: ${e.message}")
                "{}"
            }
        }

        @android.webkit.JavascriptInterface
        fun rhGetTrackChunk(chunkKey: String): String {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.getTrackChunk(chunkKey)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhGetTrackChunk: ${e.message}")
                "[]"
            }
        }

        @android.webkit.JavascriptInterface
        fun rhDeleteRide(rideId: String): Boolean {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.deleteRide(rideId)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhDeleteRide: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun rhCleanupOldRides(): Int {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.cleanupOldRides()
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhCleanupOldRides: ${e.message}")
                0
            }
        }

        @android.webkit.JavascriptInterface
        fun rhRecordPointAction(pointId: String, action: String): Boolean {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.recordPointAction(pointId, action, System.currentTimeMillis())
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhRecordPointAction: ${e.message}")
                false
            }
        }

        /**
         * Usuwa wszystkie akcje dla punktu z historii przejazdów.
         * Wywoływane gdy status adresu jest resetowany do "BRAK".
         */
        @android.webkit.JavascriptInterface
        fun rhRemovePointAction(pointId: String): Boolean {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                store.removePointAction(pointId)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhRemovePointAction: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun rhUpdatePointsSnapshot(payloadJson: String): Boolean {
            return try {
                val store = pl.optidrog.app.history.RideHistoryStore.getInstance(activity)
                val payload = org.json.JSONObject(payloadJson)
                val silentOptimizeTs = payload.optLong("silentOptimizeTs", System.currentTimeMillis())
                val pointsSnapshot = payload.optJSONArray("pointsSnapshot") ?: org.json.JSONArray()
                store.updatePointsSnapshot(pointsSnapshot.toString(), silentOptimizeTs)
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Błąd rhUpdatePointsSnapshot: ${e.message}")
                false
            }
        }

        @android.webkit.JavascriptInterface
        fun shareText(text: String, title: String) {
            activity.runOnUiThread {
                try {
                    val sendIntent: Intent = Intent().apply {
                        action = Intent.ACTION_SEND
                        putExtra(Intent.EXTRA_TEXT, text)
                        putExtra(Intent.EXTRA_TITLE, title)
                        type = "text/plain"
                    }

                    val shareIntent = Intent.createChooser(sendIntent, title)
                    activity.startActivity(shareIntent)
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd shareText: ${e.message}")
                }
            }
        }

        @android.webkit.JavascriptInterface
        fun shareFile(content: String, fileName: String) {
            activity.runOnUiThread {
                try {
                    val cacheDir = activity.cacheDir
                    val file = File(cacheDir, fileName)
                    FileOutputStream(file).use { 
                        it.write(content.toByteArray(Charsets.UTF_8))
                    }

                    val uri = FileProvider.getUriForFile(
                        activity,
                        "${activity.packageName}.fileprovider",
                        file
                    )

                    val sendIntent = Intent().apply {
                        action = Intent.ACTION_SEND
                        putExtra(Intent.EXTRA_STREAM, uri)
                        type = "text/csv"
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }

                    val shareIntent = Intent.createChooser(sendIntent, "Zapisz lub udostępnij raport")
                    activity.startActivity(shareIntent)
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd shareFile: ${e.message}")
                }
            }
        }

        @android.webkit.JavascriptInterface
        fun saveReportCsv(content: String, fileName: String) {
            activity.runOnUiThread {
                try {
                    activity.pendingCsvContent = content
                    activity.createCsvLauncher.launch(fileName)
                } catch (e: Exception) {
                    Log.e("WebAppInterface", "Błąd saveReportCsv: ${e.message}")
                }
            }
        }



    }

    // Nowa metoda do uruchamiania nawigacji Google Maps
    fun startGoogleMapsNavigation(latitude: Double, longitude: Double) {
        // Tworzenie URI dla Google Maps z podanymi współrzędnymi
        val gmmIntentUri = Uri.parse("google.navigation:q=$latitude,$longitude")

        // Tworzenie Intentu do otwarcia Google Maps
        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)

        // Ustawienie pakietu, aby upewnić się, że otwiera się aplikacja Google Maps
        mapIntent.setPackage("com.google.android.apps.maps")

        // Sprawdzenie, czy aplikacja Google Maps jest zainstalowana i można uruchomić Intent
        if (mapIntent.resolveActivity(packageManager) != null) {
            startActivity(mapIntent)
        } else {
            // Jeśli aplikacja Google Maps nie jest zainstalowana, możesz otworzyć w przeglądarce
            val webIntent = Intent(Intent.ACTION_VIEW,
                Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude"))
            startActivity(webIntent)
        }
    }

    // Inicjalizacja WakeLock - zapobiega blokowaniu ekranu podczas działania aplikacji
    // Używamy PARTIAL_WAKE_LOCK zamiast przestarzałego FULL_WAKE_LOCK
    private fun initializeWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "OptiDrog::ScreenWakeLock"
        )
    }

    // Aktywacja WakeLock - zapobiega blokowaniu ekranu
    private fun acquireWakeLock() {
        try {
            if (wakeLock?.isHeld != true) {
                // Ustaw limit czasowy na 10 minut dla bezpieczeństwa i oszczędności baterii
                wakeLock?.acquire(10 * 60 * 1000L) // 10 minut
                Log.d("MainActivity", "WakeLock aktywowany na 10 minut - ekran nie będzie się blokować")
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Błąd podczas aktywacji WakeLock: ${e.message}")
        }
    }

    // Zwolnienie WakeLock - pozwala na normalne blokowanie ekranu
    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d("MainActivity", "WakeLock zwolniony - ekran może się normalnie blokować")
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Błąd podczas zwalniania WakeLock: ${e.message}")
        }
    }

    // Sprawdzenie czy OverlayService jest uruchomiony
    private fun isOverlayServiceRunning(): Boolean {
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        @Suppress("DEPRECATION")
        for (service in activityManager.getRunningServices(Integer.MAX_VALUE)) {
            if (OverlayService::class.java.name == service.service.className) {
                return true
            }
        }
        return false
    }

    override fun onResume() {
        super.onResume()
        // Nie zamykamy już pływającego okienka gdy wracamy do aplikacji
        // Usunięto kod zamykający overlay

        // Zapewnij spójne zachowanie pasków systemowych po powrocie do aplikacji
        if (Build.VERSION.SDK_INT < 29) { // Tylko dla Androida 14 i starszych
            // Dla starszych wersji przywróć ustawienia pasków systemowych
            val windowInsetsController = WindowInsetsControllerCompat(window, window.decorView)
            windowInsetsController.show(WindowInsetsCompat.Type.systemBars())
            windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
            Log.d(TAG_EDGE, "Android ${Build.VERSION.SDK_INT} - restored system bars visibility")
        }
        
        // ZOPTYMALIZOWANE: Resetuj cache w JavaScript tylko jeśli to konieczne
        // Sprawdź czy aplikacja była w tle dłużej niż 30 sekund
        val currentTime = System.currentTimeMillis()
        val lastPauseTime = getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
            .getLong("last_pause_time", 0)

        if (currentTime - lastPauseTime > 30000) { // 30 sekund
            webView.evaluateJavascript(
                "if(typeof navigationManager !== 'undefined' && navigationManager.resetCache) { navigationManager.resetCache(); }",
                null
            )
        }

        // Aktywuj WakeLock gdy aplikacja jest aktywna
        acquireWakeLock()

        // Uruchom ciągłe śledzenie lokalizacji w tle
        // To zapewnia, że pozycja jest zawsze aktualna i dostępna w cache
        startContinuousLocationTracking()

        // ZOPTYMALIZOWANE: Przekaż pozycję z cache tylko raz
        loadCachedLocationForNavigation()

        if (::billingManager.isInitialized) {
            billingManager.restorePremium()
        }

        // Sprawdź czy należy wyświetlić okienko oceny aplikacji (gdy Activity jest gotowa)
        AppRatingManager.getInstance(this).checkAndShowRatingDialogIfNeeded()
    }

    // Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
    private fun saveVisitedAddress(address: String) {
        Log.d("MainActivity", "[saveVisitedAddress] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
    }

    // Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
    fun getVisitedAddresses(): Set<String> {
        Log.d("MainActivity", "[getVisitedAddresses] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
        return emptySet()
    }

    // Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
    private fun saveSkippedAddress(address: String) {
        Log.d("MainActivity", "[saveSkippedAddress] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
    }

    // Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
    fun getSkippedAddresses(): Set<String> {
        Log.d("MainActivity", "[getSkippedAddresses] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
        return emptySet()
    }

    // Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
    fun clearAddressHistory() {
        Log.d("MainActivity", "[clearAddressHistory] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
    }

    // Funkcja wyłączona - statusy adresów zostały usunięte z aplikacji
    private fun isAddressProcessed(address: String): String? {
        Log.d("MainActivity", "[isAddressProcessed] WYŁĄCZONE - funkcjonalność statusów adresów została usunięta")
        return null
    }

    // onActivityResult zostało zastąpione przez ActivityResultLauncher (cameraActivityResultLauncher)

    override fun onPause() {
        super.onPause()

        // ZOPTYMALIZOWANE: Zapisz czas wejścia w tło dla optymalizacji onResume
        getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_pause_time", System.currentTimeMillis())
            .apply()

        // Zwolnij WakeLock gdy aplikacja przechodzi w tło (ale tylko jeśli overlay nie jest aktywny)
        if (!isOverlayServiceRunning()) {
            releaseWakeLock()
        }

        // Nie zatrzymuj śledzenia lokalizacji w onPause
        // Pozwala to na ciągłe aktualizowanie cache nawet gdy aplikacja jest w tle
        // Śledzenie zostanie zatrzymane tylko w onDestroy
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        
        // Zapewnij spójne zachowanie pasków systemowych po zmianie konfiguracji
        // Użyj tej samej optymalizowanej metody co w onCreate
        setupWindowInsetsListener()
        
        // Wymuś natychmiastową aktualizację Insetsów po zmianie konfiguracji
        window.decorView.post {
            forceInsetsUpdate()
        }
        
        // Odśwież WebView po zmianie konfiguracji
        webView.post {
            webView.reload()
        }
    }
    
    // ===== METODY POMOCNICZE DO OBSŁUGI WINDOW INSETS =====
    
    /**
     * Konfiguruje listener dla WindowInsets z optymalizacją i obsługą cutouts
     * Obsługuje zarówno systemBars (status bar / nav bar) jak i ime (klawiatura)
     * Ta metoda jest używana zarówno w onCreate jak i w onConfigurationChanged
     */
    private fun setupWindowInsetsListener() {
        val isEdgeToEdgeSupported = Build.VERSION.SDK_INT >= 29 // Android 10+
        val webView = findViewById<WebView>(R.id.webview)
        val density = resources.displayMetrics.density // np. 3.75
        
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { view, windowInsets ->
            // Obsługa systemowych pasków (status bar / nav bar) oraz wycięć (cutouts)
            val systemBarsInsets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            val displayCutoutInsets = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout())
            
            // Górny margines to suma paska statusu i ewentualnego wycięcia (notch)
            val topBarPx = maxOf(systemBarsInsets.top, displayCutoutInsets.top)
            val bottomBarPx = systemBarsInsets.bottom // fizyczne piksele
            val topCssPx = (topBarPx / density).toInt()
            val bottomCssPx = (bottomBarPx / density).toInt()

            Log.d("MainActivity", "Insetsy systemowe (px): góra=$topBarPx (z cutout), dół=$bottomBarPx")
            Log.d("MainActivity", "Gęstość ekranu: $density")
            Log.d("MainActivity", "Insetsy po konwersji (CSS px/dp): góra=$topCssPx, dół=$bottomCssPx")

            cachedInsets = systemBarsInsets
            lastInsetsTimestamp = System.currentTimeMillis()

            // Obsługa klawiatury (IME - Input Method Editor) - dostępne od API 30
            var keyboardHeightCssPx = 0
            if (Build.VERSION.SDK_INT >= 30) {
                try {
                    val imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
                    val keyboardHeightPx = imeInsets.bottom // fizyczne piksele klawiatury
                    keyboardHeightCssPx = (keyboardHeightPx / density).toInt()
                    Log.d("MainActivity", "Wysokość klawiatury (px): $keyboardHeightPx, po konwersji: $keyboardHeightCssPx CSS px")
                } catch (e: Exception) {
                    Log.e("MainActivity", "Błąd pobierania IME insets: ${e.message}")
                }
            }

            val javascriptCode = """
                if (window.setSystemBarsInsets) {
                    window.setSystemBarsInsets($topCssPx, $bottomCssPx);
                } else {
                    console.warn('Funkcja window.setSystemBarsInsets nie jest jeszcze zdefiniowana.');
                }
                if (window.setKeyboardHeight) {
                    window.setKeyboardHeight($keyboardHeightCssPx);
                } else {
                    console.warn('Funkcja window.setKeyboardHeight nie jest jeszcze zdefiniowana.');
                }
            """.trimIndent()

            webView.evaluateJavascript(javascriptCode, null)

            WindowInsetsCompat.CONSUMED
        }
    }
    
    /**
     * Czyści cache WindowInsets i zwalnia zasoby
     */
    private fun cleanupWindowInsetsCache() {
        cachedInsets = null
        lastInsetsTimestamp = 0L
        Log.d(TAG_EDGE, "WindowInsets cache cleaned up")
    }

    /**
     * Wymusza aktualizację Insetsów i przekazanie do JavaScript
     * Używane przy zmianach stron i orientacji ekranu
     * Uniwersalna metoda dla wszystkich wersji API dzięki ViewCompat
     */
    private fun forceInsetsUpdate() {
        cachedInsets?.let { insets ->
            // Konwersja na dp / CSS px
            val density = resources.displayMetrics.density
            
            // Pobierz WindowInsets - uniwersalna metoda dla WSZYSTKICH wersji API
            // ViewCompat obsługuje kompatybilność w tle dla każdej wersji Android
            val windowInsets = ViewCompat.getRootWindowInsets(window.decorView) ?: return@let
            
            // Pobierz insety systemowe i dla notcha/display cutout
            val systemBarsInsets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            val displayCutoutInsets = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout())
            
            // Oblicz wysokości w pixelach
            val topBarPx = maxOf(systemBarsInsets.top, displayCutoutInsets.top)
            val bottomBarPx = systemBarsInsets.bottom
            val topCssPx = (topBarPx / density).toInt()
            val bottomCssPx = (bottomBarPx / density).toInt()

            Log.d(TAG_EDGE, "Wymuszono aktualizację Insetsów: góra=${topCssPx}px, dół=${bottomCssPx}px")

            // Prześlij obliczone wartości do JavaScript
            val javascriptCode = """
                if (window.setSystemBarsInsets) {
                    window.setSystemBarsInsets($topCssPx, $bottomCssPx);
                } else {
                    console.warn('Funkcja window.setSystemBarsInsets nie jest jeszcze zdefiniowana.');
                }
            """.trimIndent()

            webView.evaluateJavascript(javascriptCode, null)
        }
    }

    // ===== ROZPOZNAWANIE MOWY =====

    /**
     * Sprawdza uprawnienia do nagrywania dźwięku
     */
    private fun checkAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Żąda uprawnień do nagrywania dźwięku
     */
    private fun requestAudioPermission() {
        Log.d("MainActivity", "Żądanie uprawnień do nagrywania dźwięku...")

        // Sprawdź aktualny stan uprawnień
        val currentPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        Log.d("MainActivity", "Aktualny stan uprawnień RECORD_AUDIO: $currentPermission")

        when {
            currentPermission == PackageManager.PERMISSION_GRANTED -> {
                Log.d("MainActivity", "Uprawnienia już przyznane!")
                // Przekaż informację do JavaScript o przyznaniu uprawnień
                webView.evaluateJavascript(
                    "window.speechRecognitionPermissionResult && window.speechRecognitionPermissionResult('granted');",
                    null
                )
            }
            else -> {
                // Bezpośrednio żądaj uprawnień - tak samo jak dla lokalizacji
                Log.d("MainActivity", "Żądanie uprawnień do mikrofonu...")
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.RECORD_AUDIO),
                    AUDIO_PERMISSION_REQUEST_CODE
                )
            }
        }
    }

    /**
     * Sprawdza czy rozpoznawanie mowy jest dostępne i gotowe do użycia
     * Zwraca: "available" - dostępne, "no_permission" - brak uprawnień, "not_available" - niedostępne
     */
    fun checkSpeechRecognitionAvailability(): String {
        // Sprawdź uprawnienia
        if (!checkAudioPermission()) {
            return "no_permission"
        }

        // Sprawdź czy rozpoznawanie mowy jest dostępne
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            return "not_available"
        }

        return "available"
    }

    /**
     * Diagnozuje szczegółową przyczynę niedostępności rozpoznawania mowy
     * Zwraca szczegółowy komunikat dla użytkownika z instrukcjami naprawy
     */
    private fun diagnoseSpeechRecognitionIssue(): String {
        val packageManager = packageManager
        
        // Sprawdź czy aplikacja Google jest zainstalowana
        val googleAppInstalled = try {
            packageManager.getPackageInfo("com.google.android.googlequicksearchbox", 0)
            true
        } catch (e: Exception) {
            false
        }

        // Sprawdź połączenie z internetem
        val hasInternet = try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val network = connectivityManager.activeNetwork
                val capabilities = connectivityManager.getNetworkCapabilities(network)
                capabilities != null && (
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                )
            } else {
                @Suppress("DEPRECATION")
                val networkInfo = connectivityManager.activeNetworkInfo
                networkInfo != null && networkInfo.isConnected
            }
        } catch (e: Exception) {
            false
        }

        // Zbuduj komunikat diagnostyczny
        return when {
            !googleAppInstalled -> 
                "Rozpoznawanie mowy nie jest dostępne.\n\n" +
                "Możliwe przyczyny:\n" +
                "• Brak aplikacji Google (Google App)\n" +
                "• Wyłączone usługi Google\n\n" +
                "Rozwiązanie:\n" +
                "1. Zainstaluj aplikację Google z Google Play\n" +
                "2. Upewnij się, że usługi Google są włączone\n" +
                "3. Zaloguj się na konto Google"
            
            !hasInternet ->
                "Rozpoznawanie mowy wymaga połączenia z internetem.\n\n" +
                "Rozwiązanie:\n" +
                "1. Włącz Wi-Fi lub dane mobilne\n" +
                "2. Sprawdź czy masz połączenie z internetem\n" +
                "3. Spróbuj ponownie"
            
            else ->
                "Rozpoznawanie mowy nie jest obsługiwane na tym urządzeniu.\n\n" +
                "Możliwe przyczyny:\n" +
                "• Nieaktualna wersja aplikacji Google\n" +
                "• Brak konta Google\n" +
                "• Ograniczenia regionalne\n" +
                "• Wyłączone usługi Google\n\n" +
                "Rozwiązanie:\n" +
                "1. Zaktualizuj aplikację Google\n" +
                "2. Sprawdź czy jesteś zalogowany na konto Google\n" +
                "3. Włącz usługi Google w ustawieniach\n" +
                "4. Sprawdź ustawienia języka i regionu"
        }
    }

    /**
     * Rozpoczyna rozpoznawanie mowy
     */
    fun startSpeechRecognition() {
        // Sprawdź dostępność rozpoznawania mowy
        val availability = checkSpeechRecognitionAvailability()

        when (availability) {
            "no_permission" -> {
                // Przekaż informację do JavaScript o braku uprawnień
                webView.evaluateJavascript(
                    "window.speechRecognitionPermissionResult && window.speechRecognitionPermissionResult('no_permission');",
                    null
                )
                // Żądaj uprawnień tylko raz
                requestAudioPermission()
                return
            }
            "not_available" -> {
                // Diagnozuj szczegółową przyczynę i wyświetl dialog
                val diagnosticMessage = diagnoseSpeechRecognitionIssue()
                
                runOnUiThread {
                    AlertDialog.Builder(this)
                        .setTitle("Rozpoznawanie mowy niedostępne")
                        .setMessage(diagnosticMessage)
                        .setPositiveButton("OK") { dialog, _ ->
                            dialog.dismiss()
                        }
                        .setNeutralButton("Otwórz Google Play") { _, _ ->
                            // Otwórz Google Play z aplikacją Google
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.googlequicksearchbox"))
                                startActivity(intent)
                            } catch (e: Exception) {
                                // Fallback do przeglądarki
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.googlequicksearchbox"))
                                startActivity(intent)
                            }
                        }
                        .show()
                }
                
                // Przekaż informację do JavaScript o niedostępności
                webView.evaluateJavascript(
                    "window.speechRecognitionPermissionResult && window.speechRecognitionPermissionResult('not_available');",
                    null
                )
                return
            }
        }

        try {
            // Inicjalizuj SpeechRecognizer
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
            speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    // Usunięto Toast (zgodnie z wymaganiem)\n
                }

                override fun onBeginningOfSpeech() {
                    // Rozpoczęcie mówienia
                }

                override fun onRmsChanged(rmsdB: Float) {
                    // Zmiana głośności - można użyć do wizualizacji
                }

                override fun onBufferReceived(buffer: ByteArray?) {
                    // Otrzymano bufor audio
                }

                override fun onEndOfSpeech() {
                    // Zakończenie mówienia
                }

                override fun onError(error: Int) {
                    // Szczegółowe komunikaty błędów z instrukcjami dla użytkownika
                    val errorMessage = when (error) {
                        SpeechRecognizer.ERROR_AUDIO -> 
                            "Błąd audio - sprawdź czy mikrofon działa poprawnie"
                        
                        SpeechRecognizer.ERROR_CLIENT -> 
                            "Błąd aplikacji - spróbuj ponownie"
                        
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> 
                            "Brak uprawnień do mikrofonu - włącz uprawnienia w ustawieniach"
                        
                        SpeechRecognizer.ERROR_NETWORK -> 
                            "Brak połączenia z internetem - sprawdź połączenie i spróbuj ponownie"
                        
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> 
                            "Przekroczono limit czasu - sprawdź połączenie z internetem"
                        
                        SpeechRecognizer.ERROR_NO_MATCH -> 
                            "Nie rozpoznano mowy - spróbuj mówić głośniej i wyraźniej"
                        
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> 
                            "Rozpoznawanie zajęte - poczekaj chwilę i spróbuj ponownie"
                        
                        SpeechRecognizer.ERROR_SERVER -> 
                            "Błąd serwera Google - spróbuj ponownie za chwilę"
                        
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> 
                            "Nie wykryto mowy - spróbuj ponownie i mów głośniej"
                        
                        else -> 
                            "Nieznany błąd - sprawdź czy aplikacja Google jest zainstalowana i zaktualizowana"
                    }
                    
                    Log.e("SpeechRecognition", "Błąd rozpoznawania mowy: kod=$error, komunikat=$errorMessage")
                    
                    // Przekaż szczegółowy komunikat do JavaScript
                    val escapedMessage = errorMessage.replace("'", "\\'")
                    webView.evaluateJavascript(
                        "window.speechRecognitionResult && window.speechRecognitionResult('error', '$escapedMessage');", 
                        null
                    )
                }

                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    if (!matches.isNullOrEmpty()) {
                        val recognizedText = matches[0]
                        // Przekaż rozpoznany tekst do JavaScript (bez automatycznego wyszukiwania)
                        webView.evaluateJavascript(
                            "window.speechRecognitionResult && window.speechRecognitionResult('success', '$recognizedText');",
                            null
                        )
                        // Usunięto Toast (zgodnie z wymaganiem)\n
                    } else {
                        webView.evaluateJavascript(
                            "window.speechRecognitionResult && window.speechRecognitionResult('error', 'Nie rozpoznano tekstu');",
                            null
                        )
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    // Częściowe wyniki - wyświetl na bieżąco
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    if (!matches.isNullOrEmpty()) {
                        val partialText = matches[0]
                        // Przekaż częściowy tekst do JavaScript
                        webView.evaluateJavascript(
                            "window.speechRecognitionPartialResult && window.speechRecognitionPartialResult('$partialText');",
                            null
                        )
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) {
                    // Zdarzenia - nie używamy
                }
            })

            // Przygotuj Intent dla rozpoznawania mowy
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL") // Polski język
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Powiedz adres do wyszukania...")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true) // Włącz częściowe wyniki
            }

            // Rozpocznij rozpoznawanie
            speechRecognizer?.startListening(intent)

        } catch (e: Exception) {
            Log.e("MainActivity", "Błąd podczas rozpoznawania mowy: ${e.message}", e)
            
            // Szczegółowy komunikat błędu z instrukcjami
            val errorMsg = "Błąd rozpoznawania mowy: ${e.message ?: "nieznany błąd"}\n\n" +
                          "Upewnij się, że:\n" +
                          "• Aplikacja Google jest zainstalowana\n" +
                          "• Masz połączenie z internetem\n" +
                          "• Usługi Google są włączone"
            
            runOnUiThread {
                AlertDialog.Builder(this)
                    .setTitle("Błąd rozpoznawania mowy")
                    .setMessage(errorMsg)
                    .setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
                    .show()
            }
            
            // Przekaż informację do JavaScript
            val escapedMsg = (e.message ?: "Błąd systemu").replace("'", "\\'")
            webView.evaluateJavascript(
                "window.speechRecognitionResult && window.speechRecognitionResult('error', 'Błąd systemu: $escapedMsg');",
                null
            )
        }
    }

    /**
     * Zatrzymuje rozpoznawanie mowy
     */
    private fun stopSpeechRecognition() {
        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null
    }

    /**
     * Pokazuje dialog informujący o trwałym odrzuceniu uprawnień do mikrofonu
     */
    private fun showPermanentlyDeniedAudioPermissionDialog() {
        val dialogBuilder = AlertDialog.Builder(this)
            .setTitle("Uprawnienia do mikrofonu")
            .setMessage("Rozpoznawanie mowy wymaga dostępu do mikrofonu. Uprawnienia zostały trwale odrzucone. Musisz je włączyć ręcznie w ustawieniach aplikacji.")
            .setPositiveButton("Otwórz ustawienia") { _, _ ->
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = Uri.fromParts("package", packageName, null)
                startActivity(intent)
            }
            .setNegativeButton("Anuluj") { dialog, _ ->
                dialog.dismiss()
                // Przekaż informację do JavaScript o odmowie uprawnień
                webView.evaluateJavascript(
                    "window.speechRecognitionPermissionResult && window.speechRecognitionPermissionResult('denied');",
                    null
                )
            }

        dialogBuilder.show()
    }

    // ===== UPRAWNIENIA DO APARATU =====

    /**
     * Sprawdza uprawnienia do aparatu
     */
    private fun checkCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Żąda uprawnień do aparatu
     */
    private fun requestCameraPermission() {
        Log.d("MainActivity", "Żądanie uprawnień do aparatu...")

        // Sprawdź aktualny stan uprawnień
        val currentPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        Log.d("MainActivity", "Aktualny stan uprawnień CAMERA: $currentPermission")

        when {
            currentPermission == PackageManager.PERMISSION_GRANTED -> {
                Log.d("MainActivity", "Uprawnienia już przyznane!")
                // Przekaż informację do JavaScript o przyznaniu uprawnień
                webView.evaluateJavascript(
                    "window.cameraPermissionResult && window.cameraPermissionResult('granted');",
                    null
                )
            }
            else -> {
                // Bezpośrednio żądaj uprawnień - tak samo jak dla mikrofonu
                Log.d("MainActivity", "Żądanie uprawnień do aparatu...")
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.CAMERA),
                    CAMERA_PERMISSION_REQUEST_CODE
                )
            }
        }
    }

    /**
     * Sprawdza czy aparat jest dostępny i gotowy do użycia
     * Zwraca: "available" - dostępne, "no_permission" - brak uprawnień, "not_available" - niedostępne
     */
    fun checkCameraAvailability(): String {
        // Sprawdź uprawnienia
        if (!checkCameraPermission()) {
            return "no_permission"
        }

        // Sprawdź czy aparat jest dostępny
        return try {
            val cameraManager = getSystemService(Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
            cameraManager.cameraIdList.isNotEmpty()
            "available"
        } catch (e: Exception) {
            Log.e("MainActivity", "Błąd podczas sprawdzania dostępności aparatu: ${e.message}")
            "not_available"
        }
    }

    /**
     * Pokazuje dialog informujący o trwałym odrzuceniu uprawnień do aparatu
     */
    private fun showPermanentlyDeniedCameraPermissionDialog() {
        val dialogBuilder = AlertDialog.Builder(this)
            .setTitle("Uprawnienia do aparatu")
            .setMessage("Podgląd z aparatu wymaga dostępu do kamery. Uprawnienia zostały trwale odrzucone. Musisz je włączyć ręcznie w ustawieniach aplikacji.")
            .setPositiveButton("Otwórz ustawienia") { _, _ ->
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = Uri.fromParts("package", packageName, null)
                startActivity(intent)
            }
            .setNegativeButton("Anuluj") { dialog, _ ->
                dialog.dismiss()
                // Przekaż informację do JavaScript o odmowie uprawnień
                webView.evaluateJavascript(
                    "window.cameraPermissionResult && window.cameraPermissionResult('denied');",
                    null
                )
            }

        dialogBuilder.show()
    }

    // ===== PHOTO PICKER - BEZ UPRAWNIEŃ =====
    // Photo Picker API nie wymaga uprawnień READ_MEDIA_IMAGES/READ_EXTERNAL_STORAGE
    // Funkcje checkStoragePermission() i requestStoragePermission() zostały usunięte

    /**
     * Konwertuje URI zdjęcia z galerii na base64 - ZOPTYMALIZOWANE, aby uniknąć ucinania
     */
    private fun convertImageUriToBase64(uri: Uri): String? {
        return try {
            // Najpierw sprawdź rozmiar obrazu bez dekodowania
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            
            val inputStream: InputStream? = contentResolver.openInputStream(uri)
            if (inputStream == null) {
                Log.e("MainActivity", "Nie udało się otworzyć strumienia dla URI: $uri")
                return null
            }
            
            BitmapFactory.decodeStream(inputStream, null, options)
            inputStream.close()
            
            // Oblicz inSampleSize aby zmniejszyć rozmiar, ale zachować proporcje
            val maxWidth = 1200  // Zwiększono limit
            val maxHeight = 900  // Zwiększono limit
            var inSampleSize = 1
            
            // Oblicz optymalny inSampleSize aby zmniejszyć rozmiar, ale nie przekroczyć limitów
            if (options.outHeight > maxHeight || options.outWidth > maxWidth) {
                val heightRatio = options.outHeight.toFloat() / maxHeight.toFloat()
                val widthRatio = options.outWidth.toFloat() / maxWidth.toFloat()
                val ratio = maxOf(heightRatio, widthRatio)
                
                // Znajdź najbliższą potęgę 2
                inSampleSize = 1
                while (inSampleSize * 2 < ratio) {
                    inSampleSize *= 2
                }
            }
            
            Log.d("MainActivity", "Oryginalny rozmiar obrazu: ${options.outWidth}x${options.outHeight}, inSampleSize: $inSampleSize")
            
            // Dekoduj obraz z optymalnym inSampleSize
            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
            }
            
            val inputStream2: InputStream? = contentResolver.openInputStream(uri)
            if (inputStream2 == null) {
                Log.e("MainActivity", "Nie udało się otworzyć strumienia dla URI: $uri")
                return null
            }
            
            val bitmap = BitmapFactory.decodeStream(inputStream2, null, decodeOptions)
            inputStream2.close()

            if (bitmap == null) {
                Log.e("MainActivity", "Nie udało się zdekodować bitmapy z URI: $uri")
                return null
            }

            Log.d("MainActivity", "Rozmiar zdekodowanej bitmapy: ${bitmap.width}x${bitmap.height}")

            // USUNIĘTO dodatkowe skalowanie - używamy tylko inSampleSize dla zachowania proporcji
            val finalBitmap = bitmap
            
            // Konwertuj bitmapę na base64 z wysoką jakością
            val byteArrayOutputStream = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, 90, byteArrayOutputStream) // Obniżono do 90% dla lepszej wydajności
            val byteArray = byteArrayOutputStream.toByteArray()
            
            Log.d("MainActivity", "Rozmiar zdjęcia z galerii po kompresji: ${byteArray.size} bytes (${byteArray.size / 1024} KB)")
            
            // Zwróć base64 z prefiksem data URI
            val base64String = "data:image/jpeg;base64," + Base64.encodeToString(byteArray, Base64.NO_WRAP)
            Log.d("MainActivity", "Długość stringa base64: ${base64String.length} znaków")
            
            base64String
        } catch (e: Exception) {
            Log.e("MainActivity", "Błąd podczas konwersji URI na base64: ${e.message}", e)
            null
        }
    }

    /**
     * Skaluje bitmapę w dół jeśli jest zbyt duża (maksymalnie 800x600)
     */
    private fun scaleBitmapDown(bitmap: Bitmap): Bitmap {
        val maxWidth = 800 // Maksymalna szerokość
        val maxHeight = 600 // Maksymalna wysokość
        val currentWidth = bitmap.width
        val currentHeight = bitmap.height
        
        // Oblicz stosunek skalowania
        val scaleRatio = minOf(
            maxWidth.toFloat() / currentWidth,
            maxHeight.toFloat() / currentHeight,
            1.0f // Nie skaluj w górę
        )
        
        // Jeśli obraz jest już wystarczająco mały, zwróć oryginał
        if (scaleRatio >= 1.0f) {
            return bitmap
        }
        
        val newWidth = (currentWidth * scaleRatio).toInt()
        val newHeight = (currentHeight * scaleRatio).toInt()
        
        Log.d("MainActivity", "Skalowanie bitmapy z ${currentWidth}x${currentHeight} do ${newWidth}x${newHeight}")
        
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    // Funkcja do wczytywania zoptymalizowanej trasy
    private fun loadOptimizedRoute() {
        // Dodaj opóźnienie, aby upewnić się, że optiDrogApp jest zainicjalizowany
        webView.postDelayed({
            webView.evaluateJavascript(
                "if (window.optiDrogApp && window.optiDrogApp.getNavigationManager()) {" +
                        "  window.optiDrogApp.getNavigationManager().loadOptimizationFromSession();" +
                        "} else {" +
                        "  console.error('NavigationManager nie jest jeszcze gotowy');" +
                        "}", null)
        }, 1500) // Opóźnienie 1.5 sekundy - po wczytaniu adresów
    }

    /**
     * Uruchamia OCR dla zdjęcia przesłanego z galerii
     */
    fun runOcrFromGallery(bitmap: Bitmap) {
        val image = InputImage.fromBitmap(bitmap, 0)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
            .addOnSuccessListener { visionText ->
                val resultLines = ArrayList<String>()
                for (block in visionText.textBlocks) {
                    for (line in block.lines) {
                        resultLines.add(line.text)
                    }
                }

                Log.d("MainActivity", "OCR z galerii zakończony sukcesem. Znaleziono linii: ${resultLines.size}")

                val jsonArray = JSONArray(resultLines)
                val escapedJson = jsonArray.toString()
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                
                webView.evaluateJavascript(
                    "if (window.handleOcrResults) { " +
                            "  window.handleOcrResults($escapedJson);" +
                            "} else { " +
                            "  console.error('Brak handlera handleOcrResults dla galerii');" +
                            "}", null
                )
            }
            .addOnFailureListener { e ->
                Log.e("MainActivity", "Błąd podczas OCR z galerii: ${e.message}", e)
                webView.evaluateJavascript("showCameraAnalysisError('Błąd rozpoznawania tekstu: ${e.message}');", null)
            }
    }

    // ===== METODY POMOCNICZE =====
}