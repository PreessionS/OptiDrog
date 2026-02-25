package pl.optidrog.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback

/**
 * Zarządza reklamami pełnoekranowymi z limitem częstotliwości i poprawnym śledzeniem
 * Wspiera funkcjonalność premium - reklamy są pomijane dla użytkowników premium
 */
class AdManager(private val context: Context) {
    
    companion object {
        private const val TAG = "AdManager"
        private const val AD_UNIT_ID = "ca-app-pub-4008386368701250/2758813633"
        private const val MIN_TIME_BETWEEN_ADS = 30_000L // 30 sekund między reklamami
        private const val AD_REQUEST_TIMEOUT = 8_000L // 8 sekund timeout
        private const val MAX_RETRY_COUNT = 3
    }
    
    // Reklama i stan
    private var interstitialAd: InterstitialAd? = null
    private var isAdLoading = false
    private var isLoadingScheduled = false
    
    // Status premium użytkownika
    private var isPremiumUser = false
    
    // Kontrola częstotliwości
    private var lastAdShownTime = 0L
    private val handler = Handler(Looper.getMainLooper())
    private var retryCount = 0
    private var loadTimeoutRunnable: Runnable? = null
    
    // Callback dla aktywności
    var onAdDismissedCallback: (() -> Unit)? = null
    
    /**
     * Inicjalizuje AdMob SDK z natychmiastowym ładowaniem reklamy
     */
    fun initialize() {
        MobileAds.initialize(context) { initializationStatus ->
            Log.d(TAG, "AdMob SDK zainicjalizowany")
            
            // Logowanie statusu adapterów
            initializationStatus.adapterStatusMap.forEach { (adapter, status) ->
                Log.d(TAG, "Adapter: $adapter, Status: ${status.initializationState}")
            }
            
            // Załaduj pierwszą reklamę natychmiast i dodatkowo za 2 sekundy
            loadAd()
            
            // Dodatkowe ładowanie po 2 sekundach jako zapasowa reklama
            handler.postDelayed({
                if (interstitialAd == null) {
                    Log.d(TAG, "🔄 Zapasowe ładowanie reklamy po 2 sekundach")
                    loadAd()
                }
            }, 2000)
        }
    }
    
    /**
     * Pokazuje reklamę z kontrolą częstotliwości
     * @return true jeśli reklama została pokazana lub będzie pokazana
     */
    fun showAd(): Boolean {
        // Jeśli użytkownik ma premium, nie pokazuj reklamy
        if (isPremiumUser) {
            Log.d(TAG, "⭐ Użytkownik premium - reklama pominięta")
            return false
        }
        
        val currentTime = System.currentTimeMillis()
        
        // Wyjątek dla pierwszej reklamy - pomiń limit czasowy przy pierwszym uruchomieniu
        val isFirstAd = lastAdShownTime == 0L
        
        // Sprawdź czy minął minimalny czas między reklamami (pomijając pierwszą reklamę)
        if (!isFirstAd && currentTime - lastAdShownTime < MIN_TIME_BETWEEN_ADS) {
            val timeRemaining = (MIN_TIME_BETWEEN_ADS - (currentTime - lastAdShownTime)) / 1000
            Log.d(TAG, "⏰ Reklama nie może być pokazana jeszcze przez ${timeRemaining}s")
            return false
        }
        
        // Jeśli to pierwsza reklama, zaktualizuj czas od razu
        if (isFirstAd) {
            Log.d(TAG, "🎯 Pierwsza reklama - pomijam limit czasowy")
        }
        
        if (interstitialAd != null) {
            Log.d(TAG, "✅ Pokazywanie reklamy")
            try {
                interstitialAd?.show(context as? androidx.appcompat.app.AppCompatActivity
                    ?: throw IllegalStateException("Context must be AppCompatActivity"))
                lastAdShownTime = currentTime
                return true
            } catch (e: Exception) {
                Log.e(TAG, "Błąd podczas wyświetlania reklamy: ${e.message}")
                return false
            }
        } else {
            Log.d(TAG, "⏳ Reklama nie jest gotowa - wymuszam ładowanie")
            // Wymuszamy ładowanie i resetujemy licznik prób, bo to akcja użytkownika
            loadAd(force = true)
            return false
        }
    }
    
