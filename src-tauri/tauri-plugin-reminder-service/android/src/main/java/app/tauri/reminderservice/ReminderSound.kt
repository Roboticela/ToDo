// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.util.Base64
import java.io.File

data class UserSoundPrefs(
  val mode: String,
  val soundId: String?,
  val customSoundUrl: String?,
)

/**
 * Caches the user's selected reminder sound and plays it when [ReminderNotifier]
 * shows a reminder.
 *
 * Library (preset/ringtone) tones are bundled as APK assets under sounds/ (MP3s
 * synced from public/sounds at Gradle build time). Custom tones are written
 * from the JS bridge as base64. Channel sound stays OS-default for "Normal"
 * mode; library/custom use a silent channel + [MediaPlayer], or a per-file
 * notification channel when the Tauri Schedule.at fallback is used.
 */
object ReminderSound {
  private const val DIR = "reminder_sounds"
  private const val ACTIVE_META = "active_key.txt"
  private const val ACTIVE_CHANNEL_META = "active_channel.txt"
  const val CHANNEL_FILE_PREFIX = "task-reminders-file-"

  fun soundDir(context: Context): File = File(context.filesDir, DIR).also { it.mkdirs() }

  fun cacheKey(mode: String, soundId: String?): String {
    val normalized = mode.lowercase()
    return when (normalized) {
      "custom" -> "custom"
      "preset", "ringtone" -> {
        val id = (soundId?.ifBlank { null } ?: "notify-correct").replace('-', '_')
        "preset_$id"
      }
      else -> "normal"
    }
  }

  /** Persist raw audio bytes from the JS bridge (base64). */
  fun cacheFromBase64(context: Context, key: String, dataBase64: String): Boolean {
    if (key.isBlank() || key == "normal") {
      setActiveKey(context, "normal")
      setActiveChannelId(context, ReminderNotifier.CHANNEL_REMINDERS)
      return true
    }
    return try {
      val bytes = Base64.decode(dataBase64, Base64.DEFAULT)
      if (bytes.isEmpty()) return false
      val file = File(soundDir(context), "$key.mp3")
      file.writeBytes(bytes)
      // Remove legacy .bin if present
      File(soundDir(context), "$key.bin").delete()
      setActiveKey(context, key)
      val channelId = ensureFileSoundChannel(context, key, file)
      setActiveChannelId(context, channelId)
      true
    } catch (_: Exception) {
      false
    }
  }

  /**
   * Activate a bundled library sound by id (e.g. `notify-correct`).
   * Copies the APK asset into app files so MediaPlayer / notification channels
   * can use a real file URI — no JS base64 transfer required.
   */
  fun activateLibrarySound(context: Context, soundId: String?): String {
    val id = soundId?.ifBlank { null } ?: "notify-correct"
    val key = cacheKey("preset", id)
    val file = ensureLibraryFile(context, id) ?: return ReminderNotifier.CHANNEL_REMINDERS
    setActiveKey(context, key)
    val channelId = ensureFileSoundChannel(context, key, file)
    setActiveChannelId(context, channelId)
    return channelId
  }

  fun setActiveKey(context: Context, key: String) {
    try {
      File(soundDir(context), ACTIVE_META).writeText(key)
    } catch (_: Exception) {
      // ignore
    }
  }

  fun activeKey(context: Context): String =
    try {
      val f = File(soundDir(context), ACTIVE_META)
      if (f.exists()) f.readText().trim().ifBlank { "normal" } else "normal"
    } catch (_: Exception) {
      "normal"
    }

  fun setActiveChannelId(context: Context, channelId: String) {
    try {
      File(soundDir(context), ACTIVE_CHANNEL_META).writeText(channelId)
    } catch (_: Exception) {
      // ignore
    }
  }

  fun activeChannelId(context: Context): String =
    try {
      val f = File(soundDir(context), ACTIVE_CHANNEL_META)
      if (f.exists()) {
        f.readText().trim().ifBlank { ReminderNotifier.CHANNEL_REMINDERS }
      } else {
        ReminderNotifier.CHANNEL_REMINDERS
      }
    } catch (_: Exception) {
      ReminderNotifier.CHANNEL_REMINDERS
    }

