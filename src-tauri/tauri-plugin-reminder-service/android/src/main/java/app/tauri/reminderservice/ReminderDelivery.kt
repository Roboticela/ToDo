// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.Context
import android.os.PowerManager
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Shared due-reminder processing used by both [ReminderAlarmReceiver] (inline,
 * reliable when the app is killed) and [ReminderForegroundService].
 *
 * Keeping the work in the alarm broadcast (via goAsync) avoids depending on a
 * successful `startForegroundService` hop, which OEMs often block after swipe-away.
 */
object ReminderDelivery {
  /** Matches OVERDUE_GRACE_MS in src/lib/notificationService.ts. */
  const val GRACE_MS = 2 * 60 * 60 * 1000L

  private val processing = AtomicBoolean(false)
  private val pendingRearm = AtomicBoolean(false)

  /**
   * Fire every due reminder, then re-arm the next exact alarm.
   * Safe to call from a BroadcastReceiver (goAsync) or a short-lived FGS.
   */
  fun processAndRearm(context: Context) {
    val app = context.applicationContext
    val pm = app.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "todo:reminder-delivery")
    try {
      wakeLock?.acquire(60_000L)
    } catch (_: Exception) {
      // ignore — still try to deliver
    }

    try {
      if (processing.compareAndSet(false, true)) {
        try {
          do {
            pendingRearm.set(false)
            processDueReminders(app)
            ReminderScheduler.rearm(app)
          } while (pendingRearm.get())
        } finally {
          processing.set(false)
        }
      } else {
        // Another delivery is mid-flight — ask it to rearm once more when done.
        pendingRearm.set(true)
      }
    } finally {
      try {
        if (wakeLock?.isHeld == true) wakeLock.release()
      } catch (_: Exception) {
        // ignore
      }
    }
  }

  private fun processDueReminders(context: Context) {
    val store = ReminderStore(context)
    val now = System.currentTimeMillis()
    for (reminder in store.getDueReminders(now, GRACE_MS)) {
      // Mark fired before showing so a crash/re-entry cannot re-deliver the same row.
      store.markFired(reminder.notificationId)
      ReminderNotifier.showReminder(context, reminder)
    }
  }
}
