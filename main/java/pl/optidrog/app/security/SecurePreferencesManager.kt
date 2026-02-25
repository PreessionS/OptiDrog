package pl.optidrog.app.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.IvParameterSpec

/**
 * Bezpieczny menedżer preferencji bez użycia przestarzałych API.
 * Implementuje własne szyfrowanie AES/GCM z kluczami w AndroidKeyStore.
 * W pełni kompatybilny z Android 8+ (API 26+) i nie generuje warningów o deprecacji.
 */
class SecurePreferencesManager(context: Context, private val prefsName: String) {
    
    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALGORITHM = KeyProperties.KEY_ALGORITHM_AES
        private const val BLOCK_MODE = KeyProperties.BLOCK_MODE_GCM
        private const val PADDING = KeyProperties.ENCRYPTION_PADDING_NONE
        private const val KEY_SIZE = 256
        private const val GCM_IV_LENGTH = 12 // 12 bytes dla GCM
        private const val GCM_TAG_LENGTH = 128 // 128 bits tagu autentykacji
    }
    
    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
    }
    
    // Standardowe SharedPreferences do przechowywania zaszyfrowanych danych
    private val sharedPreferences: SharedPreferences = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
    
    // Inicjalizacja lub pobranie klucza szyfrowania
    private val encryptionKey: SecretKey by lazy {
        getOrCreateSecretKey("${prefsName}_encryption_key")
    }
    
    /**
     * Generuje lub pobiera klucz z AndroidKeyStore
     */
    private fun getOrCreateSecretKey(keyAlias: String): SecretKey {
        // Sprawdzamy czy klucz już istnieje
        keyStore.getKey(keyAlias, null)?.let { existingKey ->
            return existingKey as SecretKey
        }
        
        // Generujemy nowy klucz
        val keyGenerator = KeyGenerator.getInstance(KEY_ALGORITHM, ANDROID_KEYSTORE)
        val keyGenParameterSpec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        ).run {
            setBlockModes(BLOCK_MODE)
            setEncryptionPaddings(PADDING)
            setKeySize(KEY_SIZE)
            setUserAuthenticationRequired(false)
            build()
        }
        
        keyGenerator.init(keyGenParameterSpec)
        return keyGenerator.generateKey()
    }
    
    /**
     * Szyfruje dane za pomocą AES/GCM
     */
    private fun encrypt(data: String, keyAlias: String = "${prefsName}_encryption_key"): String {
        try {
            val cipher = Cipher.getInstance("$KEY_ALGORITHM/$BLOCK_MODE/$PADDING")
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey)
            
            // Generujemy IV (Initialization Vector)
            val iv = cipher.iv
            val encryptedData = cipher.doFinal(data.toByteArray(Charsets.UTF_8))
            
            // Łączymy IV + zaszyfrowane dane i kodujemy w Base64
            val combined = iv + encryptedData
            return Base64.encodeToString(combined, Base64.DEFAULT)
        } catch (e: Exception) {
            throw RuntimeException("Błąd szyfrowania: ${e.message}", e)
        }
    }
    
    /**
     * Deszyfruje dane za pomocą AES/GCM
     */
    private fun decrypt(encryptedData: String): String {
        try {
            val combined = Base64.decode(encryptedData, Base64.DEFAULT)
            
            // Wyodrębniamy IV (pierwsze 12 bajtów)
            val iv = combined.sliceArray(0 until GCM_IV_LENGTH)
            val data = combined.sliceArray(GCM_IV_LENGTH until combined.size)
            
            val cipher = Cipher.getInstance("$KEY_ALGORITHM/$BLOCK_MODE/$PADDING")
            val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey, gcmSpec)
            
            val decryptedBytes = cipher.doFinal(data)
            return String(decryptedBytes, Charsets.UTF_8)
        } catch (e: Exception) {
            throw RuntimeException("Błąd deszyfrowania: ${e.message}", e)
        }
    }
    
    // === Metody do zapisywania danych ===
    
    /**
     * Zapisuje wartość String w bezpiecznych preferencjach
     * @param key Klucz pod którym zostanie zapisana wartość
     * @param value Wartość do zapisania (może być null)
     */
    fun putString(key: String, value: String?) {
        val editor = sharedPreferences.edit()
        if (value == null) {
            editor.remove(key)
        } else {
            val encryptedValue = encrypt(value)
            editor.putString(key, encryptedValue)
        }
        editor.apply()
    }
    
    /**
     * Zapisuje wartość Int w bezpiecznych preferencjach
     * @param key Klucz pod którym zostanie zapisana wartość
     * @param value Wartość do zapisania
     */
    fun putInt(key: String, value: Int) {
        putString(key, value.toString())
    }
    
    /**
     * Zapisuje wartość Boolean w bezpiecznych preferencjach
     * @param key Klucz pod którym zostanie zapisana wartość
     * @param value Wartość do zapisania
     */
    fun putBoolean(key: String, value: Boolean) {
        putString(key, value.toString())
    }
    
    /**
     * Zapisuje wartość Long w bezpiecznych preferencjach
     * @param key Klucz pod którym zostanie zapisana wartość
     * @param value Wartość do zapisania
     */
    fun putLong(key: String, value: Long) {
        putString(key, value.toString())
    }
    
    /**
     * Zapisuje wartość Float w bezpiecznych preferencjach
     * @param key Klucz pod którym zostanie zapisana wartość
     * @param value Wartość do zapisania
     */
    fun putFloat(key: String, value: Float) {
        putString(key, value.toString())
    }
    
    /**
     * Zapisuje zestaw Stringów w bezpiecznych preferencjach
     * @param key Klucz pod którym zostanie zapisana wartość
     * @param value Zestaw Stringów do zapisania (może być null)
     */
    fun putStringSet(key: String, value: Set<String>?) {
        val editor = sharedPreferences.edit()
        if (value == null) {
            editor.remove(key)
        } else {
            // Szyfrujemy każdy element zestawu osobno
            val encryptedSet = value.map { encrypt(it) }.toSet()
            editor.putStringSet(key, encryptedSet)
        }
        editor.apply()
    }
    
    // === Metody do odczytywania danych ===
    
    /**
     * Odczytuje wartość String z bezpiecznych preferencji
     * @param key Klucz wartości do odczytania
     * @param defaultValue Wartość domyślna, jeśli klucz nie istnieje
     * @return Odczytana wartość lub wartość domyślna
     */
    fun getString(key: String, defaultValue: String? = null): String? {
        val encryptedValue = sharedPreferences.getString(key, null)
        return if (encryptedValue != null) {
            try {
                decrypt(encryptedValue)
            } catch (e: Exception) {
                defaultValue // W przypadku błędu deszyfrowania zwróć wartość domyślną
            }
        } else {
            defaultValue
        }
    }
    
    /**
     * Odczytuje wartość Int z bezpiecznych preferencji
     * @param key Klucz wartości do odczytania
     * @param defaultValue Wartość domyślna, jeśli klucz nie istnieje
     * @return Odczytana wartość lub wartość domyślna
     */
    fun getInt(key: String, defaultValue: Int = 0): Int {
        val stringValue = getString(key, defaultValue.toString())
        return try {
            stringValue?.toInt() ?: defaultValue
        } catch (e: NumberFormatException) {
            defaultValue
        }
    }
    
    /**
     * Odczytuje wartość Boolean z bezpiecznych preferencji
     * @param key Klucz wartości do odczytania
     * @param defaultValue Wartość domyślna, jeśli klucz nie istnieje
     * @return Odczytana wartość lub wartość domyślna
     */
    fun getBoolean(key: String, defaultValue: Boolean = false): Boolean {
        val stringValue = getString(key, defaultValue.toString())
        return try {
            stringValue?.toBoolean() ?: defaultValue
        } catch (e: Exception) {
            defaultValue
        }
    }
    
    /**
     * Odczytuje wartość Long z bezpiecznych preferencji
     * @param key Klucz wartości do odczytania
     * @param defaultValue Wartość domyślna, jeśli klucz nie istnieje
     * @return Odczytana wartość lub wartość domyślna
     */
    fun getLong(key: String, defaultValue: Long = 0L): Long {
        val stringValue = getString(key, defaultValue.toString())
        return try {
            stringValue?.toLong() ?: defaultValue
        } catch (e: NumberFormatException) {
            defaultValue
        }
    }
    
    /**
     * Odczytuje wartość Float z bezpiecznych preferencji
     * @param key Klucz wartości do odczytania
     * @param defaultValue Wartość domyślna, jeśli klucz nie istnieje
     * @return Odczytana wartość lub wartość domyślna
     */
    fun getFloat(key: String, defaultValue: Float = 0f): Float {
        val stringValue = getString(key, defaultValue.toString())
        return try {
            stringValue?.toFloat() ?: defaultValue
        } catch (e: NumberFormatException) {
            defaultValue
        }
    }
    
    /**
     * Odczytuje zestaw Stringów z bezpiecznych preferencji
     * @param key Klucz wartości do odczytania
     * @param defaultValue Wartość domyślna, jeśli klucz nie istnieje
     * @return Odczytany zestaw lub wartość domyślna
     */
    fun getStringSet(key: String, defaultValue: Set<String>? = null): Set<String>? {
        val encryptedSet = sharedPreferences.getStringSet(key, null)
        return if (encryptedSet != null) {
            try {
                // Deszyfrujemy każdy element zestawu
                encryptedSet.map { decrypt(it) }.toSet()
            } catch (e: Exception) {
                defaultValue // W przypadku błędu deszyfrowania zwróć wartość domyślną
            }
        } else {
            defaultValue
        }
    }
    
    // === Metody zarządzające preferencjami ===
    
    /**
     * Sprawdza czy istnieje podany klucz w preferencjach
     * @param key Klucz do sprawdzenia
     * @return True jeśli klucz istnieje, false w przeciwnym razie
     */
    fun contains(key: String): Boolean {
        return sharedPreferences.contains(key)
    }
    
    /**
     * Usuwa podany klucz z preferencji
     * @param key Klucz do usunięcia
     */
    fun remove(key: String) {
        sharedPreferences.edit().remove(key).apply()
    }
    
    /**
     * Usuwa wszystkie dane z preferencji
     */
    fun clear() {
        sharedPreferences.edit().clear().apply()
    }
    
    /**
     * Zwraca wszystkie klucze z preferencji (wartości będą zaszyfrowane)
     * @return Mapa wszystkich klucz-wartość (wartości zaszyfrowane)
     */
    fun getAll(): Map<String, *> {
        return sharedPreferences.all
    }
    
    /**
     * Zwraca bezpośredni dostęp do SharedPreferences dla zaawansowanych operacji
     * UWAGA: Wartości będą zaszyfrowane!
     * @return Obiekt SharedPreferences
     */
    fun getPreferences(): SharedPreferences {
        return sharedPreferences
    }
    
    /**
     * Zwraca edytor SharedPreferences dla zaawansowanych operacji
     * UWAGA: Należy ręcznie szyfrować wartości!
     * @return Obiekt Editor
     */
    fun getEditorInstance(): SharedPreferences.Editor {
        return sharedPreferences.edit()
    }
}