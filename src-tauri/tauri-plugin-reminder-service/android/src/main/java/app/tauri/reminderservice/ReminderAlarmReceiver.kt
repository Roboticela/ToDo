// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** AlarmManager wakes this at the next due reminder time; it just starts the service. */
class ReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ReminderPrefs.isEnabled(context)) return
    ContextCompat.startForegroundService(context, Intent(context, ReminderForegroundService::class.java))
  }
}
