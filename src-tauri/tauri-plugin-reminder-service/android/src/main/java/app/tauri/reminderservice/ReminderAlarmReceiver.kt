// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * AlarmManager wakes this at the next due reminder time.
 *
 * Delivers reminders **inline** via [goAsync] so locked / swiped-away phones still
 * get the toast even when starting a foreground service is blocked by the OEM.
 * Also best-effort starts [ReminderForegroundService] for devices that allow it.
 */
class ReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ReminderPrefs.isEnabled(context)) return

    val pending = goAsync()
    Thread {
      try {
        ReminderDelivery.processAndRearm(context)
      } catch (t: Throwable) {
        Log.e(TAG, "Failed to process reminders from alarm", t)
      } finally {
        // Optional FGS — never required for delivery after the inline path above.
        tryStartService(context)
        try {
          pending.finish()
        } catch (_: Exception) {
          // ignore
        }
      }
    }.start()
  }

  private fun tryStartService(context: Context) {
    try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, ReminderForegroundService::class.java),
      )
    } catch (t: Throwable) {
      // Android 12+ / OEM: ForegroundServiceStartNotAllowedException etc.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        Log.w(TAG, "Could not start reminder FGS (inline delivery already ran)", t)
      }
    }
  }

  companion object {
    private const val TAG = "ReminderAlarm"
  }
}
