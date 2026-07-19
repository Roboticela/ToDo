// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Owns the single exact alarm that wakes [ReminderAlarmReceiver] (which in turn starts
 * [ReminderForegroundService]) at the next due reminder time. One precise alarm instead of
 * a busy-poll — battery friendly, and exact alarms are exempt from Doze.
 */
object ReminderScheduler {
  private const val ALARM_REQUEST_CODE = 8421

  /** Self-healing fallback poll if nothing is scheduled yet (e.g. DB unreadable). */
  private const val FALLBACK_POLL_MS = 15 * 60 * 1000L

  fun rearm(context: Context) {
    val store = ReminderStore(context)
    val now = System.currentTimeMillis()
    // Only schedule for a *future* reminder. Never use "now + 1s" for past rows —
    // that caused a 1-second wake loop that cascade-fired every upcoming event.
    val nextAt = store.getNextFutureWakeAtMs(now)
    val fireAt = nextAt ?: (now + FALLBACK_POLL_MS)
    scheduleAlarm(context, fireAt)
  }

  fun cancel(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    am.cancel(pendingIntent(context))
  }

  private fun scheduleAlarm(context: Context, atMs: Long) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pi = pendingIntent(context)
    val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    if (canExact) {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    }
  }

  private fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, ReminderAlarmReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags)
  }
}
