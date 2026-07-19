// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class CacheSoundArg {
  lateinit var key: String
  lateinit var dataBase64: String
}

@TauriPlugin
class ReminderServicePlugin(private val activity: Activity) : Plugin(activity) {

  @Command
  fun startService(invoke: Invoke) {
    ReminderPrefs.setEnabled(activity, true)
    ContextCompat.startForegroundService(activity, Intent(activity, ReminderForegroundService::class.java))
    invoke.resolve()
  }

  @Command
  fun stopService(invoke: Invoke) {
    ReminderPrefs.setEnabled(activity, false)
    ReminderScheduler.cancel(activity)
    activity.stopService(Intent(activity, ReminderForegroundService::class.java))
    invoke.resolve()
  }

  @Command
  fun rescheduleNext(invoke: Invoke) {
    ReminderScheduler.rearm(activity)
    invoke.resolve()
  }

  @Command
  fun requestBatteryExemption(invoke: Invoke) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val pm = activity.getSystemService(PowerManager::class.java)
      if (pm != null && !pm.isIgnoringBatteryOptimizations(activity.packageName)) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = Uri.parse("package:${activity.packageName}")
        }
        activity.startActivity(intent)
      }
    }
    invoke.resolve()
  }

  /**
   * Cache the currently selected reminder sound bytes so [ReminderNotifier] can play
   * library/custom audio while the app is closed.
   */
  @Command
  fun cacheSound(invoke: Invoke) {
    val args = invoke.parseArgs(CacheSoundArg::class.java)
    val ok = ReminderSound.cacheFromBase64(activity, args.key, args.dataBase64)
    val result = JSObject()
    result.put("ok", ok)
    if (ok) invoke.resolve(result) else invoke.reject("Failed to cache reminder sound")
  }
}
