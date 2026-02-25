package pl.optidrog.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

// ML Kit Imports
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class CameraActivity : AppCompatActivity() {

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var previewView: PreviewView
    private var imageCapture: ImageCapture? = null
    private var camera: Camera? = null
    private var cameraProvider: ProcessCameraProvider? = null

    // Tryb przechwytywania: "ai_analysis" (domyślnie) lub "address_photos"
    private var captureMode: String = "ai_analysis"

    companion object {
        private const val TAG = "CameraActivity"
        private const val TAG_EDGE = "CameraEdgeToEdge"
        private const val REQUEST_CODE_PERMISSIONS = 10
        private val REQUIRED_PERMISSIONS = arrayOf(Manifest.permission.CAMERA)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Odczytaj tryb przechwytywania z Intentu
        captureMode = intent.getStringExtra("captureMode") ?: "ai_analysis"
        Log.d(TAG, "Uruchomiono CameraActivity w trybie: $captureMode")

        // IMPLEMENTACJA EDGE-TO-EDGE - ZGODNIE Z WYMAGANIAMI ANDROID 15 (API 35+)
        try {
            enableEdgeToEdge()
            Log.d(TAG_EDGE, "Edge-to-edge enabled")
        } catch (e: Exception) {
            Log.e(TAG_EDGE, "Failed to enable edge-to-edge: ${e.message}")
            @Suppress("DEPRECATION")
            WindowCompat.setDecorFitsSystemWindows(window, false)
        }

        // Konfiguracja pasków systemowych
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        setContentView(R.layout.activity_camera)

        previewView = findViewById(R.id.camera_preview)
        cameraExecutor = Executors.newSingleThreadExecutor()

        // OBSŁUGA WINDOW INSETS DLA CAŁEGO ROOT LAYOUTU (ODCIĘCIE OD DOLNEGO PASKA)
        setupWindowInsetsListener()

        // Sprawdź uprawnienia
        if (allPermissionsGranted()) {
            startCamera()
        } else {
            ActivityCompat.requestPermissions(
                this, REQUIRED_PERMISSIONS, REQUEST_CODE_PERMISSIONS
            )
        }

        // Obsługa przycisku robienia zdjęcia
        findViewById<View>(R.id.camera_capture_button).setOnClickListener {
            takePhoto()
        }

        // Obsługa przycisku zamykania
        findViewById<View>(R.id.camera_close_button).setOnClickListener {
            finish()
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder()
                .build()
                .also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

            imageCapture = ImageCapture.Builder()
                .build()

            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider?.unbindAll()
                camera = cameraProvider?.bindToLifecycle(
                    this, cameraSelector, preview, imageCapture
                )
            } catch (exc: Exception) {
                Log.e(TAG, "Wystąpił błąd podczas inicjalizacji aparatu", exc)
            }

        }, ContextCompat.getMainExecutor(this))
    }

    private fun takePhoto() {
        val imageCapture = imageCapture ?: return

        Log.d(TAG, "Robienie zdjęcia rozpoczęte")

        imageCapture.takePicture(
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val bitmap = imageProxyToBitmap(image)
                    image.close()

                    val base64Image = bitmapToBase64(bitmap)

                    Log.d(TAG, "Zdjęcie wykonane i przekonwertowane do base64")

                    runOnUiThread {
                        try {
                            val resultIntent = intent

                            if (captureMode == "address_photos") {
                                resultIntent.putExtra("camera_photo_base64", base64Image)
                                Log.d(TAG, "Dodano zdjęcie adresu")
                                setResult(RESULT_OK, resultIntent)
                                finish()
                            } else {
                                // TRYB ANALIZY OCR (ZAMIAST AI)
                                Log.d(TAG, "Rozpoczynam analizę OCR lokalnie...")
                                runOcr(bitmap, base64Image)
                            }
                        } catch (e: Exception) {
                            Log.e(
                                TAG,
                                "Błąd podczas przetwarzania zdjęcia: ${e.message}",
                                e
                            )
                        }
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    Log.e(TAG, "Błąd robienia zdjęcia: ${exception.message}", exception)
                    runOnUiThread {
                        Log.e(TAG, "Błąd robienia zdjęcia (callback onError)")
                    }
                }
            }
        )
    }

    private fun imageProxyToBitmap(image: ImageProxy): android.graphics.Bitmap {
        val planeProxy = image.planes[0]
        val buffer = planeProxy.buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)
        return android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    private fun scaleBitmapDown(bitmap: android.graphics.Bitmap): android.graphics.Bitmap {
        val (maxWidth, maxHeight) = if (captureMode == "address_photos") {
            600 to 450
        } else {
            800 to 600
        }
        val currentWidth = bitmap.width
        val currentHeight = bitmap.height

        val scaleRatio = minOf(
            maxWidth.toFloat() / currentWidth,
            maxHeight.toFloat() / currentHeight,
            1.0f
        )

        if (scaleRatio >= 1.0f) {
            return bitmap
        }

        val newWidth = (currentWidth * scaleRatio).toInt()
        val newHeight = (currentHeight * scaleRatio).toInt()

        Log.d(
            TAG,
            "Skalowanie bitmapy (tryb=$captureMode) z ${currentWidth}x${currentHeight} do ${newWidth}x${newHeight}"
        )

        return android.graphics.Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    private fun bitmapToBase64(bitmap: android.graphics.Bitmap): String {
        val scaledBitmap = scaleBitmapDown(bitmap)

        val byteArrayOutputStream = ByteArrayOutputStream()
        val quality = if (captureMode == "address_photos") 50 else 60
        scaledBitmap.compress(
            android.graphics.Bitmap.CompressFormat.JPEG,
            quality,
            byteArrayOutputStream
        )
        val byteArray = byteArrayOutputStream.toByteArray()

        Log.d(
            TAG,
            "Rozmiar zdjęcia po kompresji (tryb=$captureMode, quality=$quality): ${byteArray.size} bytes"
        )

        return "data:image/jpeg;base64," + Base64.encodeToString(byteArray, Base64.NO_WRAP)
    }

    private fun allPermissionsGranted() = REQUIRED_PERMISSIONS.all {
        ContextCompat.checkSelfPermission(baseContext, it) == PackageManager.PERMISSION_GRANTED
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_CODE_PERMISSIONS) {
            if (allPermissionsGranted()) {
                startCamera()
            } else {
                Log.w(
                    TAG,
                    "Uprawnienia aparatu nie zostały przyznane przez użytkownika - zamykam aktywność"
                )
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }

    // ===== METODY POMOCNICZE DO OBSŁUGI WINDOW INSETS =====

    /**
     * Listener na root layout (`camera_root`), który dodaje dolny padding równy
     * wysokości paska systemowego (navigation bar), żeby UI nie wchodził pod pasek.
     */
    private fun setupWindowInsetsListener() {
        val root = findViewById<View>(R.id.camera_root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val displayCutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())

            val topInset = maxOf(systemBars.top, displayCutout.top)
            val bottomInset = maxOf(systemBars.bottom, displayCutout.bottom)

            v.setPadding(
                v.paddingLeft,
                topInset,
                v.paddingRight,
                bottomInset
            )
            
            Log.d(TAG_EDGE, "Insets applied: top=$topInset, bottom=$bottomInset")
            insets
        }
    }

    /**
     * Uruchamia rozpoznawanie tekstu (OCR) na przekazanej bitmapie
     */
    private fun runOcr(bitmap: android.graphics.Bitmap, base64Image: String) {
        val image = InputImage.fromBitmap(bitmap, 0)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
            .addOnSuccessListener { visionText ->
                val resultLines = ArrayList<String>()
                for (block in visionText.textBlocks) {
                    for (line in block.lines) {
                        resultLines.add(line.text)
                    }
                }

                Log.d(TAG, "OCR zakończony sukcesem. Znaleziono linii: ${resultLines.size}")

                val resultIntent = intent
                resultIntent.putStringArrayListExtra("ocr_results", resultLines)
                // Opcjonalnie zachowujemy base64 jeśli UI chce wyświetlić miniaturowy podgląd
                resultIntent.putExtra("camera_image_base64", base64Image)
                
                setResult(RESULT_OK, resultIntent)
                finish()
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Błąd podczas OCR: ${e.message}", e)
                val resultIntent = intent
                resultIntent.putExtra("ocr_error", e.message)
                setResult(RESULT_CANCELED, resultIntent)
                finish()
            }
    }
}