    /**
     * Ładuje reklamę z kontrolą liczby prób
     * @param force Jeśli true, resetuje retryCount (używane przy akcji użytkownika)
     */
    private fun loadAd(force: Boolean = false) {
        // Nie ładuj reklam jeśli użytkownik ma premium
        if (isPremiumUser) {
            Log.d(TAG, "⭐ Premium aktywne - pomijam ładowanie reklam")
            return
        }
        
        if (isAdLoading || isLoadingScheduled) {
            Log.d(TAG, "Reklama już się ładuje lub ładowanie jest zaplanowane")
            return
        }
        
        if (force) {
            Log.d(TAG, "🔄 Wymuszone ładowanie - resetowanie retryCount")
            retryCount = 0
        }

        if (retryCount >= MAX_RETRY_COUNT) {
            Log.w(TAG, "Przekroczono maksymalną liczbę prób ładowania ($retryCount/$MAX_RETRY_COUNT)")
            return
        }
        
        isAdLoading = true
        retryCount++
        
        // Ustaw timeout dla ładowania, aby zapobiec zawieszeniu flagi isAdLoading
        loadTimeoutRunnable?.let { handler.removeCallbacks(it) }
        loadTimeoutRunnable = Runnable {
            if (isAdLoading) {
                Log.w(TAG, "⏱️ Timeout ładowania reklamy - resetowanie stanu")
                isAdLoading = false
                isLoadingScheduled = false
            }
        }.also { 
            handler.postDelayed(it, AD_REQUEST_TIMEOUT)
        }
        
        Log.d(TAG, "🔄 Ładowanie reklamy (próba $retryCount/$MAX_RETRY_COUNT)")
        
        val adRequest = AdRequest.Builder().build()
        
        InterstitialAd.load(context, AD_UNIT_ID, adRequest, object : InterstitialAdLoadCallback() {
            override fun onAdLoaded(ad: InterstitialAd) {
                Log.d(TAG, "✅ Reklama załadowana pomyślnie")
                interstitialAd = ad
                isAdLoading = false
                isLoadingScheduled = false
                retryCount = 0
                
                // Anuluj timeout
                loadTimeoutRunnable?.let { handler.removeCallbacks(it) }
                
                setupAdCallbacks(ad)
                logAdInfo(ad)
            }
            
            override fun onAdFailedToLoad(adError: LoadAdError) {
                Log.e(TAG, "❌ Błąd ładowania reklamy: ${adError.message}")
                interstitialAd = null
                isAdLoading = false
                isLoadingScheduled = false
                
                // Anuluj timeout
                loadTimeoutRunnable?.let { handler.removeCallbacks(it) }
                
                // Spróbuj ponownie z opóźnieniem
                if (retryCount < MAX_RETRY_COUNT) {
                    handler.postDelayed({
                        loadAd()
                    }, 2000L * retryCount) // Wykładniczy backoff
                }
            }
        })
    }
    
    /**
     * Planuje ładowanie reklamy z mniejszym opóźnieniem
     */
    private fun scheduleAdLoad() {
        if (isLoadingScheduled) return
        
        isLoadingScheduled = true
        handler.postDelayed({
            isLoadingScheduled = false
            loadAd()
        }, 300) // Zmniejszone opóźnienie z 1000ms do 300ms
    }
    
