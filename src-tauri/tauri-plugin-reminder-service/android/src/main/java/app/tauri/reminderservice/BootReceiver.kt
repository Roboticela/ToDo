// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** Restarts the reminder service after a reboot, if the user had it enabled. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action != Intent.ACTION_BOOT_COMPLETED && action != "android.intent.action.QUICKBOOT_POWERON") {
      return
    }
    if (!ReminderPrefs.isEnabled(context)) return
    ContextCompat.startForegroundService(context, Intent(context, ReminderForegroundService::class.java))
  }
}
