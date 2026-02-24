package pl.optidrog.app

import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.util.Log
import android.view.LayoutInflater
import android.view.WindowManager
import android.widget.Button
import androidx.appcompat.app.AlertDialog

class AppRatingManager private constructor(private val context: Context) {

    private val sharedPreferences: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val editor: SharedPreferences.Editor = sharedPreferences.edit()
    private var activityContext: Context? = null // Przechowuj kontekst Activity osobno

    companion object {
        private const val PREFS_NAME = "AppRatingPrefs"
        private const val LAUNCH_COUNT_KEY = "launch_count"
        private const val RATING_SHOWN_KEY = "rating_shown"
        private const val REMINDER_COUNT_KEY = "reminder_count"

        private var instance: AppRatingManager? = null

        fun getInstance(context: Context): AppRatingManager {
            if (instance == null) {
                instance = AppRatingManager(context.applicationContext)
            }
            // Aktualizuj kontekst Activity jeśli został przekazany
            if (context is android.app.Activity) {
                instance?.activityContext = context
            }
            return instance!!
        }
    }

    /**
     * Inkrementuje licznik uruchomień aplikacji (bez wyświetlania dialogu)
     */
    fun incrementLaunchCount() {
        val currentCount = sharedPreferences.getInt(LAUNCH_COUNT_KEY, 0)
        val newCount = currentCount + 1

        Log.d("AppRatingManager", "Uruchomienie aplikacji #$newCount")

        editor.putInt(LAUNCH_COUNT_KEY, newCount)
        editor.apply()
    }

    /**
     * Sprawdza czy należy wyświetlić okienko oceny i wyświetla je jeśli to konieczne
     */
    fun checkAndShowRatingDialogIfNeeded() {
        // Sprawdź czy mamy kontekst Activity
        val activityContext = this.activityContext
        if (activityContext !is android.app.Activity) {
            Log.e("AppRatingManager", "Brak kontekstu Activity - nie można wyświetlić dialogu")
            return
        }

        val activity = activityContext as android.app.Activity

        // Sprawdź czy Activity jest w odpowiednim stanie
        if (activity.isFinishing || activity.isDestroyed) {
            Log.e("AppRatingManager", "Activity jest finishing lub destroyed - nie można wyświetlić dialogu")
            return
        }

        checkAndShowRatingDialog()
    }

    /**
     * Inkrementuje licznik uruchomień aplikacji i sprawdza czy należy wyświetlić okienko oceny
     * @deprecated Użyj incrementLaunchCount() i checkAndShowRatingDialogIfNeeded() osobno
     */
    @Deprecated("Użyj incrementLaunchCount() i checkAndShowRatingDialogIfNeeded() osobno")
    fun onAppLaunched() {
        incrementLaunchCount()
        checkAndShowRatingDialogIfNeeded()
    }

    /**
     * Sprawdza czy należy wyświetlić okienko oceny aplikacji
     */
    private fun checkAndShowRatingDialog() {
        val launchCount = sharedPreferences.getInt(LAUNCH_COUNT_KEY, 0)
        val ratingShown = sharedPreferences.getBoolean(RATING_SHOWN_KEY, false)
        val reminderCount = sharedPreferences.getInt(REMINDER_COUNT_KEY, 0)

        Log.d("AppRatingManager", "Sprawdzanie warunków: uruchomienia=$launchCount, ocena_pokazana=$ratingShown, przypomnienia=$reminderCount")

        // Jeśli ocena już została pokazana, nie wyświetlaj ponownie
        if (ratingShown) {
            Log.d("AppRatingManager", "Ocena już została pokazana - pomijam")
            return
        }

        // Oblicz wymagany licznik uruchomień (co 10 uruchomienie + przypomnienia)
        val requiredLaunches = 10 + (reminderCount * 1)

        if (launchCount >= requiredLaunches) {
            Log.d("AppRatingManager", "Warunki spełnione - wyświetlanie okienka oceny")
            showRatingDialog()
        } else {
            Log.d("AppRatingManager", "Warunki nie spełnione - wymagane uruchomienia: $requiredLaunches, aktualne: $launchCount")
        }
    }