    /**
     * Konfiguruje callbacki dla reklamy
     */
    private fun setupAdCallbacks(ad: InterstitialAd) {
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdClicked() {
                Log.d(TAG, "🖱️ Użytkownik kliknął reklamę")
            }
            
            override fun onAdDismissedFullScreenContent() {
                Log.d(TAG, "🔄 Reklama zamknięta - ładuję następną")
                interstitialAd = null
                onAdDismissedCallback?.invoke()
                
                // Załaduj następną reklamę
                loadAd()
            }
            
            override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                Log.e(TAG, "❌ Błąd wyświetlania reklamy: ${adError.message}")
                interstitialAd = null
                
                // Spróbuj załadować nową reklamę
                loadAd()
            }
            
            override fun onAdImpression() {
                Log.d(TAG, "👁️ Reklama wygenerowała impreżję")
            }
            
            override fun onAdShowedFullScreenContent() {
                Log.d(TAG, "📱 Reklama wyświetlona na pełnym ekranie")
            }
        }
    }
    
    /**
     * Loguje szczegółowe informacje o reklamie
     */
    private fun logAdInfo(ad: InterstitialAd) {
        val responseInfo = ad.responseInfo
        Log.d(TAG, "=== INFORMACJE O REKLAMIE ===")
        Log.d(TAG, "Response ID: ${responseInfo.responseId}")
        Log.d(TAG, "Mediation Adapter: ${responseInfo.mediationAdapterClassName}")
        
        responseInfo.adapterResponses.forEachIndexed { index, adapterResponse ->
            Log.d(TAG, "--- Adapter #$index ---")
            Log.d(TAG, "Klasa: ${adapterResponse.adapterClassName}")
            Log.d(TAG, "Latencja: ${adapterResponse.latencyMillis}ms")
            
            if (adapterResponse.adapterClassName == responseInfo.mediationAdapterClassName) {
                Log.d(TAG, "🎯 ZWYCIĘZCA - Ta sieć dostarczyła reklamę!")
                
                when {
                    adapterResponse.adapterClassName.contains("unity", ignoreCase = true) -> {
                        Log.d(TAG, "📱 ŹRÓDŁO: Unity Ads")
                    }
                    adapterResponse.adapterClassName.contains("admob", ignoreCase = true) ||
                            adapterResponse.adapterClassName.isEmpty() -> {
                        Log.d(TAG, "📱 ŹRÓDŁO: Google AdMob")
                    }
                    else -> {
                        Log.d(TAG, "📱 ŹRÓDŁO: ${adapterResponse.adapterClassName}")
                    }
                }
            }
            
            adapterResponse.adError?.let { error ->
                Log.w(TAG, "❌ Błąd: ${error.message} (kod: ${error.code})")
            }
        }
        Log.d(TAG, "========================")
    }
    
    /**
     * Aktualizuje status premium użytkownika
     * @param isPremium true jeśli użytkownik ma aktywną subskrypcję premium
     */
    fun updatePremiumStatus(isPremium: Boolean) {
        this.isPremiumUser = isPremium
        Log.d(TAG, "💎 Status premium zaktualizowany: $isPremium")
        
        if (isPremium) {
            // Jeśli użytkownik ma premium, wyczyść załadowane reklamy
            interstitialAd = null
            Log.d(TAG, "⭐ Premium aktywne - reklamy wyłączone")
        } else {
            // Jeśli premium wygasło, załaduj reklamy ponownie
            Log.d(TAG, "📢 Premium nieaktywne - wznawianie reklam")
            loadAd()
        }
    }
    
    /**
     * Sprawdza czy reklama jest gotowa do wyświetlenia
     */
    fun isAdReady(): Boolean {
        return interstitialAd != null && !isAdLoading
    }
    
    /**
     * Zwraca czas do następnego możliwego wyświetlenia reklamy
     */
    fun getTimeUntilNextAd(): Long {
        val currentTime = System.currentTimeMillis()
        val timeSinceLastAd = currentTime - lastAdShownTime
        return maxOf(0, MIN_TIME_BETWEEN_ADS - timeSinceLastAd)
    }
    
    /**
     * Czyści zasoby
     */
    fun destroy() {
        handler.removeCallbacksAndMessages(null)
        interstitialAd = null
        onAdDismissedCallback = null
    }
}