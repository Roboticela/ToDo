// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Owns the single exact alarm that wakes [ReminderAlarmReceiver] at the next due
 * reminder time. Uses [AlarmManager.setAlarmClock] when possible — that API is the
 * most reliable under Doze / locked screens / OEM battery savers.
 */
object ReminderScheduler {
  private const val ALARM_REQUEST_CODE = 8421
  private const val SHOW_REQUEST_CODE = 8422
  private const val TAG = "ReminderScheduler"

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
    try {
      am.cancel(pendingIntent(context))
    } catch (t: Throwable) {
      Log.w(TAG, "cancel failed", t)
    }
  }

  private fun scheduleAlarm(context: Context, atMs: Long) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pi = pendingIntent(context)
    val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()

    try {
      if (canExact) {
        // setAlarmClock is exempt from Doze and is the most reliable closed-app wake.
        val show = showAppPendingIntent(context)
        am.setAlarmClock(AlarmManager.AlarmClockInfo(atMs, show), pi)
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
      }
    } catch (t: Throwable) {
      Log.e(TAG, "Failed to schedule alarm at $atMs — falling back", t)
      try {
        if (canExact) {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
        } else {
          am.set(AlarmManager.RTC_WAKEUP, atMs, pi)
        }
      } catch (t2: Throwable) {
        Log.e(TAG, "Fallback schedule also failed", t2)
      }
    }
  }

  private fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, ReminderAlarmReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags)
  }

  /** Tapping the status-bar alarm clock icon opens the app. */
  private fun showAppPendingIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().apply {
        setClassName(context.packageName, "${context.packageName}.MainActivity")
      }
    launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getActivity(context, SHOW_REQUEST_CODE, launch, flags)
  }
}