  fun fileForKey(context: Context, key: String): File? {
    if (key.isBlank() || key == "normal") return null
    val mp3 = File(soundDir(context), "$key.mp3")
    if (mp3.exists() && mp3.length() > 0L) return mp3
    val bin = File(soundDir(context), "$key.bin")
    return if (bin.exists() && bin.length() > 0L) bin else null
  }

  /** Copy `assets/sounds/{id}.mp3` into the cache dir if not already present. */
  fun ensureLibraryFile(context: Context, soundId: String): File? {
    val id = soundId.ifBlank { "notify-correct" }
    val key = cacheKey("preset", id)
    fileForKey(context, key)?.let { return it }

    val candidates = listOf(
      "sounds/$id.mp3",
      "sounds/${id.replace('-', '_')}.mp3",
    )
    for (assetPath in candidates) {
      try {
        context.assets.open(assetPath).use { input ->
          val file = File(soundDir(context), "$key.mp3")
          file.outputStream().use { output -> input.copyTo(output) }
          if (file.length() > 0L) return file
        }
      } catch (_: Exception) {
        // try next candidate
      }
    }
    return null
  }

  /**
   * Create (once) a HIGH-importance channel whose sound is [file].
   * Used by the Tauri Schedule.at fallback so OS-delivered notifications play
   * the selected library/custom tone even when our process is not awake.
   */
  fun ensureFileSoundChannel(context: Context, key: String, file: File): String {
    val channelId = "$CHANNEL_FILE_PREFIX$key-v1"
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      ?: return ReminderNotifier.CHANNEL_REMINDERS_CUSTOM
    if (nm.getNotificationChannel(channelId) == null) {
      val audioAttrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      val channel = NotificationChannel(
        channelId,
        "Task reminders (selected sound)",
        NotificationManager.IMPORTANCE_HIGH,
      )
      channel.description = "Reminders using your selected library or custom sound"
      channel.enableVibration(true)
      channel.enableLights(true)
      channel.setSound(Uri.fromFile(file), audioAttrs)
      nm.createNotificationChannel(channel)
    }
    return channelId
  }

  fun resolvePlaybackFile(context: Context, prefs: UserSoundPrefs?): File? {
    val mode = prefs?.mode?.lowercase() ?: return fileForKey(context, activeKey(context))
    if (mode == "normal") return null

    if (mode == "preset" || mode == "ringtone") {
      val id = prefs.soundId?.ifBlank { null } ?: "notify-correct"
      ensureLibraryFile(context, id)?.let { return it }
    }

    val key = cacheKey(mode, prefs.soundId)
    fileForKey(context, key)?.let { return it }
    fileForKey(context, activeKey(context))?.let { return it }

    // Last resort: download custom sound URL if JS hasn't cached it yet.
    if (mode == "custom") {
      val url = prefs.customSoundUrl?.trim().orEmpty()
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return downloadTo(context, key, url)
      }
      // data: URLs are handled by JS cache_sound (decoded client-side).
    }
    return null
  }

  private fun downloadTo(context: Context, key: String, url: String): File? {
    return try {
      val conn = java.net.URL(url).openConnection()
      conn.connectTimeout = 8000
      conn.readTimeout = 8000
      conn.getInputStream().use { input ->
        val bytes = input.readBytes()
        if (bytes.isEmpty()) return null
        val file = File(soundDir(context), "$key.mp3")
        file.writeBytes(bytes)
        setActiveKey(context, key)
        ensureFileSoundChannel(context, key, file)
        file
      }
    } catch (_: Exception) {
      null
    }
  }

  /** Resolve + play for the given prefs (or the last activated key). */
  fun playForPrefs(context: Context, prefs: UserSoundPrefs?): Boolean {
    val file = resolvePlaybackFile(context, prefs) ?: return false
    return play(context, file)
  }

  /** Play a local sound file once (non-blocking). Returns true if started. */
  fun play(context: Context, file: File?): Boolean {
    if (file == null || !file.exists()) return false
    return try {
      val player = MediaPlayer()
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      player.setDataSource(file.absolutePath)
      player.setOnCompletionListener { mp ->
        try {
          mp.release()
        } catch (_: Exception) {
          // ignore
        }
      }
      player.setOnErrorListener { mp, _, _ ->
        try {
          mp.release()
        } catch (_: Exception) {
          // ignore
        }
        true
      }
      player.prepare()
      player.start()
      true
    } catch (_: Exception) {
      false
    }
  }
}