    /**
     * Wyświetla okienko oceny aplikacji
     */
    private fun showRatingDialog() {
        try {
            // Użyj activityContext jeśli dostępny, w przeciwnym razie użyj context
            val dialogContext = activityContext ?: context
            val dialogView = LayoutInflater.from(dialogContext).inflate(R.layout.rate_app_dialog, null)

            val dialog = Dialog(dialogContext, android.R.style.Theme_Translucent_NoTitleBar).apply {
                setContentView(dialogView)
                setCancelable(false)

                // Ustawienia rozmiaru i pozycji
                val window = window
                window?.let { w ->
                    val params = w.attributes
                    params.width = WindowManager.LayoutParams.WRAP_CONTENT
                    params.height = WindowManager.LayoutParams.WRAP_CONTENT
                    params.flags = params.flags or WindowManager.LayoutParams.FLAG_DIM_BEHIND
                    params.dimAmount = 0.7f
                    w.attributes = params
                }
            }

            // Konfiguracja przycisków
            val btnRateApp = dialogView.findViewById<Button>(R.id.btn_rate_app)
            val btnRemindLater = dialogView.findViewById<Button>(R.id.btn_remind_later)

            btnRateApp.setOnClickListener {
                rateApp()
                dialog.dismiss()
            }

            btnRemindLater.setOnClickListener {
                remindLater()
                dialog.dismiss()
            }

            dialog.show()

        } catch (e: Exception) {
            Log.e("AppRatingManager", "Błąd podczas wyświetlania okienka oceny: ${e.message}")
        }
    }

    /**
     * Otwiera aplikację w Sklepie Play i oznacza ocenę jako pokazaną
     */
    private fun rateApp() {
        try {
            Log.d("AppRatingManager", "Otwieranie Sklepu Play dla oceny aplikacji")

            // Oznacz ocenę jako pokazaną, aby nie wyświetlać ponownie
            editor.putBoolean(RATING_SHOWN_KEY, true)
            editor.apply()

            // Otwórz aplikację w Sklepie Play
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("https://play.google.com/store/apps/details?id=${context.packageName}&hl=pl")
                setPackage("com.android.vending")
            }

            // Jeśli aplikacja Google Play nie jest dostępna, otwórz w przeglądarce
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)

        } catch (e: Exception) {
            Log.e("AppRatingManager", "Błąd podczas otwierania Sklepu Play: ${e.message}")

            // Fallback - otwórz w przeglądarce
            try {
                val webIntent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse("https://play.google.com/store/apps/details?id=${context.packageName}&hl=pl")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(webIntent)
            } catch (e2: Exception) {
                Log.e("AppRatingManager", "Błąd podczas otwierania w przeglądarce: ${e2.message}")
            }
        }
    }

    /**
     * Zwiększa licznik przypomnień i odkłada ocenę o kolejne 10 uruchomień
     */
    private fun remindLater() {
        val currentReminderCount = sharedPreferences.getInt(REMINDER_COUNT_KEY, 0)
        val newReminderCount = currentReminderCount + 1

        Log.d("AppRatingManager", "Przypomnienie później - zwiększanie licznika przypomnień do $newReminderCount")

        editor.putInt(REMINDER_COUNT_KEY, newReminderCount)
        editor.apply()

        // Resetuj licznik uruchomień, aby zacząć od nowa
        resetLaunchCount()
    }

    /**
     * Resetuje licznik uruchomień (używane po przypomnieniu później)
     */
    private fun resetLaunchCount() {
        Log.d("AppRatingManager", "Resetowanie licznika uruchomień")
        editor.putInt(LAUNCH_COUNT_KEY, 0)
        editor.apply()
    }

    /**
     * Zwraca aktualny licznik uruchomień (dla celów debugowania)
     */
    fun getLaunchCount(): Int {
        return sharedPreferences.getInt(LAUNCH_COUNT_KEY, 0)
    }

    /**
     * Zwraca licznik przypomnień (dla celów debugowania)
     */
    fun getReminderCount(): Int {
        return sharedPreferences.getInt(REMINDER_COUNT_KEY, 0)
    }

    /**
     * Sprawdza czy ocena została już pokazana (dla celów debugowania)
     */
    fun isRatingShown(): Boolean {
        return sharedPreferences.getBoolean(RATING_SHOWN_KEY, false)
    }

    /**
     * Resetuje wszystkie dane oceny aplikacji (dla celów testowania)
     */
    fun resetAllData() {
        Log.d("AppRatingManager", "Resetowanie wszystkich danych oceny aplikacji")
        editor.clear()
        editor.apply()
    }
}