// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/** Restarts reminder scheduling after a reboot, if the user had it enabled. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action != Intent.ACTION_BOOT_COMPLETED && action != "android.intent.action.QUICKBOOT_POWERON") {
      return
    }
    if (!ReminderPrefs.isEnabled(context)) return

    val pending = goAsync()
    Thread {
      try {
        // Re-arm first so a crash mid-delivery still leaves a future wake.
        ReminderScheduler.rearm(context)
        ReminderDelivery.processAndRearm(context)
      } catch (t: Throwable) {
        Log.e(TAG, "Boot reminder setup failed", t)
      } finally {
        try {
          ContextCompat.startForegroundService(
            context,
            Intent(context, ReminderForegroundService::class.java),
          )
        } catch (t: Throwable) {
          Log.w(TAG, "Boot FGS start failed (inline rearm already ran)", t)
        }
        try {
          pending.finish()
        } catch (_: Exception) {
          // ignore
        }
      }
    }.start()
  }

  companion object {
    private const val TAG = "ReminderBoot"
  }
}
