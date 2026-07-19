// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** A due reminder ready to show, joined with its task. */
data class DueReminder(
  val notificationId: String,
  val taskId: String,
  val userId: String,
  val scheduledAtMs: Long,
  val type: String, // "reminder" | "start" | "end"
  val taskTitle: String,
  val taskDescription: String?,
  val startTime: String?,
  val endTime: String?,
)

/**
 * Reads/writes the same `todo.db` SQLite file the Rust side manages
 * (see `src-tauri/src/db.rs`), directly from Kotlin so reminders keep firing
 * even while the WebView/Rust side is fully suspended.
 *
 * Only the narrow set of fields the service needs are ever touched — full
 * JSON blobs are round-tripped through [org.json.JSONObject], so unrelated
 * fields (and anything the sync engine cares about) are never lost.
 */
class ReminderStore(private val context: Context) {
  private val dbPath: String
    get() = context.dataDir.absolutePath + "/todo.db"

  private fun openOrNull(): SQLiteDatabase? =
    try {
      SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READWRITE)
    } catch (e: Exception) {
      null
    }

  /**
   * Unfired notification rows whose time has arrived (within [graceMs]), joined with their task.
   * Also silently expires rows that are past the grace window so they cannot keep the
   * scheduler stuck in a past-due busy loop.
   */
  fun getDueReminders(nowMs: Long, graceMs: Long): List<DueReminder> {
    val db = openOrNull() ?: return emptyList()
    try {
      val out = mutableListOf<DueReminder>()
      val expiredIds = mutableListOf<String>()

      db.rawQuery("SELECT id, data FROM notifications", null).use { cursor ->
        while (cursor.moveToNext()) {
          val rowId = cursor.getString(0) ?: continue
          val notifJson = parseJsonOrNull(cursor.getString(1)) ?: continue
          if (notifJson.optBoolean("fired", true)) continue
          val scheduledAtMs = parseIso(notifJson.optString("scheduledAt", "")) ?: continue

          if (scheduledAtMs > nowMs) continue

          if (nowMs - scheduledAtMs > graceMs) {
            expiredIds.add(rowId)
            continue
          }

          val taskId = notifJson.optString("taskId", "")
          val task = getTaskJson(db, taskId)
          if (task == null || (task.has("deletedAt") && !task.isNull("deletedAt"))) {
            expiredIds.add(rowId)
            continue
          }

          out.add(
            DueReminder(
              notificationId = notifJson.optString("id", rowId),
              taskId = taskId,
              userId = notifJson.optString("userId"),
              scheduledAtMs = scheduledAtMs,
              type = notifJson.optString("type", "reminder"),
              taskTitle = task.optString("title", "Task"),
              taskDescription = optNullableString(task, "description"),
              startTime = optNullableString(task, "startTime"),
              endTime = optNullableString(task, "endTime"),
            )
          )
        }
      }

      // Cursor must be closed before writes (Android SQLite can fail otherwise).
      for (id in expiredIds) {
        markFiredOn(db, id)
      }

      return out.sortedBy { it.scheduledAtMs }
    } finally {
      db.close()
    }
  }

  /**
   * Earliest *future* unfired notification time, or null if none are pending.
   * Past-due rows must never be returned here — that used to re-arm a 1s alarm
   * and cascade-fire every subsequent reminder.
   */
  fun getNextFutureWakeAtMs(nowMs: Long): Long? {
    val db = openOrNull() ?: return null
    try {
      var earliest: Long? = null
      db.rawQuery("SELECT data FROM notifications", null).use { cursor ->
        while (cursor.moveToNext()) {
          val notifJson = parseJsonOrNull(cursor.getString(0)) ?: continue
          if (notifJson.optBoolean("fired", true)) continue
          val at = parseIso(notifJson.optString("scheduledAt", "")) ?: continue
          if (at <= nowMs) continue
          if (earliest == null || at < earliest!!) earliest = at
        }
      }
      return earliest
    } finally {
      db.close()
    }
  }

  fun markFired(notificationId: String) {
    val db = openOrNull() ?: return
    try {
      markFiredOn(db, notificationId)
    } finally {
      db.close()
    }
  }

  /** Read-then-write with the cursor fully closed before the UPDATE. */
  private fun markFiredOn(db: SQLiteDatabase, notificationId: String) {
    val raw = db.rawQuery(
      "SELECT data FROM notifications WHERE id = ?",
      arrayOf(notificationId),
    ).use { cursor ->
      if (!cursor.moveToFirst()) return
      cursor.getString(0)
    }
    val obj = parseJsonOrNull(raw) ?: return
    if (obj.optBoolean("fired", false)) return
    obj.put("fired", true)
    db.execSQL(
      "UPDATE notifications SET data = ? WHERE id = ?",
      arrayOf(obj.toString(), notificationId),
    )
  }

  /** Snooze: push scheduledAt forward and un-fire so it's picked up again next wake. */
  fun snooze(notificationId: String, newScheduledAtMs: Long) {
    val db = openOrNull() ?: return
    try {
      val raw = db.rawQuery(
        "SELECT data FROM notifications WHERE id = ?",
        arrayOf(notificationId),
      ).use { cursor ->
        if (!cursor.moveToFirst()) return
        cursor.getString(0)
      }
      val obj = parseJsonOrNull(raw) ?: return
      obj.put("fired", false)
      val iso = isoFormat(newScheduledAtMs)
      obj.put("scheduledAt", iso)
      db.execSQL(
        "UPDATE notifications SET scheduled_at = ?, data = ? WHERE id = ?",
        arrayOf(iso, obj.toString(), notificationId),
      )
    } finally {
      db.close()
    }
  }

  /** Mark a task complete, mirroring `completeTask()` in `src/lib/taskService.ts`. */
  fun completeTask(taskId: String, occurrenceDate: String) {
    // Past days are locked — ignore Complete from notifications for previous dates.
    val today = localDateString(System.currentTimeMillis())
    if (occurrenceDate < today) return

    val db = openOrNull() ?: return
    try {
      val task = getTaskJson(db, taskId) ?: return
      val nowIso = isoFormat(System.currentTimeMillis())
      if (task.optBoolean("isRepeating", false)) {
        upsertCompletion(db, task, occurrenceDate, nowIso)
        task.put("updatedAt", nowIso)
        task.put("syncStatus", "pending")
      } else {
        task.put("status", "completed")
        task.put("completedAt", nowIso)
        task.put("updatedAt", nowIso)
        task.put("syncStatus", "pending")
      }
      db.execSQL(
        "UPDATE tasks SET sync_status = ?, data = ? WHERE id = ?",
        arrayOf("pending", task.toString(), taskId),
      )

      // Drop any other pending reminders for this task so Complete does not leave
      // a follow-up that can fire immediately after.
      val pendingIds = mutableListOf<String>()
      db.rawQuery(
        "SELECT id, data FROM notifications WHERE task_id = ?",
        arrayOf(taskId),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          val id = cursor.getString(0) ?: continue
          val obj = parseJsonOrNull(cursor.getString(1)) ?: continue
          if (!obj.optBoolean("fired", true)) pendingIds.add(id)
        }
      }
      for (id in pendingIds) markFiredOn(db, id)
    } finally {
      db.close()
    }
  }

  private fun upsertCompletion(db: SQLiteDatabase, task: JSONObject, date: String, nowIso: String) {
    val taskId = task.optString("id")
    val userId = task.optString("userId")
    val existingId = db.rawQuery(
      "SELECT id FROM completions WHERE task_id = ? AND date = ?",
      arrayOf(taskId, date),
    ).use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }

    val id = existingId ?: UUID.randomUUID().toString()
    val obj = JSONObject()
    obj.put("id", id)
    obj.put("taskId", taskId)
    obj.put("userId", userId)
    obj.put("date", date)
    obj.put("status", "completed")
    obj.put("completedAt", nowIso)
    obj.put("syncStatus", "pending")
    db.execSQL(
      "INSERT OR REPLACE INTO completions (id, task_id, user_id, date, sync_status, data) VALUES (?, ?, ?, ?, ?, ?)",
      arrayOf(id, taskId, userId, date, "pending", obj.toString()),
    )
  }

  private fun getTaskJson(db: SQLiteDatabase, taskId: String): JSONObject? {
    db.rawQuery("SELECT data FROM tasks WHERE id = ?", arrayOf(taskId)).use { cursor ->
      if (!cursor.moveToFirst()) return null
      return parseJsonOrNull(cursor.getString(0))
    }
  }

  /** Sound prefs from the users table (same JSON blob the JS side stores). */
  fun getUserSoundPrefs(userId: String): UserSoundPrefs? {
    if (userId.isEmpty()) return null
    val db = openOrNull() ?: return null
    try {
      db.rawQuery("SELECT data FROM users WHERE id = ?", arrayOf(userId)).use { cursor ->
        if (!cursor.moveToFirst()) return null
        val user = parseJsonOrNull(cursor.getString(0)) ?: return null
        val mode = user.optString("notificationSoundMode", "preset").ifBlank { "preset" }
        val soundId = optNullableString(user, "notificationSoundId")
        val customUrl = optNullableString(user, "customSoundUrl")
        return UserSoundPrefs(mode = mode, soundId = soundId, customSoundUrl = customUrl)
      }
    } finally {
      db.close()
    }
  }

  private fun parseJsonOrNull(raw: String?): JSONObject? =
    if (raw == null) null else try { JSONObject(raw) } catch (e: Exception) { null }

  private fun optNullableString(obj: JSONObject, key: String): String? =
    if (obj.has(key) && !obj.isNull(key)) obj.optString(key) else null

  companion object {
    /** JS always produces `Date#toISOString()` output: fractional millis + trailing Z. */
    private const val ISO_PATTERN = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"

    fun parseIso(value: String): Long? {
      if (value.isEmpty()) return null
      val trimmed = value.trim()
      val patterns = arrayOf(
        ISO_PATTERN,
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX",
      )
      for (pattern in patterns) {
        try {
          val fmt = SimpleDateFormat(pattern, Locale.US)
          fmt.timeZone = TimeZone.getTimeZone("UTC")
          fmt.isLenient = false
          val parsed = fmt.parse(trimmed)?.time
          if (parsed != null) return parsed
        } catch (_: Exception) {
          // try next pattern
        }
      }
      return null
    }

    fun isoFormat(ms: Long): String {
      val fmt = SimpleDateFormat(ISO_PATTERN, Locale.US)
      fmt.timeZone = TimeZone.getTimeZone("UTC")
      return fmt.format(Date(ms))
    }

    /** Local calendar date (device timezone) — matches how occurrence dates are computed in JS. */
    fun localDateString(ms: Long): String {
      val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      fmt.timeZone = TimeZone.getDefault()
      return fmt.format(Date(ms))
    }
  }
}
