// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.Context

/** Whether the user opted into the background reminder service — checked by [BootReceiver]. */
object ReminderPrefs {
  private const val PREFS_NAME = "reminder_service_prefs"
  private const val KEY_ENABLED = "enabled"

  /** Defaults to true to match JS `isBackgroundServiceEnabledLocally()`. */
  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, true)

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
  }
}
