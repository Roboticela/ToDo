// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.ServiceCompat
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Short-lived foreground service woken by [ReminderScheduler] exact alarms (or app start /
 * reboot). It fires due reminders, re-arms the next wake, then stops — so Android 15's
 * dataSync FGS time quota is not burned by an always-on process. Exact alarms keep delivery
 * working after the user fully closes the app.
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
        // Work-then-exit: exact alarms wake us again. Avoid perpetual dataSync FGS
        // (Android 15 caps ~6h/day and will kill an always-on service).
        try {
          ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
          // ignore
        }
        stopSelf(startId)
      }
    } else {
      pendingRearm.set(true)
    }

    // NOT_STICKY: alarms / BootReceiver / JS startService are responsible for waking us.
    return START_NOT_STICKY
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
