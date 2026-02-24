package pl.optidrog.app

import android.Manifest
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
// Usunięto import Toast - zgodnie z wymaganiem eliminacji wszystkich Toast
import androidx.core.app.ActivityCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.*
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import android.graphics.BitmapFactory // Import potrzebny do dekodowania base64 na bitmapę
import android.util.Base64 // Import dekodowania base64
import pl.optidrog.app.statistics.StatisticsWorker

class OverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var overlayView: View
    private lateinit var minimizedView: View
    private var isMinimized = false
    private var lastX: Int = 0
    private var lastY: Int = 0
    private var initialX: Int = 0
    private var initialY: Int = 0
    private var initialTouchX: Float = 0f
    private var initialTouchY: Float = 0f

    // Nowe zmienne dla śledzenia lokalizacji
    private lateinit var locationManager: LocationManager
    private var targetLatitude: Double = 0.0
    private var targetLongitude: Double = 0.0
    private var distanceTextView: TextView? = null
    private var minimizedDistanceTextView: TextView? = null
    private var locationListener: LocationListener? = null

    // Nowe zmienne dla timera bezczynności
    private var inactivityTimer: android.os.Handler? = null
    private var inactivityRunnable: Runnable? = null
    private val INACTIVITY_TIMEOUT = 20000L // 20 sekund
    private var lastDistance: Double = Double.MAX_VALUE

    // SharedPreferences do zapisywania pozycji okienka
    private lateinit var sharedPreferences: SharedPreferences
    private val PREFS_NAME = "OverlayPosition"
    private val KEY_OVERLAY_X = "overlay_x"
    private val KEY_OVERLAY_Y = "overlay_y"
    private val KEY_MINIMIZED_X = "minimized_x"
    private val KEY_MINIMIZED_Y = "minimized_y"

    // WakeLock do zapobiegania blokowaniu ekranu podczas działania pływającego okienka
    private var wakeLock: PowerManager.WakeLock? = null

    // Dodaj BroadcastReceiver do obsługi zamykania i aktualizacji adresu
    private val overlayReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                "ACTION_CLOSE_OVERLAY" -> {
                    stopSelf()
                }
                "ACTION_UPDATE_OVERLAY_ADDRESS" -> { // Pozostawiono bez prefiksu (wewnętrzny broadcast aktualizacji widoku)
                    val newAddress = intent.getStringExtra("address") ?: "Brak adresu"
                    val newLatitude = intent.getDoubleExtra("latitude", targetLatitude)
                    val newLongitude = intent.getDoubleExtra("longitude", targetLongitude)

                    savedAddress = newAddress
                    targetLatitude = newLatitude
                    targetLongitude = newLongitude

                    updateOverlayAddress(newAddress)
                }
                "pl.optidrog.app.ACTION_ALL_ADDRESSES_COMPLETED" -> { // Zmieniono na zprefiksowaną wersję aby spójnie z MainActivity
                    showCompletionOverlay()
                }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager

        // Inicjalizacja SharedPreferences do zapisywania pozycji okienka
        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Inicjalizacja WakeLock - zapobiega blokowaniu ekranu podczas działania pływającego okienka
        initializeWakeLock()

        // Dodanie powiadomienia foreground service, aby zapobiec zatrzymaniu przez system
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelId = "optidrog_navigation_channel"
            val channelName = "Nawigacja OptiDrog"
            val channel = NotificationChannel(
                channelId,
                channelName,
                NotificationManager.IMPORTANCE_LOW
            )

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)

            val notification = NotificationCompat.Builder(this, channelId)
                .setContentTitle("Nawigacja aktywna")
                .setContentText("OptiDrog śledzi Twoją pozycję")
                .setSmallIcon(R.drawable.ic_navigation)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    // Dla Android 10+ (API 29+) używamy typu FOREGROUND_SERVICE_TYPE_LOCATION
                    startForeground(1001, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
                } else {
                    // Dla starszych wersji Androida
                    startForeground(1001, notification)
                }
            } catch (e: Exception) {
                // W przypadku błędu, spróbuj użyć standardowej metody bez typu usługi
                Log.e("OverlayService", "Błąd podczas uruchamiania usługi na pierwszym planie: ${e.message}")
                startForeground(1001, notification)
            }
        }

        // Zarejestruj receiver
        val filter = IntentFilter().apply {
            addAction("ACTION_CLOSE_OVERLAY") // Lokalna akcja zamknięcia overlay
            addAction("ACTION_UPDATE_OVERLAY_ADDRESS") // Lokalna akcja aktualizacji adresu
            addAction("pl.optidrog.app.ACTION_ALL_ADDRESSES_COMPLETED") // Zprefiksowana akcja zakończenia trasy
        }
        // Rejestracja BroadcastReceiver z flagą NOT_EXPORTED dla bezpieczeństwa (tylko wewnątrz aplikacji)
        ContextCompat.registerReceiver(this, overlayReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Pobierz adres, współrzędne i ustawienia paczki z intentu
        val address = intent?.getStringExtra("address") ?: "Brak adresu"
        targetLatitude = intent?.getDoubleExtra("latitude", 0.0) ?: 0.0
        targetLongitude = intent?.getDoubleExtra("longitude", 0.0) ?: 0.0
        packageSettingsJson = intent?.getStringExtra("packageSettings") ?: ""
        savedAddress = address

        // Wyodrębnij notatki oraz zdjęcia z packageSettingsJson jeśli są dostępne
        savedNotes = try {
            if (packageSettingsJson.isNotEmpty()) {
                val jsonObject = JSONObject(packageSettingsJson)
                jsonObject.optString("notes", "")
            } else {
                ""
            }
        } catch (e: Exception) {
            Log.e("OverlayService", "Błąd podczas parsowania notatek: ${e.message}")
            ""
        }

        // Parsowanie zdjęć (photos) - oczekiwana tablica stringów base64
        savedPhotos = try {
            if (packageSettingsJson.isNotEmpty()) {
                val jsonObject = JSONObject(packageSettingsJson)
                val photosArray = jsonObject.optJSONArray("photos")
                if (photosArray != null) {
                    val tempList = mutableListOf<String>()
                    for (i in 0 until photosArray.length()) {
                        val item = photosArray.optString(i, "")
                        // Walidacja podstawowa: musi zaczynać się od "data:image/jpeg;base64,"
                        if (item.startsWith("data:image/jpeg;base64,")) {
                            tempList.add(item)
                        }
                        if (tempList.size >= 2) break // Maksymalnie 2 zdjęcia
                    }
                    tempList.toList()
                } else {
                    emptyList()
                }
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e("OverlayService", "Błąd podczas parsowania zdjęć: ${e.message}")
            emptyList()
        }

        // Wyodrębnij nazwę ulubionego z packageSettingsJson jeśli jest dostępna
        favoriteName = try {
            if (packageSettingsJson.isNotEmpty()) {
                val jsonObject = JSONObject(packageSettingsJson)
                jsonObject.optString("favoriteName", "")
            } else {
                ""
            }
        } catch (e: Exception) {
            Log.e("OverlayService", "Błąd podczas parsowania nazwy ulubionej: ${e.message}")
            ""
        }

        // Loguj informacje o ustawieniach paczki, notatkach, zdjęciach i nazwie ulubionej
        if (packageSettingsJson.isNotEmpty()) {
            Log.d("OverlayService", "Otrzymano ustawienia paczki: $packageSettingsJson")
        }
        if (savedNotes.isNotEmpty()) {
            Log.d("OverlayService", "Otrzymano notatki: $savedNotes")
        }
        if (savedPhotos.isNotEmpty()) {
            Log.d("OverlayService", "Otrzymano ${savedPhotos.size} zdjęć (base64)")
        }
        if (favoriteName.isNotEmpty()) {
            Log.d("OverlayService", "Otrzymano nazwę ulubioną: $favoriteName")
        }

        // Wyodrębnij numer telefonu z packageSettingsJson
        savedPhoneNumber = try {
            if (packageSettingsJson.isNotEmpty()) {
                val jsonObject = JSONObject(packageSettingsJson)
                jsonObject.optString("phone", "")
            } else {
                ""
            }
        } catch (e: Exception) {
            Log.e("OverlayService", "Błąd podczas parsowania numeru telefonu: ${e.message}")
            ""
        }

        if (savedPhoneNumber.isNotEmpty()) {
            Log.d("OverlayService", "Otrzymano numer telefonu: $savedPhoneNumber")
        }

        // Jeśli overlayView już istnieje, tylko zaktualizuj adres
        if (::overlayView.isInitialized && overlayView.parent != null) {
            updateOverlayAddress(address)
        } else if (::minimizedView.isInitialized && minimizedView.parent != null) {
            savedAddress = address
            if (lastDistance != Double.MAX_VALUE) {
                val formattedDistance = when {
                    lastDistance < 1000 -> "${lastDistance.roundToInt()} m"
                    else -> "${(lastDistance / 1000).round(1)} km"
                }
                minimizedDistanceTextView?.text = formattedDistance
            }
        } else {
            createMinimizedOverlay()
        }

        // Rozpocznij śledzenie lokalizacji
        startLocationTracking()

        // Rozpocznij raportowanie statystyk dla Overlay
        StatisticsWorker.startPeriodicReporting(this, isOverlay = true)

        return START_STICKY
    }

    // Zmienne do przechowywania adresu i ustawień paczki
    private var savedAddress: String = "Brak adresu"
    private var packageSettingsJson: String = ""
    private var savedNotes: String = ""
    private var savedPhoneNumber: String = ""  // Numer telefonu
    private var favoriteName: String = ""  // Nazwa ulubionego adresu

        // Lista zdjęć (base64) powiązanych z bieżącym adresem - maksymalnie 2
        // Przechowywana tymczasowo w serwisie na potrzeby wyświetlenia w overlay
        private var savedPhotos: List<String> = emptyList()
    
        // Referencja do przycisku zdjęć w pełnym overlay (aby móc odświeżać jego widoczność przy zmianie adresu)
        private var photosButtonRef: Button? = null

    private fun createOverlayView(address: String) {
        // Jeśli overlayView już istnieje, nie twórz nowego - jedynie zaktualizuj dane
        if (::overlayView.isInitialized && overlayView.parent != null) {
            updateOverlayAddress(address)
            return
        }

        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        overlayView = inflater.inflate(R.layout.overlay_layout, null)

        // Ustaw adres
        overlayView.findViewById<TextView>(R.id.address_text)?.text = address
        
        // Wyświetl nazwę ulubioną jeśli istnieje i overlay jest w pełnym widoku
        val favoriteNameTextView = overlayView.findViewById<TextView>(R.id.favorite_name_text)
        if (favoriteName.isNotEmpty()) {
            favoriteNameTextView?.text = favoriteName
            favoriteNameTextView?.visibility = View.VISIBLE
        } else {
            favoriteNameTextView?.visibility = View.GONE
        }

        // Ustaw odległość jeśli jest obliczona
        distanceTextView = overlayView.findViewById(R.id.distance_text)
        if (lastDistance != Double.MAX_VALUE) {
            val formattedDistance = if (lastDistance < 1000) {
                "${lastDistance.roundToInt()} m"
            } else {
                "${(lastDistance / 1000).round(1)} km"
            }
            distanceTextView?.text = "Odległość: $formattedDistance"
        }

        // Informacje o paczce (rozmiar, typ, notatki itd.)
        setupPackageInfoDisplay()

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            },
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
        }

            // PO (POPRAWKA):
            val safePosition = getSafeOverlayPosition(
                sharedPreferences.getInt(KEY_OVERLAY_X, 0),
                sharedPreferences.getInt(KEY_OVERLAY_Y, 100)
            )
            params.x = safePosition.first
            params.y = safePosition.second

        // Przyciski akcji
        val nextButton = Button(this).apply {
            text = "⏭️ Pomiń"
            setBackgroundResource(R.drawable.button_next_background)
            setTextColor(resources.getColor(R.color.text_primary, null))
            textSize = 12f
            setPadding(16, 10, 16, 10)
            elevation = 3f
            isAllCaps = false
            minHeight = 0
            minimumHeight = 0
        }

        val doneButton = Button(this).apply {
            text = "✅ Doręczone"
            setBackgroundResource(R.drawable.button_done_background)
            setTextColor(resources.getColor(R.color.text_primary, null))
            textSize = 12f
            setPadding(16, 10, 16, 10)
            elevation = 3f
            isAllCaps = false
            minHeight = 0
            minimumHeight = 0
        }

        // Przycisk zdjęć (zapamiętujemy w polu photosButtonRef aby móc odświeżać widoczność przy kolejnych adresach)
        photosButtonRef = Button(this).apply {
            text = "📷 Zdjęcia"
            setBackgroundResource(R.drawable.button_next_background)
            setTextColor(resources.getColor(R.color.text_primary, null))
            textSize = 12f
            setPadding(16, 10, 16, 10)
            elevation = 3f
            isAllCaps = false
            minHeight = 0
            minimumHeight = 0
            visibility = if (savedPhotos.isNotEmpty()) View.VISIBLE else View.GONE
            setOnClickListener { showPhotosOverlay() }
        }

        val buttonsContainer = overlayView.findViewById<LinearLayout>(R.id.overlay_buttons_container)
        buttonsContainer?.apply {
            removeAllViews()

            // Ustal listę przycisków – jeśli brak zdjęć na start nie dodajemy przycisku zdjęć (może zostać dodany później przy aktualizacji)
            val buttonList = mutableListOf<Button>()
            buttonList.add(nextButton)
            buttonList.add(doneButton)
            if (savedPhotos.isNotEmpty()) {
                buttonList.add(photosButtonRef!!)
            }

            weightSum = buttonList.size.toFloat()

            val buttonParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            ).apply {
                setMargins(4, 0, 4, 0)
            }

            buttonList.forEach { btn ->
                btn.layoutParams = buttonParams
                addView(btn)
            }
        }

        // Kliknięcia akcji – po nich minimalizujemy overlay
        nextButton.setOnClickListener {
            // Wysyłamy zprefiksowaną akcję NEXT (zgodną z MainActivity)
            sendOverlayActionBroadcast("pl.optidrog.app.ACTION_OVERLAY_NEXT")
            minimizeOverlay()
        }
        doneButton.setOnClickListener {
            // Wysyłamy zprefiksowaną akcję DONE (zgodną z MainActivity)
            sendOverlayActionBroadcast("pl.optidrog.app.ACTION_OVERLAY_DONE")
            minimizeOverlay()
        }

        setupDragging(overlayView, params)
        windowManager.addView(overlayView, params)
        startInactivityTimer()
    }

    /**
     * Aktualizuje adres w istniejącym overlay (jeśli pełny widok aktywny) oraz odświeża dane:
     * - zapisuje nowy adres w savedAddress
     * - aktualizuje tekst adresu
     * - wczytuje/aktualizuje informacje o paczce (notes, delivery, inne)
     * - odświeża widoczność przycisku zdjęć (dodaje jeśli pojawiły się zdjęcia)
     * Jeśli overlay jest zminimalizowany, tylko zapisuje adres – aktualizacja UI nastąpi przy rozwinięciu.
     */
    private fun updateOverlayAddress(address: String) {
        savedAddress = address
        if (::overlayView.isInitialized && overlayView.parent != null && !isMinimized) {
            try {
                overlayView.findViewById<TextView>(R.id.address_text)?.text = address
                
                // Aktualizuj nazwę ulubioną w pełnym widoku
                val favoriteNameTextView = overlayView.findViewById<TextView>(R.id.favorite_name_text)
                if (favoriteName.isNotEmpty()) {
                    favoriteNameTextView?.text = favoriteName
                    favoriteNameTextView?.visibility = View.VISIBLE
                } else {
                    favoriteNameTextView?.visibility = View.GONE
                }
                
                setupPackageInfoDisplay()
                refreshPhotosButton()
                Log.d("OverlayService", "Zaktualizowano adres w overlay: $address (photos=${savedPhotos.size}), favoriteName=$favoriteName")
            } catch (e: Exception) {
                Log.e("OverlayService", "Błąd aktualizacji adresu w overlay: ${e.message}")
            }
        } else {
            // Widok zminimalizowany lub nie istnieje – tylko log
            Log.d("OverlayService", "Zapisano nowy adres (overlay nieaktywny lub zminimalizowany): $address")
        }
    }

    /**
     * Ustawia widoczność przycisku zdjęć zależnie od savedPhotos oraz dodaje go jeśli wcześniej nie był dodany.
     */
    private fun refreshPhotosButton() {
        val container = overlayView.findViewById<LinearLayout>(R.id.overlay_buttons_container) ?: return

        // Jeśli nie mamy referencji a są zdjęcia – utwórz i dodaj
        if (photosButtonRef == null && savedPhotos.isNotEmpty()) {
            photosButtonRef = Button(this).apply {
                text = "📷 Zdjęcia"
                setBackgroundResource(R.drawable.button_next_background)
                setTextColor(resources.getColor(R.color.text_primary, null))
                textSize = 12f
                setPadding(16, 10, 16, 10)
                elevation = 3f
                isAllCaps = false
                minHeight = 0
                minimumHeight = 0
                setOnClickListener { showPhotosOverlay() }
            }
            // Dodaj przycisk oraz przeliczenie weightSum
            val buttonParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            ).apply { setMargins(4, 0, 4, 0) }

            photosButtonRef!!.layoutParams = buttonParams
            container.addView(photosButtonRef)

            // Przelicz weightSum – liczba dzieci kontenera
            container.weightSum = container.childCount.toFloat()
        } else if (photosButtonRef != null) {
            // Jeśli istnieje – tylko ustaw widoczność
            photosButtonRef!!.visibility = if (savedPhotos.isNotEmpty()) View.VISIBLE else View.GONE
            // Jeśli brak zdjęć i ukryty, nie usuwamy aby zachować układ (opcjonalnie można usunąć)
        }
    }

    private fun minimizeOverlay() {
        // Usuń pełny widok
        try {
            windowManager.removeView(overlayView)
        } catch (e: IllegalArgumentException) {
            Log.e("OverlayService", "Błąd podczas usuwania pełnego widoku przy minimalizacji: ${e.message}")
        }

        // Utwórz zminimalizowany widok
        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        minimizedView = inflater.inflate(R.layout.minimized_overlay, null)

        // Pobranie referencji do TextView odległości w zminimalizowanym widoku
        minimizedDistanceTextView = minimizedView.findViewById<TextView>(R.id.minimized_distance_text)

        // Ustaw ostatnią znaną odległość jeśli jest dostępna
        if (lastDistance != Double.MAX_VALUE) {
            val formattedDistance = when {
                lastDistance < 1000 -> "${lastDistance.roundToInt()} m"
                else -> "${(lastDistance / 1000).round(1)} km"
            }
            minimizedDistanceTextView?.text = formattedDistance
        }

        // Parametry okna dla zminimalizowanego widoku
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            },
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START
        
        // OBSŁUGA EDGE-TO-EDGE DLA ZMINIMALIZOWANEGO OVERLAY - pozycjonowanie względem bezpiecznych obszarów
        val safePosition = getSafeOverlayPosition(
            sharedPreferences.getInt(KEY_MINIMIZED_X, 0),
            sharedPreferences.getInt(KEY_MINIMIZED_Y, 100)
        )
        params.x = safePosition.first
        params.y = safePosition.second

        // Obsługa kliknięcia, aby przywrócić pełny widok
        minimizedView.setOnClickListener {
            expandToFullOverlay()
        }

        // Obsługa przeciągania zminimalizowanego widoku
        setupDragging(minimizedView, params)

        // Dodanie zminimalizowanego widoku do WindowManager
        windowManager.addView(minimizedView, params)
        isMinimized = true

        // Wyczyść referencję do TextView odległości
        distanceTextView = null

        // Zatrzymaj timer bezczynności
        stopInactivityTimer()
    }

    // Dodaj te dwie metody jako metody klasy, nie jako funkcje lokalne
    private fun createMinimizedOverlay() {
        // Jeśli minimizedView już istnieje, nie twórz nowego
        if (::minimizedView.isInitialized && minimizedView.parent != null) return
        // Utwórz zminimalizowany widok
        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        minimizedView = inflater.inflate(R.layout.minimized_overlay, null)

        // Pobranie referencji do TextView odległości w zminimalizowanym widoku
        minimizedDistanceTextView = minimizedView.findViewById<TextView>(R.id.minimized_distance_text)

        // Parametry okna dla zminimalizowanego widoku
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            },
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START
        
        // OBSŁUGA EDGE-TO-EDGE DLA ZMINIMALIZOWANEGO OVERLAY - pozycjonowanie względem bezpiecznych obszarów
        val safePosition = getSafeOverlayPosition(
            sharedPreferences.getInt(KEY_MINIMIZED_X, 0),
            sharedPreferences.getInt(KEY_MINIMIZED_Y, 100)
        )
        params.x = safePosition.first
        params.y = safePosition.second

        // Obsługa kliknięcia, aby przywrócić pełny widok
        minimizedView.setOnClickListener {
            expandToFullOverlay()
        }

        // Obsługa przeciągania zminimalizowanego widoku
        setupDragging(minimizedView, params)

        // Dodanie zminimalizowanego widoku do WindowManager
        windowManager.addView(minimizedView, params)
        isMinimized = true
    }

    private fun expandToFullOverlay() {
        if (isMinimized) {
            // Zapisz aktualną pozycję zminimalizowanego okienka przed jego usunięciem
            var currentX = 0
            var currentY = 100
            if (::minimizedView.isInitialized && minimizedView.parent != null) {
                val layoutParams = minimizedView.layoutParams as WindowManager.LayoutParams
                currentX = layoutParams.x
                currentY = layoutParams.y
                // Zapisz pozycję zminimalizowanego okienka
                saveMinimizedPosition(currentX, currentY)
                // Zapisz tę samą pozycję dla pełnego okienka
                saveOverlayPosition(currentX, currentY)
                try {
                    windowManager.removeView(minimizedView)
                } catch (e: IllegalArgumentException) {
                    Log.e("OverlayService", "Błąd podczas usuwania zminimalizowanego widoku przy maksymalizacji: ${e.message}")
                }
            }
            isMinimized = false
            // Utwórz pełny widok z zapisanym adresem (lub zaktualizuj istniejący)
            createOverlayView(savedAddress)

            // Wyświetl informacje o ustawieniach paczki po rozwinięciu okienka
            setupPackageInfoDisplay()

            // Uruchom timer bezczynności po rozwinięciu
            startInactivityTimer()

            Log.d("OverlayService", "Rozwinięto okienko z adresem: $savedAddress")
        }
    }

    // (Usunięto duplikat updateOverlayAddress – używana jest jedna złożona wersja powyżej)

    private fun restoreFromMinimized(newAddress: String?) {
        if (isMinimized) {
            // Usuń zminimalizowany widok
            try {
                windowManager.removeView(minimizedView)
            } catch (e: IllegalArgumentException) {
                Log.e("OverlayService", "Błąd podczas usuwania zminimalizowanego widoku przy przywracaniu: ${e.message}")
            }
            isMinimized = false

            // Jeśli podano nowy adres, użyj go, w przeciwnym razie użyj poprzedniego
            val address = newAddress ?: overlayView.findViewById<TextView>(R.id.address_text).text.toString()
            createOverlayView(address)

            // Wyświetl informacje o ustawieniach paczki
            setupPackageInfoDisplay()

            // Uruchom timer bezczynności
            startInactivityTimer()
        }
    }

    // Nowa funkcja do uruchamiania timera bezczynności
    private fun startInactivityTimer() {
        stopInactivityTimer() // Zatrzymaj poprzedni timer, jeśli istnieje

        inactivityTimer = android.os.Handler(android.os.Looper.getMainLooper())
        inactivityRunnable = Runnable {
            // Nie minimalizuj jeśli użytkownik jest blisko celu (< 300m)
            // Okno powinno pozostać rozwinięte, aby ułatwić doręczenie
            if (!isMinimized && lastDistance >= 200) {
                minimizeOverlay()
            }
        }

        inactivityTimer?.postDelayed(inactivityRunnable!!, INACTIVITY_TIMEOUT)
    }

    // Nowa funkcja do zatrzymywania timera bezczynności
    private fun stopInactivityTimer() {
        inactivityRunnable?.let { runnable ->
            inactivityTimer?.removeCallbacks(runnable)
        }
    }

    // Nowa funkcja do resetowania timera bezczynności
    private fun resetInactivityTimer() {
        if (!isMinimized) {
            startInactivityTimer()
        }
    }

    // Funkcja do aktualizacji wyświetlanej odległości w zminimalizowanym widoku
    private fun updateMinimizedDistanceDisplay(distanceInMeters: Double) {
        val formattedDistance = when {
            distanceInMeters < 1000 -> "${distanceInMeters.roundToInt()} m"
            else -> "${(distanceInMeters / 1000).round(1)} km"
        }

        minimizedDistanceTextView?.text = formattedDistance
    }

    // Funkcja do aktualizacji wyświetlanej odległości
    private fun updateDistanceDisplay(distanceInMeters: Double) {
        // Zapisz ostatnią odległość
        lastDistance = distanceInMeters

        val formattedDistance = when {
            distanceInMeters < 1000 -> "${distanceInMeters.roundToInt()} m"
            else -> "${(distanceInMeters / 1000).round(1)} km"
        }

        // Aktualizuj tekst w zależności od aktualnego widoku
        if (isMinimized) {
            updateMinimizedDistanceDisplay(distanceInMeters)

            // Jeśli odległość jest mniejsza niż 300m, automatycznie rozwiń widok
            if (distanceInMeters < 200) {
                expandToFullOverlay()
            }
        } else {
            distanceTextView?.text = "Odległość: $formattedDistance"
            
            // Jeśli blisko celu (< 200m), zresetuj timer bezczynności
            // aby okno nie zniknęło w kluczowym momencie doręczenia
            if (distanceInMeters < 200) {
                resetInactivityTimer()
            }
        }
    }

    private fun setupDragging(view: View, params: WindowManager.LayoutParams) {
        // Zmienne do śledzenia ruchu
        var wasDragged = false
        var downTime = 0L
        var closeIconView: View? = null

        view.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    lastX = initialX
                    lastY = initialY

                    // Zapisz czas dotknięcia
                    downTime = System.currentTimeMillis()

                    // Resetuj flagę przeciągnięcia
                    wasDragged = false

                    // Reset timer bezczynności przy dotknięciu
                    resetInactivityTimer()

                    // Pokaż ikonę X na dole ekranu
                    showCloseIcon()
                    closeIconView = getCloseIconView()

                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    // Oblicz odległość ruchu
                    val dx = abs(event.rawX - initialTouchX)
                    val dy = abs(event.rawY - initialTouchY)

                    // Jeśli ruch jest większy niż próg, uznaj to za przeciągnięcie
                    if (dx > 10 || dy > 10) {
                        wasDragged = true
                    }

                    val proposedX = initialX + (event.rawX - initialTouchX).toInt()
                    val proposedY = initialY + (event.rawY - initialTouchY).toInt()
                    
                    // Użyj bezpiecznej pozycji edge-to-edge
                    updateSafeOverlayPosition(view, params, proposedX, proposedY)

                    // Sprawdź, czy okienko jest nad ikoną X
                    closeIconView?.let { closeIcon ->
                        if (isViewOverlapping(view, closeIcon)) {
                            // Zmień kolor ikony X, aby zasygnalizować, że upuszczenie spowoduje zamknięcie
                            highlightCloseIcon(true)
                        } else {
                            // Przywróć normalny kolor ikony X
                            highlightCloseIcon(false)
                        }
                    }

                    // Reset timer bezczynności przy przeciąganiu
                    resetInactivityTimer()
                    true
                }
                MotionEvent.ACTION_UP -> {
                    // Ukryj ikonę X
                    hideCloseIcon()

                    // Sprawdź, czy okienko zostało upuszczone na ikonie X
                    closeIconView?.let { closeIcon ->
                        if (isViewOverlapping(view, closeIcon)) {
                            // Zamknij pływające okienko
                            stopSelf()
                            return@setOnTouchListener true
                        }
                    }

                    // Zapisz pozycję po zakończeniu przeciągania
                    if (wasDragged) {
                        if (isMinimized) {
                            saveMinimizedPosition(params.x, params.y)
                        } else {
                            saveOverlayPosition(params.x, params.y)
                        }
                    }

                    // Jeśli nie było przeciągnięcia i czas między dotknięciem a puszczeniem jest krótki, uznaj to za kliknięcie
                    val clickDuration = System.currentTimeMillis() - downTime
                    if (!wasDragged && clickDuration < 200 && isMinimized) {
                        // Wywołaj rozwinięcie widoku
                        expandToFullOverlay()
                    }
                    true
                }
                else -> false
            }
        }
    }

    // Ikona X do zamykania
    private var closeIconWindowManager: WindowManager? = null
    private var closeIconView: View? = null

    /**
     * Pokazuje ikonę X na dole ekranu
     */
    private fun showCloseIcon() {
        if (closeIconView != null) return

        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        closeIconView = inflater.inflate(R.layout.close_icon_layout, null)

        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            },
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        )

        // Umieść ikonę X na dole ekranu na środku
        params.gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        params.y = 100 // Odstęp od dołu ekranu

        closeIconWindowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        closeIconWindowManager?.addView(closeIconView, params)
    }

    /**
     * Ukrywa ikonę X
     */
    private fun hideCloseIcon() {
        closeIconView?.let {
            closeIconWindowManager?.removeView(it)
            closeIconView = null
        }
    }

    /**
     * Zwraca widok ikony X
     */
    private fun getCloseIconView(): View? {
        return closeIconView
    }

    /**
     * Podświetla lub przywraca normalny wygląd ikony X
     */
    private fun highlightCloseIcon(highlight: Boolean) {
        closeIconView?.findViewById<View>(R.id.close_icon_container)?.let { container ->
            val background = container.background as? GradientDrawable
            if (highlight) {
                background?.setColor(ContextCompat.getColor(this, R.color.close_icon_highlight))
            } else {
                background?.setColor(ContextCompat.getColor(this, R.color.close_icon_normal))
            }
        }
    }

    /**
     * Sprawdza, czy dwa widoki nakładają się na siebie
     */
    private fun isViewOverlapping(view1: View, view2: View): Boolean {
        val view1Loc = IntArray(2)
        view1.getLocationOnScreen(view1Loc)
        val view1Rect = android.graphics.Rect(
            view1Loc[0],
            view1Loc[1],
            view1Loc[0] + view1.width,
            view1Loc[1] + view1.height
        )

        val view2Loc = IntArray(2)
        view2.getLocationOnScreen(view2Loc)
        val view2Rect = android.graphics.Rect(
            view2Loc[0],
            view2Loc[1],
            view2Loc[0] + view2.width,
            view2Loc[1] + view2.height
        )

        return view1Rect.intersect(view2Rect)
    }

    override fun onDestroy() {
        // Zatrzymaj raportowanie statystyk dla Overlay
        StatisticsWorker.stopReporting(this, isOverlay = true)
        
        super.onDestroy()

        // Zatrzymaj timer bezczynności
        stopInactivityTimer()

        // Zatrzymaj śledzenie lokalizacji
        stopLocationTracking()

        // Zwolnij WakeLock przy niszczeniu usługi
        releaseWakeLock()

        // Ukryj ikonę X, jeśli jest widoczna
        hideCloseIcon()

        if (isMinimized) {
            if (::minimizedView.isInitialized) {
                try {
                    // Sprawdź czy widok jest nadal przypisany do windowManager przed usunięciem
                    windowManager.removeView(minimizedView)
                } catch (e: IllegalArgumentException) {
                    // Widok mógł już zostać usunięty lub nie być przypisany do windowManager
                    Log.e("OverlayService", "Błąd podczas usuwania zminimalizowanego widoku: ${e.message}")
                }
            }
        } else {
            if (::overlayView.isInitialized) {
                try {
                    // Sprawdź czy widok jest nadal przypisany do windowManager przed usunięciem
                    windowManager.removeView(overlayView)
                } catch (e: IllegalArgumentException) {
                    // Widok mógł już zostać usunięty lub nie być przypisany do windowManager
                    Log.e("OverlayService", "Błąd podczas usuwania widoku: ${e.message}")
                }
            }
        }

        // Wyrejestruj receiver
        try {
            unregisterReceiver(overlayReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver mógł już zostać wyrejestrowany
            Log.e("OverlayService", "Błąd podczas wyrejestrowywania odbiornika: ${e.message}")
        }
    }

    // Inicjalizacja WakeLock - zapobiega blokowaniu ekranu podczas działania pływającego okienka
    // Używamy PARTIAL_WAKE_LOCK zamiast przestarzałego FULL_WAKE_LOCK
    private fun initializeWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "OptiDrog::OverlayWakeLock"
        )
        // Aktywuj WakeLock od razu po inicjalizacji
        acquireWakeLock()
    }

    // Aktywacja WakeLock - zapobiega blokowaniu ekranu
    private fun acquireWakeLock() {
        try {
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire() // Bez limitu czasowego dla maksymalnej skuteczności
                android.util.Log.d("OverlayService", "WakeLock aktywowany - ekran nie będzie się blokować")
            }
        } catch (e: Exception) {
            android.util.Log.e("OverlayService", "Błąd podczas aktywacji WakeLock: ${e.message}")
        }
    }

    // Zwolnienie WakeLock - pozwala na normalne blokowanie ekranu
    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                android.util.Log.d("OverlayService", "WakeLock zwolniony - ekran może się normalnie blokować")
            }
        } catch (e: Exception) {
            android.util.Log.e("OverlayService", "Błąd podczas zwalniania WakeLock: ${e.message}")
        }
    }

    // Funkcja do rozpoczęcia śledzenia lokalizacji
    private fun startLocationTracking() {
        // Sprawdzenie uprawnień
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            // Brak uprawnień - wyświetl komunikat
            distanceTextView?.text = "Brak uprawnień do lokalizacji"
            return
        }

        // Utworzenie LocationListener
        locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                // Oblicz odległość do celu
                val distance = calculateDistance(
                    location.latitude, location.longitude,
                    targetLatitude, targetLongitude
                )

                // Aktualizuj wyświetlaną odległość
                updateDistanceDisplay(distance)

                // HISTORIA PRZEJAZDÓW - rejestruj punkt GPS i sprawdzaj postoje
                recordGpsForRideHistory(location)
            }

            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {
                distanceTextView?.text = "GPS wyłączony"
            }
        }

        try {
            // Żądanie aktualizacji lokalizacji z większą częstotliwością
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                500L, // Aktualizacja co 0.5 sekundy
                0.5f, // Minimalna zmiana pozycji: 0.5 metra
                locationListener!!
            )

            // Również od dostawcy sieci dla szybszego pierwszego odczytu
            locationManager.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                500L,
                0.5f,
                locationListener!!
            )

            // Spróbuj uzyskać ostatnią znaną lokalizację
            val lastKnownLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)

            lastKnownLocation?.let { location ->
                val distance = calculateDistance(
                    location.latitude, location.longitude,
                    targetLatitude, targetLongitude
                )
                updateDistanceDisplay(distance)
            }

        } catch (e: SecurityException) {
            distanceTextView?.text = "Błąd dostępu do lokalizacji"
        }
    }

    // Funkcja do zatrzymania śledzenia lokalizacji
    private fun stopLocationTracking() {
        locationListener?.let {
            locationManager.removeUpdates(it)
        }
        locationListener = null
    }

    // === HISTORIA PRZEJAZDÓW - GPS tracking ===
    private var lastTrackLat = 0.0
    private var lastTrackLng = 0.0
    private var lastTrackTs = 0L
    private var trackSegment = 0
    private var totalTrackDistance = 0.0

    private var rideHistoryInitialized = false

    private fun initRideHistoryTracking() {
        if (rideHistoryInitialized) return
        try {
            val store = pl.optidrog.app.history.RideHistoryStore.getInstance(this)
            val currentRideId = store.getCurrentRideId()
            if (currentRideId.isNotEmpty()) {
                totalTrackDistance = store.getCurrentRideDistance()
                Log.d("OverlayService", "[RideHistory] Wznowiono śledzenie przejazdu $currentRideId, dystans: ${totalTrackDistance}m")
            }
        } catch (e: Exception) {
            Log.e("OverlayService", "[RideHistory] Błąd inicjalizacji trackingu: ${e.message}")
        }
        rideHistoryInitialized = true
    }

    private fun recordGpsForRideHistory(location: Location) {
        try {
            // Sprawdź czy historia przejazdów jest włączona w ustawieniach
            val store = pl.optidrog.app.history.RideHistoryStore.getInstance(this)
            if (!store.isHistoryEnabled()) {
                return // Historia wyłączona - nie rejestruj punktów GPS
            }
            
            initRideHistoryTracking()

            val currentRideId = store.getCurrentRideId()
            if (currentRideId.isEmpty()) return

            val now = System.currentTimeMillis()
            val accuracy = location.accuracy

            if (accuracy > 50f) return

            val timeDelta = now - lastTrackTs
            val distDelta = if (lastTrackLat != 0.0) {
                calculateDistance(lastTrackLat, lastTrackLng, location.latitude, location.longitude)
            } else {
                Double.MAX_VALUE
            }

            if (lastTrackTs > 0 && now - lastTrackTs > 60000) {
                trackSegment++
            }

            if (timeDelta >= 5000 || distDelta >= 10.0 || lastTrackTs == 0L) {
                store.addTrackPoint(location.latitude, location.longitude, accuracy, now, trackSegment)

                if (lastTrackLat != 0.0 && distDelta < 50000) {
                    totalTrackDistance += distDelta
                    store.updateDistance(totalTrackDistance)
                }

                lastTrackLat = location.latitude
                lastTrackLng = location.longitude
                lastTrackTs = now
            }

            store.checkStopProximity(location.latitude, location.longitude, now)
        } catch (e: Exception) {
            Log.e("OverlayService", "[RideHistory] Błąd GPS tracking: ${e.message}")
        }
    }

    // Funkcja do obliczania odległości w linii prostej (wzór haversine)
    private fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val earthRadius = 6371000.0 // Promień Ziemi w metrach

        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)

        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)

        val c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return earthRadius * c
    }

    // Funkcja pomocnicza do zaokrąglania
    private fun Double.round(decimals: Int): Double {
        var multiplier = 1.0
        repeat(decimals) { multiplier *= 10 }
        return kotlin.math.round(this * multiplier) / multiplier
    }

    // Metoda do wyświetlania informacji o ustawieniach paczki
    private fun setupPackageInfoDisplay() {
        val packageInfoContainer = overlayView?.findViewById<LinearLayout>(R.id.package_info_container)

        if (packageInfoContainer != null) {
            try {
                // Parsuj JSON z ustawieniami paczki (jeśli dostępny)
                // Logowanie dla debugowania
                Log.d("OverlayService", "Otrzymano ustawienia paczki: $packageSettingsJson")
                
                // Zawsze twórz obiekt JSON, nawet gdy packageSettingsJson jest null lub pusty
                val jsonObject = if (packageSettingsJson != "null" && packageSettingsJson != null && packageSettingsJson.isNotEmpty()) {
                    org.json.JSONObject(packageSettingsJson)
                } else {
                    // Pusty obiekt JSON bez domyślnych wartości
                    org.json.JSONObject()
                }

                // Zmienna śledząca czy jakiekolwiek dane są dostępne do wyświetlenia
                var hasAnyData = false

                // Pobierz elementy TextView
                val sizeTextView = overlayView?.findViewById<TextView>(R.id.package_size_text)
                val deliveryTypeTextView = overlayView?.findViewById<TextView>(R.id.package_delivery_type_text)
                val packageTypeTextView = overlayView?.findViewById<TextView>(R.id.package_type_text)
                val positionTextView = overlayView?.findViewById<TextView>(R.id.package_position_text)
                val sideTextView = overlayView?.findViewById<TextView>(R.id.package_side_text)
                val floorTextView = overlayView?.findViewById<TextView>(R.id.package_floor_text)
                val phoneTextView = overlayView?.findViewById<TextView>(R.id.package_phone_text)

                // Mapowanie wartości na polskie nazwy
                val sizeLabels = mapOf(
                    "small" to "Mała",
                    "medium" to "Średnia",
                    "large" to "Duża"
                )

                val typeLabels = mapOf(
                    "box" to "Pudełko",
                    "bag" to "Worek",
                    "letter" to "List"
                )

                val positionLabels = mapOf(
                    "front" to "Przód",
                    "middle" to "Środek",
                    "back" to "Tył"
                )

                val sideLabels = mapOf(
                    "left" to "Lewa strona",
                    "right" to "Prawa strona"
                )

                val floorLabels = mapOf(
                    "ground" to "Podłoga",
                    "shelf" to "Półka"
                )

                // Mapowanie typu dostawy/odbioru
                val deliveryTypeLabels = mapOf(
                    "delivery" to "Dostawa",
                    "pickup" to "Odbiór"
                )

                // Pobierz wartości z JSON i przetłumacz na polski
                val sizeValue = jsonObject.optString("size", "")
                val typeValue = jsonObject.optString("type", "")
                val positionValue = jsonObject.optString("vehiclePosition", "")
                val sideValue = jsonObject.optString("vehicleSide", "")
                val floorValue = jsonObject.optString("floor", "")
                val phoneValue = jsonObject.optString("phone", "")
                val deliveryTypeValue = jsonObject.optString("deliveryType", "")

                // Ustaw tekst i widoczność dla każdego pola z polskimi tłumaczeniami
                // Wyświetl typ dostawy/odbioru tylko jeśli został określony
                if (deliveryTypeValue.isNotEmpty()) {
                    val deliveryTypeLabel = deliveryTypeLabels[deliveryTypeValue] ?: deliveryTypeValue
                    
                    // Logowanie wartości deliveryType dla debugowania
                    Log.d("OverlayService", "deliveryTypeValue z JSON: '$deliveryTypeValue', po mapowaniu: '$deliveryTypeLabel'")
                    
                    deliveryTypeTextView?.text = "Typ dostawy: $deliveryTypeLabel"
                    deliveryTypeTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                } else {
                    // Ukryj pole typu dostawy, gdy nie jest określone
                    Log.d("OverlayService", "Brak określonego typu dostawy - ukrywam pole")
                    deliveryTypeTextView?.visibility = View.GONE
                }

                // Wyświetl rozmiar paczki jeśli jest dostępny
                if (sizeValue.isNotEmpty()) {
                    sizeTextView?.text = "Rozmiar paczki: ${sizeLabels[sizeValue] ?: "Nie określono"}"
                    sizeTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                } else {
                    sizeTextView?.visibility = View.GONE
                }

                // Wyświetl typ paczki jeśli jest dostępny
                if (typeValue.isNotEmpty()) {
                    packageTypeTextView?.text = "Typ paczki: ${typeLabels[typeValue] ?: typeValue}"
                    packageTypeTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                } else {
                    packageTypeTextView?.visibility = View.GONE
                }

                // Wyświetl pozycję w pojeździe jeśli jest dostępna
                if (positionValue.isNotEmpty()) {
                    positionTextView?.text = "Miejsce w pojeździe: ${positionLabels[positionValue] ?: "Nie określono"}"
                    positionTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                } else {
                    positionTextView?.visibility = View.GONE
                }

                // Wyświetl stronę pojazdu jeśli jest dostępna
                if (sideValue.isNotEmpty()) {
                    sideTextView?.text = "Strona pojazdu: ${sideLabels[sideValue] ?: "Nie określono"}"
                    sideTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                } else {
                    sideTextView?.visibility = View.GONE
                }

                // Wyświetl podłogę jeśli jest dostępna
                if (floorValue.isNotEmpty()) {
                    floorTextView?.text = "Podłoga: ${floorLabels[floorValue] ?: "Nie określono"}"
                    floorTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                } else {
                    floorTextView?.visibility = View.GONE
                }

                // Wyświetl numer telefonu jeśli jest dostępny
                if (phoneValue.isNotEmpty()) {
                    phoneTextView?.text = "Tel: $phoneValue"
                    phoneTextView?.setTypeface(null, android.graphics.Typeface.BOLD) // Wymuszenie pogrubienia
                    phoneTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                    Log.d("OverlayService", "Wyświetlono numer telefonu: $phoneValue")
                } else {
                    phoneTextView?.visibility = View.GONE
                }

                // Wyświetl notatki jeśli są dostępne
                if (savedNotes.isNotEmpty()) {
                    val notesTextView = overlayView?.findViewById<TextView>(R.id.package_notes_text)
                    notesTextView?.text = "Notatki: $savedNotes"
                    notesTextView?.visibility = View.VISIBLE
                    hasAnyData = true // Zapisujemy, że mamy dane do wyświetlenia
                    Log.d("OverlayService", "Wyświetlono notatki: $savedNotes")
                } else {
                    val notesTextView = overlayView?.findViewById<TextView>(R.id.package_notes_text)
                    notesTextView?.visibility = View.GONE
                }

                // Pokaż kontener tylko jeśli są jakieś dane do wyświetlenia
                if (hasAnyData) {
                    packageInfoContainer.visibility = View.VISIBLE
                    Log.d("OverlayService", "Wyświetlono kontener ustawień paczki (są dostępne dane)")
                } else {
                    packageInfoContainer.visibility = View.GONE
                    Log.d("OverlayService", "Ukryto kontener ustawień paczki (brak danych do wyświetlenia)")
                }


                Log.d("OverlayService", "Wyświetlono informacje o paczce: typ dostawy=$deliveryTypeValue, rozmiar=$sizeValue, typ=$typeValue, pozycja=$positionValue, strona=$sideValue, podłoga=$floorValue, telefon=$phoneValue")

            } catch (e: Exception) {
                Log.e("OverlayService", "Błąd podczas parsowania ustawień paczki: ${e.message}")
                // W przypadku błędu, ukryj kontener, ponieważ nie mamy poprawnych danych do wyświetlenia
                packageInfoContainer.visibility = View.GONE
            }
        }
    }

    // Funkcja do zapisywania pozycji pełnego okienka
    private fun saveOverlayPosition(x: Int, y: Int) {
        sharedPreferences.edit()
            .putInt(KEY_OVERLAY_X, x)
            .putInt(KEY_OVERLAY_Y, y)
            .apply()
    }

    // Funkcja do zapisywania pozycji zminimalizowanego okienka
    private fun saveMinimizedPosition(x: Int, y: Int) {
        sharedPreferences.edit()
            .putInt(KEY_MINIMIZED_X, x)
            .putInt(KEY_MINIMIZED_Y, y)
            .apply()
    }

    companion object {
        // Metoda pomocnicza do sprawdzania, czy aplikacja ma uprawnienia do wyświetlania nad innymi aplikacjami
        fun canDrawOverlays(context: Context): Boolean {
            return Settings.canDrawOverlays(context)
        }
    }

    // Metoda do wyświetlania widoku zakończenia wszystkich adresów
    private fun showCompletionOverlay() {
        // Zatrzymaj śledzenie lokalizacji
        stopLocationTracking()

        // Usuń istniejące widoki
        try {
            if (isMinimized && ::minimizedView.isInitialized && minimizedView.parent != null) {
                windowManager.removeView(minimizedView)
            }
            if (!isMinimized && ::overlayView.isInitialized && overlayView.parent != null) {
                windowManager.removeView(overlayView)
            }
        } catch (e: Exception) {
            // Ignoruj błędy usuwania widoków
        }

        // Utwórz widok zakończenia z własnym layoutem
        // Ujednolicenie stylu: używamy gotowego tła overlay_background (gradient dark_secondary→dark_tertiary + ramka accent)
        val completionView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(24, 24, 24, 24)
            setBackgroundResource(R.drawable.overlay_background) // Spójny ciemny motyw
        }

        // Ikona sukcesu
        val iconTextView = TextView(this).apply {
            text = "🎉"
            textSize = 32f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        }

        // Tytuł
        val titleTextView = TextView(this).apply {
            text = "Gratulacje!"
            textSize = 20f
            setTextColor(resources.getColor(R.color.accent_orange, null))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 12)
            setTypeface(null, android.graphics.Typeface.BOLD)
        }

        // Główny tekst
        val messageTextView = TextView(this).apply {
            text = "Wszystkie adresy zostały odwiedzone!\n\nNawigacja zakończona."
            textSize = 16f
            setTextColor(resources.getColor(R.color.text_primary, null))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
            setLineSpacing(1.2f, 1.0f)
        }

        // Instrukcja
        val instructionTextView = TextView(this).apply {
            text = "Dotknij, aby zamknąć"
            textSize = 12f
            setTextColor(resources.getColor(R.color.text_secondary, null))
            gravity = Gravity.CENTER
            setTypeface(null, android.graphics.Typeface.ITALIC)
        }

        // Dodaj wszystkie elementy do głównego layoutu
        completionView.addView(iconTextView)
        completionView.addView(titleTextView)
        completionView.addView(messageTextView)
        completionView.addView(instructionTextView)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            },
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.CENTER
        
        // OBSŁUGA EDGE-TO-EDGE DLA WIDOKU ZAKOŃCZENIA - pozycjonowanie względem bezpiecznych obszarów
        // Dla widoku centralnego nie potrzebujemy korekty, ale upewnijmy się, że nie nachodzi na paski systemowe
        try {
            // W Service nie mamy dostępu do window.decorView, dlatego pobieramy wymiary z DisplayMetrics
            val displayMetrics = resources.displayMetrics
            val screenWidth = displayMetrics.widthPixels
            val screenHeight = displayMetrics.heightPixels
            
            Log.d("OverlayEdgeToEdge", "Completion overlay screen dimensions: width=$screenWidth, height=$screenHeight")
        } catch (e: Exception) {
            Log.e("OverlayEdgeToEdge", "Failed to get safe areas for completion overlay: ${e.message}")
        }

        // Dodaj obsługę kliknięcia, aby zamknąć overlay po 5 sekundach lub po kliknięciu
        completionView.setOnClickListener {
            try {
                windowManager.removeView(completionView)
            } catch (e: IllegalArgumentException) {
                Log.e("OverlayService", "Błąd podczas usuwania widoku potwierdzenia po kliknięciu: ${e.message}")
            }
            stopSelf()
        }

        // Automatyczne zamknięcie po 10 sekundach
        val autoCloseHandler = android.os.Handler(android.os.Looper.getMainLooper())
        autoCloseHandler.postDelayed({
            try {
                if (completionView.parent != null) {
                    windowManager.removeView(completionView)
                }
                stopSelf()
            } catch (e: Exception) {
                // Ignoruj błędy, ale zaloguj je
                Log.e("OverlayService", "Błąd podczas automatycznego usuwania widoku potwierdzenia: ${e.message}")
                stopSelf() // Mimo błędu, zatrzymaj usługę
            }
        }, 10000L)

        windowManager.addView(completionView, params)
        isMinimized = false
    }

    // Helper do wysyłania broadcastu do MainActivity
    private fun sendOverlayActionBroadcast(action: String) {
        // Tworzymy Intent z podaną akcją (akcja powinna być już zprefiksowana dla NEXT/DONE/COMPLETED)
        val intent = Intent(action)
        intent.putExtra("address", savedAddress)
        intent.setPackage(packageName)
        sendBroadcast(intent)
        // Aktualizacja overlay adresu tylko dla akcji NEXT/DONE (używamy nowych zprefiksowanych nazw)
        if (action == "pl.optidrog.app.ACTION_OVERLAY_NEXT" || action == "pl.optidrog.app.ACTION_OVERLAY_DONE") {
            val updateIntent = Intent("ACTION_UPDATE_OVERLAY_ADDRESS") // Lokalna akcja (bez potrzeby prefiksu)
            updateIntent.putExtra("address", savedAddress)
            updateIntent.setPackage(packageName)
            sendBroadcast(updateIntent)
        }
    }

    /**
     * Wyświetla dodatkowy overlay z miniaturami zdjęć (maksymalnie 2) powiązanych z adresem.
     * Każde zdjęcie można powiększyć klikając w miniaturę.
     * Użytkownik może zamknąć okienko klikając przycisk Zamknij.
     */
    private fun showPhotosOverlay() {
        if (savedPhotos.isEmpty()) {
            // Usunięto Toast - zamiast tego tylko log informacyjny
            Log.d("OverlayService", "Brak zdjęć dla tego adresu - pomijam wyświetlenie overlay zdjęć")
            return
        }

        // Utwórz kontener główny listy miniatur
        // Ujednolicenie stylu: zastępujemy ręczne kolory + GradientDrawable zasobem overlay_background
        val photosView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 20, 20, 20)
            elevation = 12f
            setBackgroundResource(R.drawable.overlay_background) // Spójny ciemny motyw
        }

        // Tytuł
        val titleText = TextView(this).apply {
            text = "Zdjęcia adresu"
            textSize = 16f
            setTextColor(resources.getColor(R.color.accent_orange, null))
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, 12)
        }
        photosView.addView(titleText)

        // ScrollView na miniatury
        val scroll = ScrollView(this).apply { isFillViewport = true }
        val imagesContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 0)
        }

        // Dodaj obrazy + listener do powiększenia
        savedPhotos.forEachIndexed { index, base64Image ->
            try {
                val cleanBase64 = base64Image.substringAfter("base64,")
                val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

                val imageView = ImageView(this).apply {
                    setImageBitmap(bitmap)
                    adjustViewBounds = true
                    layoutParams = LinearLayout.LayoutParams(200, 200).apply {
                        setMargins(4, 4, 4, 4)
                    }
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    contentDescription = "Zdjęcie ${index + 1}"
                    // Kliknięcie – powiększ zdjęcie w osobnym overlay
                    setOnClickListener {
                        showSinglePhotoOverlay(bitmap, index + 1)
                    }
                }
                imagesContainer.addView(imageView)
            } catch (e: Exception) {
                Log.e("OverlayService", "Błąd dekodowania zdjęcia: ${e.message}")
            }
        }

        scroll.addView(imagesContainer)
        photosView.addView(scroll)

        // Przycisk zamknięcia listy zdjęć
        val closeBtn = Button(this).apply {
            text = "Zamknij"
            setBackgroundResource(R.drawable.button_done_background)
            setTextColor(resources.getColor(R.color.text_primary, null))
            textSize = 12f
            setPadding(20, 10, 20, 10)
            elevation = 4f
            isAllCaps = false
        }
        photosView.addView(closeBtn)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.CENTER }

        windowManager.addView(photosView, params)

        // Zamknięcie okna miniatur
        closeBtn.setOnClickListener {
            try {
                windowManager.removeView(photosView)
            } catch (_: Exception) {}
        }

        photosView.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_OUTSIDE) {
                try { windowManager.removeView(photosView) } catch (_: Exception) {}
                true
            } else false
        }
    }

    /**
     * Wyświetla pojedyncze powiększone zdjęcie w centrum ekranu.
     * Umożliwia zamknięcie przez przycisk lub kliknięcie poza obszarem (opcjonalnie).
     */
    private fun showSinglePhotoOverlay(bitmap: android.graphics.Bitmap, index: Int) {
        // Pobierz wymiary ekranu aby ustawić ~70% szerokości i wysokości
        val displayMetrics = resources.displayMetrics
        val targetWidth = (displayMetrics.widthPixels * 0.7f).toInt()          // 70% szerokości ekranu
        val targetHeight = (displayMetrics.heightPixels * 0.7f).toInt()        // 70% wysokości ekranu

        // Kontener główny powiększonego zdjęcia (wewnętrzny layout)
        // Ujednolicenie stylu powiększonego zdjęcia: ciemny motyw z zasobu overlay_background
        val fullView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32) // Większy padding dla dużego podglądu
            elevation = 18f
            setBackgroundResource(R.drawable.overlay_background) // Spójny ciemny motyw
        }

        // Tytuł
        val header = TextView(this).apply {
            text = "Zdjęcie $index"
            textSize = 20f
            setTextColor(resources.getColor(R.color.accent_orange, null))
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, 20)
        }
        fullView.addView(header)

        // ScrollView dla obrazka (jeśli większy niż dostępny obszar)
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            // Ustaw minimalne rozmiary scrolla żeby zajął większość powierzchni
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            ).apply {
                setMargins(0, 0, 0, 24)
            }
        }

        val innerContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Obraz powiększony – dopasowanie do szerokości kontenera z zachowaniem proporcji
        val bigImage = ImageView(this).apply {
            setImageBitmap(bitmap)
            adjustViewBounds = true
            // Ustaw szerokość na MATCH_PARENT aby wykorzystać 70% ekranu (nadane przez params zewnętrzne)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 24)
            }
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "Powiększone zdjęcie $index"
        }

        // Dodaj obraz do kontenera
        innerContainer.addView(bigImage)
        scroll.addView(innerContainer)
        fullView.addView(scroll)

        // Przycisk zamknięcia poniżej
        val closeBtn = Button(this).apply {
            text = "Zamknij"
            setBackgroundResource(R.drawable.button_done_background)
            setTextColor(resources.getColor(R.color.text_primary, null))
            textSize = 16f
            setPadding(32, 18, 32, 18)
            elevation = 6f
            isAllCaps = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL
            }
        }
        fullView.addView(closeBtn)

        // Parametry okna – wymuszenie docelowego rozmiaru (~70% ekranu)
        val params = WindowManager.LayoutParams(
            targetWidth,
            targetHeight,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            // Dodaj FLAG_LAYOUT_IN_SCREEN aby lepiej wykorzystać przestrzeń + NOT_FOCUSABLE by nie przejmować fokusu
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }

        // Dodaj widok
        windowManager.addView(fullView, params)

        // Zamknięcie
        closeBtn.setOnClickListener {
            try { windowManager.removeView(fullView) } catch (_: Exception) {}
        }

        // Prosta obsługa kliknięcia poza (opcjonalne wyłączenie)
        fullView.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_OUTSIDE) {
                try { windowManager.removeView(fullView) } catch (_: Exception) {}
                true
            } else false
        }
    }
    
    // ===== METODY POMOCNICZE DO OBSŁUGI EDGE-TO-EDGE W OVERLAY =====
    
    /**
     * Oblicza bezpieczną pozycję dla overlay, uwzględniając system bars i display cutouts
     * @param x Proponowana pozycja X
     * @param y Proponowana pozycja Y
     * @return Para (safeX, safeY) z skorygowaną pozycją
     */
    private fun getSafeOverlayPosition(x: Int, y: Int): Pair<Int, Int> {
        
        try {
            // W Service nie mamy dostępu do window.decorView
            // Pobierz wymiary ekranu z DisplayMetrics
            val displayMetrics = resources.displayMetrics
            val screenWidth = displayMetrics.widthPixels
            val screenHeight = displayMetrics.heightPixels
            
            // Dla Service'u używamy domyślnych marginesów
            // Bezpieczne obszary obliczamy na podstawie wymiarów ekranu
            val maxLeftInset = 0
            val maxTopInset = 0
            val maxRightInset = 0
            val maxBottomInset = 0
            
            // Oblicz bezpieczne granice
            val safeLeft = maxLeftInset
            val safeTop = maxTopInset
            val safeRight = screenWidth - maxRightInset
            val safeBottom = screenHeight - maxBottomInset
            
            // Skoryguj pozycję X, aby nie wychodziła poza bezpieczny obszar
            val safeX = x.coerceIn(safeLeft, safeRight - 200) // 200 to szacunkowa szerokość overlay
            
            // Skoryguj pozycję Y, aby nie wychodziła poza bezpieczny obszar
            val safeY = y.coerceIn(safeTop, safeBottom - 300) // 300 to szacunkowa wysokość overlay
            
            Log.d("OverlayEdgeToEdge", "Safe position calculation: original=($x,$y), safe=($safeX,$safeY)")
            Log.d("OverlayEdgeToEdge", "Safe areas: left=$safeLeft, top=$safeTop, right=$safeRight, bottom=$safeBottom")
            
            return Pair(safeX, safeY)
        } catch (e: Exception) {
            Log.e("OverlayEdgeToEdge", "Failed to calculate safe position: ${e.message}")
            // W przypadku błędu, zwróć oryginalną pozycję
            return Pair(x, y)
        }
    }
    
    /**
     * Aktualizuje pozycję overlay, aby pozostała w bezpiecznym obszarze po przeciągnięciu
     * @param view Widok overlay
     * @param params Parametry WindowManager
     * @param proposedX Proponowana pozycja X
     * @param proposedY Proponowana pozycja Y
     */
    private fun updateSafeOverlayPosition(view: View, params: WindowManager.LayoutParams, proposedX: Int, proposedY: Int) {
        val safePosition = getSafeOverlayPosition(proposedX, proposedY)
        params.x = safePosition.first
        params.y = safePosition.second
        
        try {
            windowManager.updateViewLayout(view, params)
        } catch (e: Exception) {
            Log.e("OverlayEdgeToEdge", "Failed to update overlay position: ${e.message}")
        }
    }
}