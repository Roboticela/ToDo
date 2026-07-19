// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.util.Log
import androidx.core.app.ServiceCompat

/**
 * Optional short-lived foreground service woken by [ReminderScheduler] / app start /
 * reboot. Primary closed-app delivery is [ReminderAlarmReceiver] (inline); this FGS
 * is a belt-and-suspenders path and for JS `start_service` / boot rearm.
 *
 * Work-then-exit so Android 15's dataSync FGS time quota is not burned.
 */
class ReminderForegroundService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      val notification = ReminderNotifier.buildServiceNotification(applicationContext)
      ServiceCompat.startForeground(
        this,
        SERVICE_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } catch (t: Throwable) {
      Log.e(TAG, "startForeground failed — still processing reminders", t)
    }

    try {
      ReminderDelivery.processAndRearm(applicationContext)
    } catch (t: Throwable) {
      Log.e(TAG, "processAndRearm failed", t)
    } finally {
      try {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      } catch (_: Exception) {
        // ignore
      }
      stopSelf(startId)
    }

    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    // App swiped away from recents — keep the next exact alarm armed.
    try {
      ReminderScheduler.rearm(applicationContext)
    } catch (_: Exception) {
      // ignore
    }
    super.onTaskRemoved(rootIntent)
  }

  companion object {
    const val SERVICE_NOTIFICATION_ID = 8420
    private const val TAG = "ReminderFGS"
  }
}
