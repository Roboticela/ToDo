// SPDX-License-Identifier: MIT
package app.tauri.reminderservice

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Base64
import java.io.File

data class UserSoundPrefs(
  val mode: String,
  val soundId: String?,
  val customSoundUrl: String?,
)

/**
 * Caches the user's selected reminder sound (written from JS) and plays it when
 * [ReminderNotifier] shows a reminder. Channel sound stays as OS default for
 * "Normal" mode; library/custom use a local MP3 via [MediaPlayer] so playback
 * works while the foreground service is awake.
 */
object ReminderSound {
  private const val DIR = "reminder_sounds"
  private const val ACTIVE_META = "active_key.txt"

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
      return true
    }
    return try {
      val bytes = Base64.decode(dataBase64, Base64.DEFAULT)
      if (bytes.isEmpty()) return false
      val file = File(soundDir(context), "$key.bin")
      file.writeBytes(bytes)
      setActiveKey(context, key)
      true
    } catch (_: Exception) {
      false
    }
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

  fun fileForKey(context: Context, key: String): File? {
    if (key.isBlank() || key == "normal") return null
    val f = File(soundDir(context), "$key.bin")
    return if (f.exists() && f.length() > 0L) f else null
  }

  fun resolvePlaybackFile(context: Context, prefs: UserSoundPrefs?): File? {
    val mode = prefs?.mode?.lowercase() ?: return fileForKey(context, activeKey(context))
    if (mode == "normal") return null
    val key = cacheKey(mode, prefs.soundId)
    fileForKey(context, key)?.let { return it }
    fileForKey(context, activeKey(context))?.let { return it }

    // Last resort: download custom sound URL if JS hasn't cached it yet.
    if (mode == "custom") {
      val url = prefs.customSoundUrl?.trim().orEmpty()
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return downloadTo(context, key, url)
      }
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
        val file = File(soundDir(context), "$key.bin")
        file.writeBytes(bytes)
        setActiveKey(context, key)
        file
      }
    } catch (_: Exception) {
      null
    }
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
