// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.Activity
import android.app.AlarmManager
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

@InvokeArg
class ActivateLibrarySoundArg {
  var soundId: String? = null
}

@InvokeArg
class PlaySoundArg {
  var mode: String? = null
  var soundId: String? = null
  var customSoundUrl: String? = null
}

@TauriPlugin
class ReminderServicePlugin(private val activity: Activity) : Plugin(activity) {

  @Command
  fun startService(invoke: Invoke) {
    ReminderPrefs.setEnabled(activity, true)
    // Exact alarms are required for reliable delivery when the app is fully closed.
    maybePromptExactAlarms()
    ReminderNotifier.ensureChannels(activity)
    ContextCompat.startForegroundService(
      activity,
      Intent(activity, ReminderForegroundService::class.java),
    )
    // Arm the next wake immediately so closing the app right after start still works.
    ReminderScheduler.rearm(activity)
    invoke.resolve(capabilityObject())
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
    invoke.resolve(capabilityObject())
  }

  @Command
  fun requestBatteryExemption(invoke: Invoke) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val pm = activity.getSystemService(PowerManager::class.java)
      if (pm != null && !pm.isIgnoringBatteryOptimizations(activity.packageName)) {
        try {
          val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${activity.packageName}")
          }
          activity.startActivity(intent)
        } catch (_: Exception) {
          // Some OEMs block this intent — ignore.
        }
      }
    }
    invoke.resolve(capabilityObject())
  }

  /**
   * Cache the currently selected reminder sound bytes so [ReminderNotifier] can play
   * library/custom audio while the app is closed.
   */
  @Command
  fun cacheSound(invoke: Invoke) {
    val args = invoke.parseArgs(CacheSoundArg::class.java)
    ReminderNotifier.ensureChannels(activity)
    val ok = ReminderSound.cacheFromBase64(activity, args.key, args.dataBase64)
    val result = JSObject()
    result.put("ok", ok as Boolean)
    result.put("channelId", ReminderSound.activeChannelId(activity))
    if (ok) invoke.resolve(result) else invoke.reject("Failed to cache reminder sound")
  }

  /**
   * Point native playback at a bundled catalog MP3 (no base64 transfer).
   * Returns the notification channel id that plays that file for Schedule.at.
   */
  @Command
  fun activateLibrarySound(invoke: Invoke) {
    val args = invoke.parseArgs(ActivateLibrarySoundArg::class.java)
    ReminderNotifier.ensureChannels(activity)
    val channelId = ReminderSound.activateLibrarySound(activity, args.soundId)
    val result = JSObject()
    result.put("ok", (channelId != ReminderNotifier.CHANNEL_REMINDERS) as Boolean)
    result.put("channelId", channelId)
    invoke.resolve(result)
  }

  /**
   * Play the selected library/custom sound once (for immediate JS-fired reminders).
   */
  @Command
  fun playSound(invoke: Invoke) {
    val args = invoke.parseArgs(PlaySoundArg::class.java)
    ReminderNotifier.ensureChannels(activity)
    val mode = args.mode?.ifBlank { null } ?: "preset"
    val prefs = UserSoundPrefs(
      mode = mode,
      soundId = args.soundId,
      customSoundUrl = args.customSoundUrl,
    )
    val ok = ReminderSound.playForPrefs(activity, prefs)
    val result = JSObject()
    result.put("ok", ok as Boolean)
    invoke.resolve(result)
  }

  private fun maybePromptExactAlarms() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val am = activity.getSystemService(AlarmManager::class.java) ?: return
    if (am.canScheduleExactAlarms()) return
    try {
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = Uri.parse("package:${activity.packageName}")
      }
      activity.startActivity(intent)
    } catch (_: Exception) {
      try {
        activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${activity.packageName}")
        })
      } catch (_: Exception) {
        // ignore
      }
    }
  }

  private fun capabilityObject(): JSObject {
    val o = JSObject()
    o.put("enabled", ReminderPrefs.isEnabled(activity))
    o.put("exactAlarms", canExactAlarms())
    o.put("batteryExempt", isBatteryExempt())
    return o
  }

  private fun canExactAlarms(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val am = activity.getSystemService(AlarmManager::class.java) ?: return false
    return am.canScheduleExactAlarms()
  }

  private fun isBatteryExempt(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = activity.getSystemService(PowerManager::class.java) ?: return false
    return pm.isIgnoringBatteryOptimizations(activity.packageName)
  }
}
