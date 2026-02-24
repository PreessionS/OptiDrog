package pl.optidrog.app.history

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class RideHistoryStore private constructor(context: Context) {

    companion object {
        private const val TAG = "RideHistory"
        private const val PREFS_NAME = "OptiDrogRideHistory"
        private const val KEY_INDEX = "rh_index"
        private const val KEY_CURRENT_RIDE = "rh_current_ride_id"
        private const val KEY_LAST_CLEANUP = "rh_last_cleanup_ts"
        private const val PREFIX_RIDE = "rh_ride_"
        private const val PREFIX_TRACK = "rh_track_"
        private const val MAX_CHUNK_SIZE = 500
        private const val MAX_RIDE_AGE_DAYS = 30
        private const val CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000L

        @Volatile
        private var instance: RideHistoryStore? = null

        fun getInstance(context: Context): RideHistoryStore {
            return instance ?: synchronized(this) {
                instance ?: RideHistoryStore(context.applicationContext).also { instance = it }
            }
        }
    }

    private val lock = Any()
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    // SharedPreferences dla ustawień aplikacji - sprawdzenie czy historia jest włączona
    private val settingsPrefs: SharedPreferences = context.getSharedPreferences("OptiDrogSettings", Context.MODE_PRIVATE)
    private val activeStops = mutableMapOf<String, JSONObject>()

    /**
     * Sprawdza czy historia przejazdów jest włączona w ustawieniach.
     * Domyślnie wyłączona (false) przy pierwszej instalacji aplikacji.
     * Użytkownik może włączyć historię w ustawieniach aplikacji.
     */
    fun isHistoryEnabled(): Boolean {
        return settingsPrefs.getBoolean("ride_history_enabled", false)
    }

    fun startRide(pointsSnapshotJson: String, optimizeClickedTs: Long): String {
        // Sprawdź czy historia jest włączona - jeśli nie, nie rozpoczynaj nowego przejazdu
        if (!isHistoryEnabled()) {
            Log.d(TAG, "Historia przejazdów wyłączona - pomijam startRide")
            return ""
        }
        
        synchronized(lock) {
            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isNotEmpty()) {
                closeCurrentRideInternal("new_ride_started")
            }

            val rideId = UUID.randomUUID().toString()
            val now = System.currentTimeMillis()

            val pointsSnapshot = try {
                JSONArray(pointsSnapshotJson)
            } catch (e: Exception) {
                Log.e(TAG, "Invalid pointsSnapshot JSON: ${e.message}")
                JSONArray()
            }

            val ride = JSONObject().apply {
                put("id", rideId)
                put("startTs", now)
                put("endTs", JSONObject.NULL)
                put("status", "open")
                put("route", JSONObject().apply {
                    put("optimizeClickedTs", optimizeClickedTs)
                    put("pointsSnapshot", pointsSnapshot)
                })
                put("actions", JSONObject())
                put("stops", JSONArray())
                put("stats", JSONObject().apply {
                    put("distanceM", 0.0)
                    put("durationS", 0)
                    put("lastGpsTs", 0L)
                    put("gpsGapCount", 0)
                })
                put("track", JSONObject().apply {
                    put("chunkKeys", JSONArray())
                    put("trackPointCount", 0)
                })
            }

            val indexEntry = JSONObject().apply {
                put("id", rideId)
                put("startTs", now)
                put("endTs", JSONObject.NULL)
                put("status", "open")
                put("pointsCount", pointsSnapshot.length())
                put("distanceM", 0.0)
                put("durationS", 0)
                put("trackPointCount", 0)
            }

            val index = getIndex()
            val newIndex = JSONArray()
            newIndex.put(indexEntry)
            for (i in 0 until index.length()) {
                newIndex.put(index.getJSONObject(i))
            }

            prefs.edit()
                .putString(KEY_CURRENT_RIDE, rideId)
                .putString(KEY_INDEX, newIndex.toString())
                .putString("$PREFIX_RIDE$rideId", ride.toString())
                .commit()

            activeStops.clear()
            Log.d(TAG, "Started ride $rideId with ${pointsSnapshot.length()} points")
            return rideId
        }
    }

    fun closeCurrentRide(reason: String = "manual"): Boolean {
        synchronized(lock) {
            return closeCurrentRideInternal(reason)
        }
    }

    private fun closeCurrentRideInternal(reason: String): Boolean {
        val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
        if (currentId.isEmpty()) return false

        val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
        val ride = try {
            JSONObject(rideJson)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse ride $currentId: ${e.message}")
            return false
        }

        val now = System.currentTimeMillis()
        val startTs = ride.optLong("startTs", now)
        val durationS = (now - startTs) / 1000

        ride.put("endTs", now)
        ride.put("status", "closed")

        val stats = ride.optJSONObject("stats") ?: JSONObject()
        stats.put("durationS", durationS)
        ride.put("stats", stats)

        // Zaktualizuj endTs dla aktywnych postojów (już zapisanych w startStop)
        val stops = ride.optJSONArray("stops") ?: JSONArray()
        for ((pointId, stopData) in activeStops) {
            val startTs = stopData.optLong("startTs")
            var updated = false
            for (i in 0 until stops.length()) {
                val stop = stops.getJSONObject(i)
                if (stop.optString("pointId") == pointId && 
                    stop.optLong("startTs") == startTs &&
                    stop.opt("endTs") == JSONObject.NULL) {
                    stop.put("endTs", now)
                    updated = true
                    break
                }
            }
            if (!updated) {
                stopData.put("endTs", now)
                stops.put(stopData)
            }
        }
        ride.put("stops", stops)
        activeStops.clear()

        val trackPointCount = ride.optJSONObject("track")?.optInt("trackPointCount", 0) ?: 0
        val distanceM = stats.optDouble("distanceM", 0.0)

        updateIndexEntry(currentId, now, "closed", distanceM, durationS, trackPointCount)

        prefs.edit()
            .putString("$PREFIX_RIDE$currentId", ride.toString())
            .putString(KEY_CURRENT_RIDE, "")
            .commit()

        Log.d(TAG, "Closed ride $currentId (reason: $reason, duration: ${durationS}s)")
        return true
    }

    fun getCurrentRideId(): String {
        return prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
    }

    fun recordPointAction(pointId: String, action: String, timestamp: Long): Boolean {
        // Sprawdź czy historia jest włączona - jeśli nie, nie zapisuj akcji
        if (!isHistoryEnabled()) {
            return false
        }
        
        synchronized(lock) {
            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return false

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            val actions = ride.optJSONObject("actions") ?: JSONObject()
            val pointActions = actions.optJSONObject(pointId) ?: JSONObject()

            // POPRAWKA: Przy zmianie statusu usuń poprzedni timestamp, aby uniknąć konfliktów
            // Jeśli punkt był wcześniej "Odwiedzony" (deliveredTs), a teraz jest "Pominięty" (skippedTs),
            // to musimy usunąć deliveredTs, aby punkt był poprawnie wyświetlany jako "Pominięty"
            when (action.lowercase()) {
                "delivered", "odwiedzony", "dostarczone" -> {
                    // Ustaw deliveredTs i usuń skippedTs jeśli istnieje
                    pointActions.put("deliveredTs", timestamp)
                    pointActions.remove("skippedTs")
                }
                "skipped", "pominięty", "pomiń" -> {
                    // Ustaw skippedTs i usuń deliveredTs jeśli istnieje
                    pointActions.put("skippedTs", timestamp)
                    pointActions.remove("deliveredTs")
                }
            }

            actions.put(pointId, pointActions)
            ride.put("actions", actions)

            prefs.edit()
                .putString("$PREFIX_RIDE$currentId", ride.toString())
                .apply()

            Log.d(TAG, "Recorded $action for point $pointId at $timestamp")
            return true
        }
    }

    /**
     * Usuwa wszystkie akcje dla danego punktu z historii przejazdów.
     * Wywoływane gdy status adresu jest resetowany do "BRAK".
     */
    fun removePointAction(pointId: String): Boolean {
        synchronized(lock) {
            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return false

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            val actions = ride.optJSONObject("actions") ?: JSONObject()
            
            // Usuń wszystkie akcje dla tego punktu
            if (actions.has(pointId)) {
                actions.remove(pointId)
                ride.put("actions", actions)

                prefs.edit()
                    .putString("$PREFIX_RIDE$currentId", ride.toString())
                    .apply()

                Log.d(TAG, "Removed all actions for point $pointId")
            }
            
            return true
        }
    }

    fun addTrackPoint(lat: Double, lng: Double, accuracy: Float, timestamp: Long, segment: Int): Boolean {
        // Sprawdź czy historia jest włączona - jeśli nie, nie zapisuj punktów GPS
        if (!isHistoryEnabled()) {
            return false
        }
        
        synchronized(lock) {
            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return false

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            val track = ride.optJSONObject("track") ?: JSONObject()
            val chunkKeys = track.optJSONArray("chunkKeys") ?: JSONArray()
            var trackPointCount = track.optInt("trackPointCount", 0)

            val point = JSONObject().apply {
                put("ts", timestamp)
                put("lat", lat)
                put("lng", lng)
                put("accM", accuracy.toDouble())
                put("seg", segment)
            }

            val currentChunkKey: String
            val currentChunk: JSONArray

            if (chunkKeys.length() == 0) {
                currentChunkKey = "${PREFIX_TRACK}${currentId}_000"
                currentChunk = JSONArray()
                chunkKeys.put(currentChunkKey)
            } else {
                val lastKey = chunkKeys.getString(chunkKeys.length() - 1)
                val lastChunkJson = prefs.getString(lastKey, "[]") ?: "[]"
                val lastChunk = try {
                    JSONArray(lastChunkJson)
                } catch (e: Exception) {
                    JSONArray()
                }

                if (lastChunk.length() >= MAX_CHUNK_SIZE) {
                    val newIndex = chunkKeys.length()
                    currentChunkKey = "${PREFIX_TRACK}${currentId}_${String.format("%03d", newIndex)}"
                    currentChunk = JSONArray()
                    chunkKeys.put(currentChunkKey)
                } else {
                    currentChunkKey = lastKey
                    currentChunk = lastChunk
                }
            }

            currentChunk.put(point)
            trackPointCount++

            track.put("chunkKeys", chunkKeys)
            track.put("trackPointCount", trackPointCount)
            ride.put("track", track)

            val stats = ride.optJSONObject("stats") ?: JSONObject()
            stats.put("lastGpsTs", timestamp)
            ride.put("stats", stats)

            prefs.edit()
                .putString(currentChunkKey, currentChunk.toString())
                .putString("$PREFIX_RIDE$currentId", ride.toString())
                .apply()

            return true
        }
    }

    fun startStop(pointId: String, lat: Double, lng: Double, timestamp: Long): Boolean {
        synchronized(lock) {
            if (activeStops.containsKey(pointId)) return false

            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return false

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            val stopData = JSONObject().apply {
                put("pointId", pointId)
                put("startTs", timestamp)
                put("endTs", JSONObject.NULL)
                put("centerLat", lat)
                put("centerLng", lng)
            }
            activeStops[pointId] = stopData

            // Zapisz postój od razu do pliku (widoczny na bieżąco w historii)
            val stops = ride.optJSONArray("stops") ?: JSONArray()
            stops.put(stopData)
            ride.put("stops", stops)

            prefs.edit()
                .putString("$PREFIX_RIDE$currentId", ride.toString())
                .apply()

            Log.d(TAG, "Started stop at point $pointId (saved to file)")
            return true
        }
    }

    fun endStop(pointId: String, timestamp: Long): Boolean {
        synchronized(lock) {
            val stopData = activeStops.remove(pointId) ?: return false
            stopData.put("endTs", timestamp)

            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return false

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            // Znajdź i zaktualizuj istniejący postój (dodany w startStop)
            val stops = ride.optJSONArray("stops") ?: JSONArray()
            var updated = false
            for (i in 0 until stops.length()) {
                val stop = stops.getJSONObject(i)
                if (stop.optString("pointId") == pointId && 
                    stop.optLong("startTs") == stopData.optLong("startTs") &&
                    stop.opt("endTs") == JSONObject.NULL) {
                    // Aktualizuj endTs dla istniejącego postoju
                    stop.put("endTs", timestamp)
                    updated = true
                    break
                }
            }

            // Jeśli nie znaleziono (edge case), dodaj jako nowy
            if (!updated) {
                stops.put(stopData)
            }
            
            ride.put("stops", stops)

            prefs.edit()
                .putString("$PREFIX_RIDE$currentId", ride.toString())
                .apply()

            Log.d(TAG, "Ended stop at point $pointId (duration: ${(timestamp - stopData.optLong("startTs", timestamp)) / 1000}s)")
            return true
        }
    }

    fun updateDistance(distanceM: Double): Boolean {
        synchronized(lock) {
            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return false

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            val stats = ride.optJSONObject("stats") ?: JSONObject()
            stats.put("distanceM", distanceM)
            val startTs = ride.optLong("startTs", System.currentTimeMillis())
            stats.put("durationS", (System.currentTimeMillis() - startTs) / 1000)
            ride.put("stats", stats)

            prefs.edit()
                .putString("$PREFIX_RIDE$currentId", ride.toString())
                .apply()

            return true
        }
    }

    fun updatePointsSnapshot(newPointsSnapshotJson: String, silentOptimizeTs: Long): Boolean {
        synchronized(lock) {
            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return false

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            val newPoints = try {
                JSONArray(newPointsSnapshotJson)
            } catch (e: Exception) {
                Log.e(TAG, "Invalid new pointsSnapshot JSON: ${e.message}")
                return false
            }

            val route = ride.optJSONObject("route") ?: JSONObject()
            route.put("pointsSnapshot", newPoints)
            ride.put("route", route)

            val reoptimizations = ride.optJSONArray("reoptimizations") ?: JSONArray()
            reoptimizations.put(JSONObject().apply {
                put("ts", silentOptimizeTs)
                put("pointsCount", newPoints.length())
            })
            ride.put("reoptimizations", reoptimizations)

            val index = getIndex()
            for (i in 0 until index.length()) {
                val entry = index.getJSONObject(i)
                if (entry.optString("id") == currentId) {
                    entry.put("pointsCount", newPoints.length())
                }
            }

            prefs.edit()
                .putString("$PREFIX_RIDE$currentId", ride.toString())
                .putString(KEY_INDEX, index.toString())
                .apply()

            Log.d(TAG, "Updated pointsSnapshot for ride $currentId: ${newPoints.length()} points (silent reoptimization)")
            return true
        }
    }

    fun getCurrentRideDistance(): Double {
        val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
        if (currentId.isEmpty()) return 0.0
        val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return 0.0
        return try {
            val ride = JSONObject(rideJson)
            ride.optJSONObject("stats")?.optDouble("distanceM", 0.0) ?: 0.0
        } catch (e: Exception) {
            0.0
        }
    }

    fun getRidesLast30Days(): String {
        val index = getIndex()
        val cutoff = System.currentTimeMillis() - MAX_RIDE_AGE_DAYS * 24 * 60 * 60 * 1000L
        val result = JSONArray()

        for (i in 0 until index.length()) {
            val entry = index.getJSONObject(i)
            val startTs = entry.optLong("startTs", 0)
            if (startTs >= cutoff) {
                if (entry.optString("status") == "open") {
                    val rideId = entry.optString("id")
                    val rideJson = prefs.getString("$PREFIX_RIDE$rideId", null)
                    if (rideJson != null) {
                        try {
                            val ride = JSONObject(rideJson)
                            val stats = ride.optJSONObject("stats")
                            if (stats != null) {
                                entry.put("distanceM", stats.optDouble("distanceM", 0.0))
                                val startTsRide = ride.optLong("startTs", System.currentTimeMillis())
                                entry.put("durationS", (System.currentTimeMillis() - startTsRide) / 1000)
                            }
                            val track = ride.optJSONObject("track")
                            if (track != null) {
                                entry.put("trackPointCount", track.optInt("trackPointCount", 0))
                            }
                        } catch (_: Exception) {}
                    }
                }
                result.put(entry)
            }
        }

        return result.toString()
    }

    fun getRide(rideId: String): String {
        val rideJson = prefs.getString("$PREFIX_RIDE$rideId", null)
        return rideJson ?: "{}"
    }

    fun getTrackChunk(chunkKey: String): String {
        return prefs.getString(chunkKey, "[]") ?: "[]"
    }

    fun deleteRide(rideId: String): Boolean {
        synchronized(lock) {
            val rideJson = prefs.getString("$PREFIX_RIDE$rideId", null) ?: return false
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return false
            }

            val editor = prefs.edit()

            val track = ride.optJSONObject("track")
            if (track != null) {
                val chunkKeys = track.optJSONArray("chunkKeys")
                if (chunkKeys != null) {
                    for (i in 0 until chunkKeys.length()) {
                        editor.remove(chunkKeys.getString(i))
                    }
                }
            }

            editor.remove("$PREFIX_RIDE$rideId")

            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId == rideId) {
                editor.putString(KEY_CURRENT_RIDE, "")
            }

            val index = getIndex()
            val newIndex = JSONArray()
            for (i in 0 until index.length()) {
                val entry = index.getJSONObject(i)
                if (entry.optString("id") != rideId) {
                    newIndex.put(entry)
                }
            }
            editor.putString(KEY_INDEX, newIndex.toString())

            editor.commit()
            Log.d(TAG, "Deleted ride $rideId")
            return true
        }
    }

    fun cleanupOldRides(): Int {
        synchronized(lock) {
            val lastCleanup = prefs.getLong(KEY_LAST_CLEANUP, 0)
            val now = System.currentTimeMillis()
            if (now - lastCleanup < CLEANUP_INTERVAL_MS) return 0

            val cutoff = now - MAX_RIDE_AGE_DAYS * 24 * 60 * 60 * 1000L
            val index = getIndex()
            val toDelete = mutableListOf<String>()

            for (i in 0 until index.length()) {
                val entry = index.getJSONObject(i)
                val startTs = entry.optLong("startTs", 0)
                if (startTs < cutoff) {
                    toDelete.add(entry.optString("id"))
                }
            }

            for (rideId in toDelete) {
                deleteRideInternal(rideId)
            }

            prefs.edit().putLong(KEY_LAST_CLEANUP, now).apply()
            if (toDelete.isNotEmpty()) {
                Log.d(TAG, "Cleaned up ${toDelete.size} old rides")
            }
            return toDelete.size
        }
    }

    private fun deleteRideInternal(rideId: String) {
        val rideJson = prefs.getString("$PREFIX_RIDE$rideId", null)
        val editor = prefs.edit()

        if (rideJson != null) {
            try {
                val ride = JSONObject(rideJson)
                val track = ride.optJSONObject("track")
                if (track != null) {
                    val chunkKeys = track.optJSONArray("chunkKeys")
                    if (chunkKeys != null) {
                        for (i in 0 until chunkKeys.length()) {
                            editor.remove(chunkKeys.getString(i))
                        }
                    }
                }
            } catch (_: Exception) {}
        }

        editor.remove("$PREFIX_RIDE$rideId")

        val index = getIndex()
        val newIndex = JSONArray()
        for (i in 0 until index.length()) {
            val entry = index.getJSONObject(i)
            if (entry.optString("id") != rideId) {
                newIndex.put(entry)
            }
        }
        editor.putString(KEY_INDEX, newIndex.toString())
        editor.commit()
    }

    private fun updateIndexEntry(rideId: String, endTs: Long?, status: String, distanceM: Double, durationS: Long, trackPointCount: Int) {
        val index = getIndex()
        val newIndex = JSONArray()

        for (i in 0 until index.length()) {
            val entry = index.getJSONObject(i)
            if (entry.optString("id") == rideId) {
                entry.put("endTs", endTs ?: JSONObject.NULL)
                entry.put("status", status)
                entry.put("distanceM", distanceM)
                entry.put("durationS", durationS)
                entry.put("trackPointCount", trackPointCount)
            }
            newIndex.put(entry)
        }

        prefs.edit().putString(KEY_INDEX, newIndex.toString()).commit()
    }

    private fun getIndex(): JSONArray {
        val indexJson = prefs.getString(KEY_INDEX, "[]") ?: "[]"
        return try {
            JSONArray(indexJson)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse ride index: ${e.message}")
            JSONArray()
        }
    }

    fun checkStopProximity(lat: Double, lng: Double, timestamp: Long) {
        synchronized(lock) {
            val currentId = prefs.getString(KEY_CURRENT_RIDE, "") ?: ""
            if (currentId.isEmpty()) return

            val rideJson = prefs.getString("$PREFIX_RIDE$currentId", null) ?: return
            val ride = try {
                JSONObject(rideJson)
            } catch (e: Exception) {
                return
            }

            val pointsSnapshot = ride.optJSONObject("route")?.optJSONArray("pointsSnapshot") ?: return

            for (i in 0 until pointsSnapshot.length()) {
                val point = pointsSnapshot.getJSONObject(i)
                val pointId = point.optString("pointId", "")
                val pLat = point.optDouble("lat", 0.0)
                val pLng = point.optDouble("lng", 0.0)

                if (pointId.isEmpty()) continue

                val dist = haversine(lat, lng, pLat, pLng)

                if (dist <= 50.0) {
                    if (!activeStops.containsKey(pointId)) {
                        startStop(pointId, pLat, pLng, timestamp)
                    }
                } else if (dist > 70.0) {
                    if (activeStops.containsKey(pointId)) {
                        endStop(pointId, timestamp)
                    }
                }
            }
        }
    }

    private fun haversine(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val R = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2)
        val c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
    }
}
