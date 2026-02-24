package pl.optidrog.app.statistics

import android.content.Context
import android.util.Log
import androidx.work.*
import java.util.concurrent.TimeUnit

class StatisticsWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val isOverlay = inputData.getBoolean("is_overlay", false)
        val repository = StatisticsRepository(applicationContext)
        
        repository.reportActive(isOverlay)
        
        return Result.success()
    }

    companion object {
        private const val WORK_NAME_APP = "statistics_report_app"
        private const val WORK_NAME_OVERLAY = "statistics_report_overlay"

        fun startPeriodicReporting(context: Context, isOverlay: Boolean) {
            Log.d("StatisticsRepo", "Wywołano startPeriodicReporting(isOverlay=$isOverlay)")
            val data = workDataOf("is_overlay" to isOverlay)

            // 1. Natychmiastowe raportowanie (jednorazowe) dla celów debugowania
            val immediateRequest = OneTimeWorkRequestBuilder<StatisticsWorker>()
                .setInputData(data)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context).enqueue(immediateRequest)

            // 2. Raportowanie okresowe (minimum 15 minut wg specyfikacji Android)
            val workRequest = PeriodicWorkRequestBuilder<StatisticsWorker>(15, TimeUnit.MINUTES)
                .setInputData(data)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()

            val workName = if (isOverlay) WORK_NAME_OVERLAY else WORK_NAME_APP
            
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                workName,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
        }

        fun stopReporting(context: Context, isOverlay: Boolean) {
            val workName = if (isOverlay) WORK_NAME_OVERLAY else WORK_NAME_APP
            WorkManager.getInstance(context).cancelUniqueWork(workName)
        }
    }
}
