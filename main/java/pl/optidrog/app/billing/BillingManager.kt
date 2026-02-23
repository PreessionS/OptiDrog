package pl.optidrog.app.billing

import android.app.Activity
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import pl.optidrog.app.AdManager

/**
 * Zarządza interakcją z Google Play Billing i aktualizuje status premium.
 */
class BillingManager(
    private val activity: Activity,
    private val adManager: AdManager,
    private val repository: PremiumRepository,
    private val listener: Listener? = null
) : PurchasesUpdatedListener {

    interface Listener {
        fun onPremiumStatusChanged(status: PremiumStatus)
        fun onBillingReady()
        fun onBillingError(message: String)
        fun onRestoreComplete(success: Boolean, message: String)
    }

    private val billingClient: BillingClient = BillingClient.newBuilder(activity.applicationContext)
        .enablePendingPurchases()
        .setListener(this)
        .build()

    private val productDetailsMap = mutableMapOf<String, ProductDetails>()
    private var isBillingReady = false

    fun startBillingConnection() {
        if (billingClient.isReady) {
            isBillingReady = true
            onBillingReadyInternal()
            return
        }

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "BillingClient połączony")
                    isBillingReady = true
                    onBillingReadyInternal()
                } else {
                    val message = "Błąd inicjalizacji BillingClient: ${billingResult.responseCode}"
                    Log.e(TAG, message)
                    listener?.onBillingError(message)
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "BillingClient rozłączony - ponawiam próbę")
                isBillingReady = false
                // Spróbuj ponownie po krótkim czasie
                activity.window?.decorView?.postDelayed({ startBillingConnection() }, RECONNECT_DELAY_MS)
            }
        })
    }

    fun destroy() {
        if (billingClient.isReady) {
            billingClient.endConnection()
        }
    }

    fun launchPremiumPurchase(productId: String) {
        // WALIDACJA: Sprawdź czy productId jest zgodny z zdefiniowanymi produktami
        if (!PremiumProducts.ALL_PRODUCTS.contains(productId)) {
            Log.e(TAG, "Nieprawidłowy identyfikator produktu: $productId. Dozwolone ID: ${PremiumProducts.ALL_PRODUCTS}")
            listener?.onBillingError("Nieprawidłowy identyfikator produktu. Skontaktuj się z supportem.")
            return
        }
        
        if (!isBillingReady) {
            listener?.onBillingError("System płatności jest jeszcze inicjalizowany. Spróbuj ponownie za chwilę.")
            return
        }

        val productDetails = productDetailsMap[productId]
        if (productDetails == null) {
            Log.w(TAG, "Nie znaleziono szczegółów produktu dla ID: $productId. Próba ponownego pobrania...")
            listener?.onBillingError("Nie udało się pobrać oferty dla wybranego planu.")
            queryProductDetails()
            return
        }

        val offerToken = productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
        if (offerToken.isNullOrEmpty()) {
            listener?.onBillingError("Oferta subskrypcji jest niepoprawnie skonfigurowana w Google Play Console.")
            return
        }

        val productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)
            .setOfferToken(offerToken)
            .build()

        val billingParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productDetailsParams))
            .build()

        billingClient.launchBillingFlow(activity, billingParams)
    }


    fun restorePremium() {
        if (!isBillingReady) {
            listener?.onRestoreComplete(false, "System płatności nie jest jeszcze gotowy. Spróbuj ponownie za chwilę.")
            startBillingConnection()
            return
        }
        Log.d(TAG, "🔄 Rozpoczynanie przywracania zakupów...")
        queryActiveSubscriptions(isManualRestore = true)
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (!purchases.isNullOrEmpty()) {
                    handlePurchases(purchases)
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                Log.d(TAG, "Użytkownik anulował zakup")
            }
            else -> {
                val message = "Błąd podczas realizacji zakupu: ${result.debugMessage}"
                Log.e(TAG, message)
                listener?.onBillingError(message)
            }
        }
    }

    private fun onBillingReadyInternal() {
        queryProductDetails()
        queryActiveSubscriptions()
        listener?.onBillingReady()
    }

    private fun queryProductDetails() {
        val products = PremiumProducts.ALL_PRODUCTS.map { productId ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductType(ProductType.SUBS)
                .setProductId(productId)
                .build()
        }

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsList ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && !productDetailsList.isNullOrEmpty()) {
                productDetailsList.forEach { details ->
                    productDetailsMap[details.productId] = details
                }
            } else {
                Log.w(TAG, "Nie udało się pobrać ProductDetails: ${billingResult.debugMessage}")
            }
        }
    }

    private fun queryActiveSubscriptions(isManualRestore: Boolean = false) {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(ProductType.SUBS)
            .build()

        billingClient.queryPurchasesAsync(params) { billingResult, purchases ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
                handlePurchases(purchases, isManualRestore)
            } else if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                updatePremiumStatus(PremiumStatus.INACTIVE.copy(lastSyncedAt = System.currentTimeMillis()))
                if (isManualRestore) {
                    listener?.onRestoreComplete(false, "Nie znaleziono aktywnych subskrypcji na tym koncie Google.")
                }
            } else {
                val message = "Nie udało się pobrać aktywnych subskrypcji: ${billingResult.debugMessage}"
                Log.e(TAG, message)
                listener?.onBillingError(message)
                if (isManualRestore) {
                    listener?.onRestoreComplete(false, "Wystąpił błąd podczas przywracania. Sprawdź połączenie internetowe i spróbuj ponownie.")
                }
            }
        }
    }

    private fun handlePurchases(purchases: List<Purchase>, isManualRestore: Boolean = false) {
        val premiumPurchases = purchases.filter { purchase ->
            purchase.products.any { PremiumProducts.ALL_PRODUCTS.contains(it) }
        }

        if (premiumPurchases.isEmpty()) {
            updatePremiumStatus(PremiumStatus.INACTIVE.copy(lastSyncedAt = System.currentTimeMillis()))
            if (isManualRestore) {
                listener?.onRestoreComplete(false, "Nie znaleziono aktywnych subskrypcji na tym koncie Google.")
            }
            return
        }

        premiumPurchases.forEach { purchase ->
            if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                if (!purchase.isAcknowledged) {
                    acknowledgePurchase(purchase)
                }
                val productId = purchase.products.firstOrNull()
                // Oblicz szacowaną datę wygaśnięcia na podstawie czasu zakupu i typu produktu
                val estimatedExpiryTime = calculateEstimatedExpiryTime(purchase.purchaseTime, productId)
                
                val status = PremiumStatus(
                    isActive = true,
                    productId = productId,
                    purchaseToken = purchase.purchaseToken,
                    autoRenewing = purchase.isAutoRenewing,
                    lastSyncedAt = System.currentTimeMillis(),
                    purchaseTimeMillis = purchase.purchaseTime,
                    expiryTimeMillis = estimatedExpiryTime
                )
                updatePremiumStatus(status)
                
                if (isManualRestore) {
                    val planName = when (productId) {
                        PremiumProducts.MONTHLY_PRODUCT_ID -> "Premium Miesięczne"
                        PremiumProducts.YEARLY_PRODUCT_ID -> "Premium Roczne"
                        else -> "Premium"
                    }
                    listener?.onRestoreComplete(true, "✅ Przywrócono $planName!")
                }
            }
        }
    }

    private fun acknowledgePurchase(purchase: Purchase) {
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()

        billingClient.acknowledgePurchase(params) { billingResult ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                Log.d(TAG, "Subskrypcja potwierdzona")
            } else {
                Log.w(TAG, "Nie udało się potwierdzić subskrypcji: ${billingResult.debugMessage}")
            }
        }
    }

    private fun updatePremiumStatus(status: PremiumStatus) {
        repository.saveStatus(status)
        adManager.updatePremiumStatus(status.isActive)
        listener?.onPremiumStatusChanged(status)
    }
    
    /**
     * Oblicza szacowaną datę wygaśnięcia subskrypcji na podstawie czasu zakupu i typu produktu.
     * Jest to rozwiązanie tymczasowe, gdy nie mamy dostępu do Google Play Developer API.
     */
    private fun calculateEstimatedExpiryTime(purchaseTime: Long, productId: String?): Long? {
        if (productId == null) return null
        
        val daysToAdd = when (productId) {
            PremiumProducts.MONTHLY_PRODUCT_ID -> 30
            PremiumProducts.YEARLY_PRODUCT_ID -> 365
            else -> 30 // domyślnie 30 dni
        }
        
        // Dodaj odpowiednią liczbę dni do czasu zakupu
        return purchaseTime + (daysToAdd * 24 * 60 * 60 * 1000L)
    }
    
    /**
     * Pobiera rzeczywistą datę wygaśnięcia z Google Play Developer API.
     * Wymaga skonfigurowanego serwera z dostępem do Google Play Developer API.
     * Ta metoda jest przygotowana dla przyszłej implementacji.
     */
    private suspend fun fetchRealExpiryTime(purchaseToken: String): Long? {
        // TODO: Zaimplementować połączenie z Google Play Developer API
        // Przykład wywołania:
        // GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/subscriptions/{subscriptionId}/tokens/{purchaseToken}
        
        // Tymczasowo zwracamy null, aby używać szacowanej daty
        return null
    }

    companion object {
        private const val TAG = "BillingManager"
        private const val RECONNECT_DELAY_MS = 2000L
    }
}
