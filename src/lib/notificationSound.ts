/**
 * Notification sound playback + local cache for custom R2 sounds.
 * Web Notifications cannot set a custom sound on most platforms, so we play audio separately.
 */

const CACHE_NAME = "roboticela-notification-sounds-v1";
let cachedObjectUrl: { key: string; url: string } | null = null;
let ringtoneCtx: AudioContext | null = null;

function revokeCachedObjectUrl() {
  if (cachedObjectUrl) {
    URL.revokeObjectURL(cachedObjectUrl.url);
    cachedObjectUrl = null;
  }
}

async function getCachedBlobUrl(remoteUrl: string): Promise<string | null> {
  if (cachedObjectUrl?.key === remoteUrl) return cachedObjectUrl.url;

  try {
    const cache = await caches.open(CACHE_NAME);
    let res = await cache.match(remoteUrl);
    if (!res) {
      const fetched = await fetch(remoteUrl, { mode: "cors", credentials: "omit" });
      if (!fetched.ok) return null;
      // Put a clone so we can still read the body
      await cache.put(remoteUrl, fetched.clone());
      res = fetched;
    }
    const blob = await res.blob();
    revokeCachedObjectUrl();
    const url = URL.createObjectURL(blob);
    cachedObjectUrl = { key: remoteUrl, url };
    return url;
  } catch {
    return null;
  }
}

/** Prefetch a custom sound into Cache Storage so offline/fired reminders can play it. */
export async function prefetchCustomSound(remoteUrl: string | undefined | null): Promise<void> {
  if (!remoteUrl) return;
  await getCachedBlobUrl(remoteUrl);
}

export async function clearCustomSoundCache(remoteUrl?: string | null): Promise<void> {
  revokeCachedObjectUrl();
  try {
    const cache = await caches.open(CACHE_NAME);
    if (remoteUrl) {
      await cache.delete(remoteUrl);
    } else {
      const keys = await cache.keys();
      await Promise.all(keys.map((k) => cache.delete(k)));
    }
  } catch {
    // ignore
  }
}

/** Short built-in ringtone via Web Audio (no asset file required). */
export async function playRingtone(): Promise<void> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  if (!ringtoneCtx || ringtoneCtx.state === "closed") {
    ringtoneCtx = new AudioCtx();
  }
  if (ringtoneCtx.state === "suspended") {
    await ringtoneCtx.resume();
  }

  const ctx = ringtoneCtx;
  const now = ctx.currentTime;
  const notes = [
    { f: 880, t: 0, d: 0.12 },
    { f: 1174.66, t: 0.14, d: 0.12 },
    { f: 1396.91, t: 0.28, d: 0.22 },
  ];

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = note.f;
    gain.gain.setValueAtTime(0.0001, now + note.t);
    gain.gain.exponentialRampToValueAtTime(0.22, now + note.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + note.d);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + note.t);
    osc.stop(now + note.t + note.d + 0.02);
  }
}

export async function playCustomSound(remoteUrl: string): Promise<void> {
  const localUrl = (await getCachedBlobUrl(remoteUrl)) ?? remoteUrl;
  const audio = new Audio(localUrl);
  audio.volume = 0.9;
  try {
    await audio.play();
  } catch {
    // Autoplay may be blocked until a user gesture; ignore
  }
}

export async function playNotificationSound(opts: {
  mode?: "normal" | "ringtone" | "custom";
  customSoundUrl?: string;
}): Promise<void> {
  const mode = opts.mode ?? "normal";
  if (mode === "ringtone") {
    await playRingtone();
    return;
  }
  if (mode === "custom" && opts.customSoundUrl) {
    await playCustomSound(opts.customSoundUrl);
  }
  // "normal" = system notification only (OS may play its default alert)
}
