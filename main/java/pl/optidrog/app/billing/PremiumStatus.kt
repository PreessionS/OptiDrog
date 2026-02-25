package pl.optidrog.app.billing

/**
 * Reprezentuje status subskrypcji premium w aplikacji.
 */
data class PremiumStatus(
    val isActive: Boolean,
    val productId: String? = null,
    val purchaseToken: String? = null,
    val autoRenewing: Boolean = false,
    val lastSyncedAt: Long = System.currentTimeMillis(),
    // Nowe pole dla daty wygaśnięcia subskrypcji w milisekundach
    val expiryTimeMillis: Long? = null,
    // Czas zakupu w milisekundach (do obliczeń szacunkowych)
    val purchaseTimeMillis: Long? = null
) {
    val displayName: String
        get() = when (productId) {
            PremiumProducts.MONTHLY_PRODUCT_ID -> "Premium Miesięczne"
            PremiumProducts.YEARLY_PRODUCT_ID -> "Premium Roczne"
            else -> "Brak premium"
        }
    
    // Formatowana data wygaśnięcia do wyświetlenia
    val expiryDateFormatted: String?
        get() = expiryTimeMillis?.let {
            val dateFormat = java.text.SimpleDateFormat("dd.MM.yyyy", java.util.Locale.getDefault())
            dateFormat.format(java.util.Date(it))
        }
    
    // Szacowana data wygaśnięcia (gdy expiryTimeMillis jest null, ale mamy purchaseTime)
    val estimatedExpiryDateFormatted: String?
        get() = {
            if (expiryTimeMillis != null) {
                expiryDateFormatted
            } else if (purchaseTimeMillis != null && productId != null) {
                // Szacuj na podstawie typu produktu
                val daysToAdd = when (productId) {
                    PremiumProducts.MONTHLY_PRODUCT_ID -> 30
                    PremiumProducts.YEARLY_PRODUCT_ID -> 365
                    else -> 30
                }
                val estimatedExpiry = purchaseTimeMillis + (daysToAdd * 24 * 60 * 60 * 1000L)
                val dateFormat = java.text.SimpleDateFormat("dd.MM.yyyy", java.util.Locale.getDefault())
                dateFormat.format(java.util.Date(estimatedExpiry))
            } else {
                null
            }
        }()
    
    // Informacja czy subskrypcja wkrótce wygaśnie (np. w ciągu 7 dni)
    val isExpiringSoon: Boolean
        get() {
            val expiryTime = expiryTimeMillis ?: return false
            val weekFromNow = System.currentTimeMillis() + (7 * 24 * 60 * 60 * 1000L)
            return expiryTime < weekFromNow
        }

    companion object {
        val INACTIVE = PremiumStatus(isActive = false)
    }
}
