package pl.optidrog.app.statistics

import android.content.Context
import android.provider.Settings
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class StatisticsRepository(private val context: Context) {

    private val api: StatisticsApi

    init {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl("https://optidrog.pl/statystyki/") // TUTAJ WPISZ ADRES SWOJEGO SERWERA
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        api = retrofit.create(StatisticsApi::class.java)
    }

    suspend fun reportActive(isOverlay: Boolean) {
        val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        val isOverlayInt = if (isOverlay) 1 else 0

        try {
            val response = api.reportActivity(deviceId, isOverlayInt)
            if (response.isSuccessful) {
                Log.d("StatisticsRepo", "Statystyki wysłane pomyślnie (isOverlay: $isOverlay)")
            } else {
                Log.e("StatisticsRepo", "Błąd wysyłania statystyk: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e("StatisticsRepo", "Wyjątek podczas wysyłania statystyk: ${e.message}")
        }
    }
}
