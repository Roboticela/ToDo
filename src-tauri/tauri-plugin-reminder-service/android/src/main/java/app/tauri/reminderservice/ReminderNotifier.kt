// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.provider.Settings
import androidx.core.app.NotificationCompat

/**
 * Builds WhatsApp-style custom reminder notifications: branded small icon + accent color,
 * expanded BigText, sound/vibration, tap-to-open, and Complete / Snooze action buttons —
 * plus the small mandatory "service is running" notification Android requires while
 * [ReminderForegroundService] is alive.
 *
 * Sound behavior:
 * - Normal → OS default via the notification channel
 * - Library / Custom → local cached file played with [ReminderSound] (channel stays silent
 *   so we don't double-play the default tone)
 */
object ReminderNotifier {
  const val CHANNEL_REMINDERS = "task-reminders-native-v3"
  const val CHANNEL_REMINDERS_CUSTOM = "task-reminders-native-custom-v3"
  const val CHANNEL_SERVICE = "reminder-service-status"

  /** App brand primary (`--color-primary` in src/index.css). */
  private const val ACCENT_COLOR = 0xFF6366F1.toInt()

  fun ensureChannels(context: Context) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val audioAttrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    if (nm.getNotificationChannel(CHANNEL_REMINDERS) == null) {
      val channel = NotificationChannel(
        CHANNEL_REMINDERS,
        "Task reminders",
        NotificationManager.IMPORTANCE_HIGH,
      )
      channel.description = "Reminders for your scheduled tasks"
      channel.enableVibration(true)
      channel.enableLights(true)
      channel.lightColor = ACCENT_COLOR
      channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audioAttrs)
      nm.createNotificationChannel(channel)
    }

    // Silent channel — used when we play library/custom audio ourselves.
    if (nm.getNotificationChannel(CHANNEL_REMINDERS_CUSTOM) == null) {
      val channel = NotificationChannel(
        CHANNEL_REMINDERS_CUSTOM,
        "Task reminders (library/custom sound)",
        NotificationManager.IMPORTANCE_HIGH,
      )
      channel.description = "Reminders that play your selected library or custom sound"
      channel.enableVibration(true)
      channel.enableLights(true)
      channel.lightColor = ACCENT_COLOR
      channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      channel.setSound(null, null)
      nm.createNotificationChannel(channel)
    }

    if (nm.getNotificationChannel(CHANNEL_SERVICE) == null) {
      val channel = NotificationChannel(
        CHANNEL_SERVICE,
        "Background reminders status",
        NotificationManager.IMPORTANCE_MIN,
      )
      channel.description = "Shows that ToDo is running in the background so reminders stay on time"
      channel.setShowBadge(false)
      channel.setSound(null, null)
      nm.createNotificationChannel(channel)
    }
  }

  /** The mandatory ongoing notification a foreground service must show — kept minimal and silent. */
  fun buildServiceNotification(context: Context): Notification {
    ensureChannels(context)
    return NotificationCompat.Builder(context, CHANNEL_SERVICE)
      .setContentTitle("ToDo reminders active")
      .setContentText("Listening for task reminders in the background")
      .setSmallIcon(iconRes(context))
      .setColor(ACCENT_COLOR)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setOngoing(true)
      .setSilent(true)
      .setShowWhen(false)
      .setContentIntent(openAppIntent(context))
      .build()
  }

  fun notificationIdFor(notificationRowId: String): Int = notificationRowId.hashCode()

  fun showReminder(context: Context, reminder: DueReminder) {
    ensureChannels(context)
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val (title, body) = copyFor(reminder)

    val store = ReminderStore(context)
    val prefs = store.getUserSoundPrefs(reminder.userId)
    val customFile = ReminderSound.resolvePlaybackFile(context, prefs)
    val useCustomAudio = customFile != null
    val channelId = if (useCustomAudio) CHANNEL_REMINDERS_CUSTOM else CHANNEL_REMINDERS

    val builder = NotificationCompat.Builder(context, channelId)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setSmallIcon(iconRes(context))
      .setColor(ACCENT_COLOR)
      .setColorized(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openAppIntent(context))
      .addAction(
        iconRes(context),
        "Complete",
        actionIntent(context, NotificationActionReceiver.ACTION_COMPLETE, reminder),
      )

    if (useCustomAudio) {
      builder.setDefaults(NotificationCompat.DEFAULT_VIBRATE)
      builder.setSilent(false)
    } else {
      builder.setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
    }

    if (reminder.type == "reminder") {
      builder.addAction(
        0,
        "Snooze 10m",
        actionIntent(context, NotificationActionReceiver.ACTION_SNOOZE, reminder),
      )
    }

    nm.notify(notificationIdFor(reminder.notificationId), builder.build())

    if (useCustomAudio) {
      ReminderSound.play(context, customFile)
    }
  }

  fun cancel(context: Context, notificationRowId: String) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    nm.cancel(notificationIdFor(notificationRowId))
  }

  private fun iconRes(context: Context): Int {
    // Merged from plugin (or app) res/drawable/ic_notification.xml into the app package.
    val id = context.resources.getIdentifier("ic_notification", "drawable", context.packageName)
    return if (id != 0) id else android.R.drawable.ic_popup_reminder
  }

  private fun openAppIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent().apply {
        setClassName(context.packageName, "${context.packageName}.MainActivity")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
    launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getActivity(context, 0, launch, flags)
  }

  private fun actionIntent(context: Context, action: String, reminder: DueReminder): PendingIntent {
    val intent = Intent(context, NotificationActionReceiver::class.java).apply {
      this.action = action
      putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_ID, reminder.notificationId)
      putExtra(NotificationActionReceiver.EXTRA_TASK_ID, reminder.taskId)
      putExtra(NotificationActionReceiver.EXTRA_SCHEDULED_AT_MS, reminder.scheduledAtMs)
    }
    val requestCode = (reminder.notificationId + action).hashCode()
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, requestCode, intent, flags)
  }

  private fun copyFor(reminder: DueReminder): Pair<String, String> = when (reminder.type) {
    "start" -> "Starting: ${reminder.taskTitle}" to
      (reminder.startTime?.let { "Starting at $it" } ?: "Starting now")
    "end" -> "Ending: ${reminder.taskTitle}" to
      (reminder.endTime?.let { "Ending at $it" } ?: "Ending now")
    else -> {
      val body = if (!reminder.taskDescription.isNullOrBlank()) {
        "Time for: ${reminder.taskTitle}\n${reminder.taskDescription}"
      } else {
        "Time for: ${reminder.taskTitle}"
      }
      reminder.taskTitle to body
    }
  }
}
