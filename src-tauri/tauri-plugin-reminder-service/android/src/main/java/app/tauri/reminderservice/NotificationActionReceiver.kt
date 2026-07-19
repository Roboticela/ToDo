// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Handles taps on the "Complete" / "Snooze 10m" buttons shown on a reminder notification. */
class NotificationActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_COMPLETE = "app.tauri.reminderservice.action.COMPLETE"
    const val ACTION_SNOOZE = "app.tauri.reminderservice.action.SNOOZE"
    const val EXTRA_NOTIFICATION_ID = "notification_id"
    const val EXTRA_TASK_ID = "task_id"
    const val EXTRA_SCHEDULED_AT_MS = "scheduled_at_ms"
    const val SNOOZE_MS = 10 * 60 * 1000L
  }

  override fun onReceive(context: Context, intent: Intent) {
    val notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID) ?: return
    val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
    val scheduledAtMs = intent.getLongExtra(EXTRA_SCHEDULED_AT_MS, System.currentTimeMillis())

    val store = ReminderStore(context)
    ReminderNotifier.cancel(context, notificationId)

    when (intent.action) {
      ACTION_COMPLETE -> {
        store.markFired(notificationId)
        store.completeTask(taskId, ReminderStore.localDateString(scheduledAtMs))
      }
      ACTION_SNOOZE -> {
        store.snooze(notificationId, System.currentTimeMillis() + SNOOZE_MS)
      }
      else -> return
    }

    // Re-derive the next wake so the snoozed/remaining reminders still fire precisely.
    ReminderScheduler.rearm(context)
  }
}
