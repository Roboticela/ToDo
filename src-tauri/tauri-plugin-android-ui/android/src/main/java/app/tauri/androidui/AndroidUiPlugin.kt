// SPDX-License-Identifier: MIT

package app.tauri.androidui

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class MosaicArg {
  lateinit var mosaic: String
}

@InvokeArg
class LetterboxArg {
  @JvmField
  var contouredLetterboxArgb: Int = 0xFF0F0F0F.toInt()
}

@TauriPlugin
class AndroidUiPlugin(private val activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null
  private var current: String = "standard"
  private var letterboxArgb: Int = 0xFF0F0F0F.toInt()

  override fun load(webView: WebView) {
    this.webView = webView
    // Init may call setMosaic before the WebView exists; re-apply once it is ready.
    when (current) {
      "cinematic" -> applyCinematic()
      "contoured" -> applyContoured()
      else -> applyStandard()
    }
  }

  @Command
  fun setContouredLetterboxArgb(invoke: Invoke) {
    val a = invoke.parseArgs(LetterboxArg::class.java)
    letterboxArgb = a.contouredLetterboxArgb
    invoke.resolve()
  }

  @Command
  fun setMosaic(invoke: Invoke) {
    val a = invoke.parseArgs(MosaicArg::class.java)
    val key = a.mosaic.lowercase()
    current = key
    when (key) {
      "cinematic" -> applyCinematic()
      "contoured" -> applyContoured()
      else -> applyStandard()
    }
    invoke.resolve()
  }

  @Command
  fun getMosaic(invoke: Invoke) {
    val o = JSObject()
    o.put("mosaic", current)
    invoke.resolve(o)
  }

  private fun applyStandard() = activity.runOnUiThread {
    val wv = webView ?: return@runOnUiThread
    val window = activity.window
    clearInsetListener(wv)

    // Draw edge-to-edge; CSS pads using injected --safe-area-inset-* so the
    // themed page background shows under the status/nav bars (not a black scrim).
    WindowCompat.setDecorFitsSystemWindows(window, false)
    wv.setPadding(0, 0, 0, 0)
    wv.setBackgroundColor(Color.TRANSPARENT)
    window.statusBarColor = Color.TRANSPARENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      @Suppress("DEPRECATION")
      window.navigationBarColor = Color.TRANSPARENT
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val lp = window.attributes
      lp.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      window.attributes = lp
    }

    val c = WindowCompat.getInsetsController(window, wv)
    c.show(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
    // App themes are mostly dark; light icons on the status/nav bars.
    c.isAppearanceLightStatusBars = false
    c.isAppearanceLightNavigationBars = false

    val insetTarget = contentRoot() ?: wv
    ViewCompat.setOnApplyWindowInsetsListener(insetTarget) { _, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout(),
      )
      publishSafeAreaInsets(wv, bars.left, bars.top, bars.right, bars.bottom)
      // Do not consume — let children still see insets if needed.
      insets
    }
    ViewCompat.requestApplyInsets(insetTarget)
    // Also publish immediately from root insets in case the listener is late.
    ViewCompat.getRootWindowInsets(insetTarget)?.let { root ->
      val bars = root.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout(),
      )
      publishSafeAreaInsets(wv, bars.left, bars.top, bars.right, bars.bottom)
    }
  }

  private fun applyCinematic() = activity.runOnUiThread {
    val wv = webView ?: return@runOnUiThread
    val window = activity.window
    clearInsetListener(wv)
    cutoutShortEdges()
    wv.setBackgroundColor(Color.TRANSPARENT)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    wv.setPadding(0, 0, 0, 0)
    window.statusBarColor = Color.TRANSPARENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      @Suppress("DEPRECATION")
      window.navigationBarColor = Color.TRANSPARENT
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }
    val c = WindowCompat.getInsetsController(window, wv)
    c.hide(WindowInsetsCompat.Type.systemBars())
    c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    ViewCompat.setOnApplyWindowInsetsListener(wv) { _, _ -> WindowInsetsCompat.CONSUMED }
    publishSafeAreaInsets(wv, 0, 0, 0, 0)
  }

  private fun applyContoured() = activity.runOnUiThread {
    val wv = webView ?: return@runOnUiThread
    val window = activity.window
    clearInsetListener(wv)
    wv.setPadding(0, 0, 0, 0)
    cutoutShortEdges()
    wv.setBackgroundColor(letterboxArgb)
    activity.window.decorView.setBackgroundColor(letterboxArgb)
    window.statusBarColor = letterboxArgb
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      @Suppress("DEPRECATION")
      window.navigationBarColor = letterboxArgb
    }
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val c = WindowCompat.getInsetsController(window, wv)
    c.hide(WindowInsetsCompat.Type.systemBars())
    c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    ViewCompat.setOnApplyWindowInsetsListener(wv) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout(),
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      // Native pad already clears system UI — zero CSS insets to avoid double padding.
      publishSafeAreaInsets(wv, 0, 0, 0, 0)
      insets
    }
    ViewCompat.requestApplyInsets(wv)
  }

  private fun clearInsetListener(wv: WebView) {
    wv.setOnApplyWindowInsetsListener(null)
    ViewCompat.setOnApplyWindowInsetsListener(wv, null)
    contentRoot()?.let { ViewCompat.setOnApplyWindowInsetsListener(it, null) }
  }

  private fun contentRoot(): View? =
    activity.findViewById(android.R.id.content)

  /** Push system-bar insets into CSS custom properties (CSS px). */
  private fun publishSafeAreaInsets(
    wv: WebView,
    leftPx: Int,
    topPx: Int,
    rightPx: Int,
    bottomPx: Int,
  ) {
    val density = wv.resources.displayMetrics.density
    if (density <= 0f) return
    val top = topPx / density
    val bottom = bottomPx / density
    val left = leftPx / density
    val right = rightPx / density
    val js =
      """
      (function(){
        var r=document.documentElement;
        r.setAttribute('data-tauri-android','true');
        r.style.setProperty('--safe-area-inset-top','${top}px');
        r.style.setProperty('--safe-area-inset-bottom','${bottom}px');
        r.style.setProperty('--safe-area-inset-left','${left}px');
        r.style.setProperty('--safe-area-inset-right','${right}px');
      })();
      """.trimIndent()
    wv.post {
      wv.evaluateJavascript(js, null)
    }
  }

  private fun cutoutShortEdges() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val w = activity.window
      val lp = w.attributes
      lp.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      w.attributes = lp
    }
  }
}
