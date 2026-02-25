package pl.optidrog.app.ui.theme

import android.app.Activity
import android.os.Build
import android.util.Log
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

// Ciemny schemat kolorów z pomarańczowymi akcentami
private val DarkColorScheme = darkColorScheme(
    primary = AccentOrange,
    onPrimary = TextPrimary,
    primaryContainer = AccentOrangeDark,
    onPrimaryContainer = TextPrimary,
    
    secondary = DarkSecondary,
    onSecondary = TextPrimary,
    secondaryContainer = DarkTertiary,
    onSecondaryContainer = TextSecondary,
    
    tertiary = AccentOrangeLight,
    onTertiary = TextPrimary,
    tertiaryContainer = AccentOrangeDark,
    onTertiaryContainer = TextPrimary,
    
    background = DarkPrimary,
    onBackground = TextPrimary,
    
    surface = DarkSecondary,
    onSurface = TextPrimary,
    surfaceVariant = DarkTertiary,
    onSurfaceVariant = TextSecondary,
    
    outline = BorderColor,
    outlineVariant = DarkTertiary,
    
    error = ErrorColor,
    onError = TextPrimary,
    errorContainer = Color(0xFF5D1A1A),
    onErrorContainer = Color(0xFFFFB4AB)
)

// Jasny schemat kolorów (opcjonalny, ale zachowany dla kompatybilności)
private val LightColorScheme = lightColorScheme(
    primary = AccentOrangeDark,
    onPrimary = TextPrimary,
    primaryContainer = AccentOrangeLight,
    onPrimaryContainer = DarkPrimary,
    
    secondary = DarkTertiary,
    onSecondary = TextPrimary,
    secondaryContainer = Color(0xFFE8E8E8),
    onSecondaryContainer = DarkPrimary,
    
    tertiary = AccentOrange,
    onTertiary = TextPrimary,
    tertiaryContainer = AccentOrangeLight,
    onTertiaryContainer = DarkPrimary,
    
    background = Color(0xFFFFFBFE),
    onBackground = DarkPrimary,
    
    surface = Color(0xFFFFFBFE),
    onSurface = DarkPrimary,
    surfaceVariant = Color(0xFFF4F4F4),
    onSurfaceVariant = DarkTertiary,
    
    outline = BorderColor,
    outlineVariant = Color(0xFFCACACA),
    
    error = ErrorColor,
    onError = TextPrimary,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002)
)

@Composable
fun OptiDrogTheme(
    darkTheme: Boolean = true, // Domyślnie ciemny motyw
    // Dynamic color wyłączony, aby zachować spójność z naszym designem
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    
    // OBSŁUGA EDGE-TO-EDGE W COMPOSE DLA ANDROID 15+
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            
            // Włącz edge-to-edge dla wszystkich wersji
            try {
                // W Compose używamy WindowCompat zamiast enableEdgeToEdge()
                WindowCompat.setDecorFitsSystemWindows(window, false)
                Log.d("ComposeEdgeToEdge", "Edge-to-edge enabled in Compose theme")
            } catch (e: Exception) {
                Log.e("ComposeEdgeToEdge", "Failed to enable edge-to-edge in Compose theme: ${e.message}")
            }
            
            // Ustaw przezroczyste paski systemowe dla edge-to-edge
            WindowInsetsControllerCompat(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
            
            Log.d("ComposeEdgeToEdge", "Compose theme configured for edge-to-edge (darkTheme=$darkTheme)")
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}