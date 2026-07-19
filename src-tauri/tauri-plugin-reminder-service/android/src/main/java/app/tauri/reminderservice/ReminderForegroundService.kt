// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.ServiceCompat
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Keeps the app "running forever" in the background: a real Android foreground service
 * with the mandatory always-on status notification. On every start (initial launch, alarm
 * wake, or reboot) it fires any due reminders as custom notifications, then re-arms the
 * single exact alarm for whatever is due next.
 */
class ReminderForegroundService : Service() {
  private lateinit var store: ReminderStore

  override fun onCreate() {
    super.onCreate()
    store = ReminderStore(applicationContext)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = ReminderNotifier.buildServiceNotification(applicationContext)
    ServiceCompat.startForeground(
      this,
      SERVICE_NOTIFICATION_ID,
      notification,
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    )

    // Prevent overlapping process/rearm from sticky restarts + alarm + JS startService.
    // If a second start arrives while busy, queue a rearm so the latest wake is not dropped.
    if (processing.compareAndSet(false, true)) {
      try {
        do {
          pendingRearm.set(false)
          processDueReminders()
          ReminderScheduler.rearm(applicationContext)
        } while (pendingRearm.get())
      } finally {
        processing.set(false)
      }
    } else {
      pendingRearm.set(true)
    }

    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    // App swiped away from recents — keep the next exact alarm armed.
    ReminderScheduler.rearm(applicationContext)
    super.onTaskRemoved(rootIntent)
  }

  private fun processDueReminders() {
    val now = System.currentTimeMillis()
    // Only fire reminders that are actually due (scheduledAt <= now, within grace).
    // getDueReminders also expires stale past-due rows so they cannot stick the scheduler.
    for (reminder in store.getDueReminders(now, GRACE_MS)) {
      // Mark fired *before* showing so a crash/re-entry cannot re-deliver the same row
      // (and so rearm never sees this id as still pending).
      store.markFired(reminder.notificationId)
      ReminderNotifier.showReminder(applicationContext, reminder)
    }
  }

  companion object {
    const val SERVICE_NOTIFICATION_ID = 8420
    /** Matches OVERDUE_GRACE_MS in src/lib/notificationService.ts. */
    const val GRACE_MS = 2 * 60 * 60 * 1000L

    private val processing = AtomicBoolean(false)
    private val pendingRearm = AtomicBoolean(false)
  }
}
