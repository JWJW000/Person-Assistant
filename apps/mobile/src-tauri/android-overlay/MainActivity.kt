package com.assistant.app

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class HapticBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun click() {
    activity.runOnUiThread {
      val view = activity.window.decorView
      view.isHapticFeedbackEnabled = true
      view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
    }
  }

  @JavascriptInterface
  fun vibrate(durationMs: Long) {
    activity.runOnUiThread {
      val v = activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      if (v != null && v.hasVibrator()) {
        val ms = durationMs.coerceIn(10L, 100L)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
          @Suppress("DEPRECATION")
          v.vibrate(ms)
        }
      } else {
        activity.window.decorView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
      }
    }
  }
}

class MainActivity : TauriActivity() {
  private fun findWebView(root: View): WebView? {
    if (root is WebView) return root
    if (root is ViewGroup) {
      for (i in 0 until root.childCount) {
        val found = findWebView(root.getChildAt(i))
        if (found != null) return found
      }
    }
    return null
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // 必须在 super.onCreate 之前：状态栏/导航栏透明
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
    )
    super.onCreate(savedInstanceState)

    // 监听软键盘与系统栏高度，避免整体页面被系统 adjustPan 向上顶移出屏幕
    val contentView = findViewById<View>(android.R.id.content)
    contentView.isHapticFeedbackEnabled = true

    contentView.post {
      val webView = findWebView(contentView)
      webView?.addJavascriptInterface(HapticBridge(this), "AndroidBridge")
    }

    // 只垫系统栏。键盘高度交给 WebView visualViewport，避免 IME padding 与 JS 视口双重挤压导致频闪。
    ViewCompat.setOnApplyWindowInsetsListener(contentView) { view, insets ->
      val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(
        systemBars.left,
        systemBars.top,
        systemBars.right,
        systemBars.bottom
      )
      insets
    }
  }
}
