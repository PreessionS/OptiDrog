package pl.optidrog.app.billing

/**
 * Stałe identyfikatory produktów subskrypcyjnych używane w Google Play Billing.
 */
object PremiumProducts {
    const val MONTHLY_PRODUCT_ID = "miesiac_premium"
    const val YEARLY_PRODUCT_ID = "rok_subskrybcja"
    val ALL_PRODUCTS = listOf(MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID)
}
