package pl.optidrog.app.billing

import android.content.Context
import pl.optidrog.app.security.SecurePreferencesManager

/**
 * Odpowiada za trwałe przechowywanie statusu premium.
 * Używa nowoczesnego API SecurePreferencesManager zamiast przestarzałych klas.
 */
class PremiumRepository(context: Context) {

    // Używamy nowoczesnego SecurePreferencesManager zamiast przestarzałego EncryptedSharedPreferences
    private val securePrefs = SecurePreferencesManager(context, PREFS_NAME)

    fun saveStatus(status: PremiumStatus) {
        // Używamy nowego API SecurePreferencesManager do zapisu danych
        securePrefs.putBoolean(KEY_IS_ACTIVE, status.isActive)
        securePrefs.putString(KEY_PRODUCT_ID, status.productId)
        securePrefs.putString(KEY_PURCHASE_TOKEN, status.purchaseToken)
        securePrefs.putBoolean(KEY_AUTO_RENEWING, status.autoRenewing)
        securePrefs.putLong(KEY_LAST_SYNC, status.lastSyncedAt)
        // Zapis nowych pól związanych z datą wygaśnięcia
        status.expiryTimeMillis?.let { securePrefs.putLong(KEY_EXPIRY_TIME, it) }
        status.purchaseTimeMillis?.let { securePrefs.putLong(KEY_PURCHASE_TIME, it) }
    }

    fun getStatus(): PremiumStatus {
        // Używamy nowego API SecurePreferencesManager do odczytu danych
        val isActive = securePrefs.getBoolean(KEY_IS_ACTIVE, false)
        val productId = securePrefs.getString(KEY_PRODUCT_ID, null)
        val purchaseToken = securePrefs.getString(KEY_PURCHASE_TOKEN, null)
        val autoRenewing = securePrefs.getBoolean(KEY_AUTO_RENEWING, false)
        val lastSync = securePrefs.getLong(KEY_LAST_SYNC, 0L)
        // Odczyt nowych pól związanych z datą wygaśnięcia
        val expiryTimeMillis = securePrefs.getLong(KEY_EXPIRY_TIME, 0L).takeIf { it > 0L }
        val purchaseTimeMillis = securePrefs.getLong(KEY_PURCHASE_TIME, 0L).takeIf { it > 0L }

        return PremiumStatus(
            isActive = isActive,
            productId = productId,
            purchaseToken = purchaseToken,
            autoRenewing = autoRenewing,
            lastSyncedAt = lastSync,
            expiryTimeMillis = expiryTimeMillis,
            purchaseTimeMillis = purchaseTimeMillis
        )
    }

    companion object {
        private const val PREFS_NAME = "OptiDrogPremium"
        private const val KEY_IS_ACTIVE = "is_active"
        private const val KEY_PRODUCT_ID = "product_id"
        private const val KEY_PURCHASE_TOKEN = "purchase_token"
        private const val KEY_AUTO_RENEWING = "auto_renewing"
        private const val KEY_LAST_SYNC = "last_sync"
        // Nowe klucze dla pól związanych z datą wygaśnięcia
        private const val KEY_EXPIRY_TIME = "expiry_time_millis"
        private const val KEY_PURCHASE_TIME = "purchase_time_millis"
    }
}
