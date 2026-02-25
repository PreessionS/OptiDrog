package pl.optidrog.app.statistics

import retrofit2.Response
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.POST

interface StatisticsApi {
    @FormUrlEncoded
    @POST("report_activity.php")
    suspend fun reportActivity(
        @Field("device_id") deviceId: String,
        @Field("is_overlay") isOverlay: Int
    ): Response<Unit>
}
