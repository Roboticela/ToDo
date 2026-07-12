/**
 * Notification sound playback: OS media files, custom R2 cache, and Web Audio synths.
 */

import { isTauri } from "./tauri";
import { getOsKind } from "./platform";
import {
  getCatalogSound,
  macSystemSoundPath,
  windowsMediaPath,
  type CatalogSound,
  type SynthKind,
} from "./soundCatalog";

const CACHE_NAME = "roboticela-notification-sounds-v1";
let cachedObjectUrl: { key: string; url: string } | null = null;
let audioCtx: AudioContext | null = null;

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

async function getAudioContext(): Promise<AudioContext | null> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  return audioCtx;
}

/** Play a local OS sound file via Tauri (Windows Media / macOS / Linux). */
export async function playOsSoundFile(path: string): Promise<boolean> {
  if (!isTauri() || !path) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("play_system_sound", { path });
    return true;
  } catch {
    return false;
  }
}

/** Resolve and play Windows default notification sound (fixes silent toast). */
export async function playWindowsDefaultNotify(): Promise<boolean> {
  const files = [
    "Windows Notify System Generic.wav",
    "Windows Notify.wav",
    "notify.wav",
    "Windows Message Nudge.wav",
    "Windows Ding.wav",
  ];
  for (const file of files) {
    if (await playOsSoundFile(windowsMediaPath(file))) return true;
  }
  return false;
}

export async function playSynth(kind: SynthKind): Promise<void> {
  const ctx = await getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const patterns: Record<SynthKind, { f: number; t: number; d: number; type?: OscillatorType }[]> = {
    chime: [
      { f: 880, t: 0, d: 0.12 },
      { f: 1174.66, t: 0.14, d: 0.12 },
      { f: 1396.91, t: 0.28, d: 0.22 },
    ],
    ping: [{ f: 1320, t: 0, d: 0.18, type: "sine" }],
    soft: [
      { f: 523.25, t: 0, d: 0.2 },
      { f: 659.25, t: 0.12, d: 0.25 },
    ],
    bright: [
      { f: 1046.5, t: 0, d: 0.1, type: "triangle" },
      { f: 1568, t: 0.1, d: 0.15, type: "triangle" },
    ],
    alarm: [
      { f: 880, t: 0, d: 0.15, type: "square" },
      { f: 988, t: 0.18, d: 0.15, type: "square" },
      { f: 880, t: 0.36, d: 0.15, type: "square" },
      { f: 988, t: 0.54, d: 0.2, type: "square" },
    ],
    pulse: [
      { f: 740, t: 0, d: 0.12 },
      { f: 740, t: 0.2, d: 0.12 },
      { f: 740, t: 0.4, d: 0.18 },
    ],
    sparkle: [
      { f: 1318.5, t: 0, d: 0.1 },
      { f: 1568, t: 0.1, d: 0.1 },
      { f: 2093, t: 0.2, d: 0.22 },
    ],
    warm: [
      { f: 392, t: 0, d: 0.28, type: "triangle" },
      { f: 493.88, t: 0.08, d: 0.32, type: "triangle" },
      { f: 587.33, t: 0.16, d: 0.36, type: "triangle" },
    ],
  };

  const notes = patterns[kind] ?? patterns.chime;
  const peak = kind === "alarm" ? 0.12 : 0.2;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type ?? "sine";
    osc.frequency.value = note.f;
    gain.gain.setValueAtTime(0.0001, now + note.t);
    gain.gain.exponentialRampToValueAtTime(peak, now + note.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + note.d);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + note.t);
    osc.stop(now + note.t + note.d + 0.02);
  }
}

export async function playRingtone(): Promise<void> {
  await playSynth("chime");
}

export async function playCustomSound(remoteUrl: string): Promise<void> {
  const localUrl = (await getCachedBlobUrl(remoteUrl)) ?? remoteUrl;
  const audio = new Audio(localUrl);
  audio.volume = 0.9;
  try {
    await audio.play();
  } catch {
    // ignore
  }
}

function candidatePaths(sound: CatalogSound): string[] {
  const os = getOsKind();
  if (os === "windows" && sound.windowsFiles?.length) {
    return sound.windowsFiles.map(windowsMediaPath);
  }
  if (os === "macos" && sound.macSound) {
    return [macSystemSoundPath(sound.macSound)];
  }
  // Linux theme names aren't file paths — handled via notification plugin; synth fallback here
  return [];
}

/** Play a curated library sound (OS file when possible, else synth). */
export async function playCatalogSound(soundId: string): Promise<void> {
  const sound = getCatalogSound(soundId);
  if (!sound) {
    await playSynth("chime");
    return;
  }

  if (isTauri()) {
    for (const path of candidatePaths(sound)) {
      if (await playOsSoundFile(path)) return;
    }
  }

  await playSynth(sound.synth);
}

/** Best-effort OS default notification sound for the current platform. */
export async function playOsDefaultNotify(): Promise<void> {
  const os = getOsKind();
  if (os === "windows") {
    if (await playWindowsDefaultNotify()) return;
  }
  if (os === "macos" && isTauri()) {
    if (await playOsSoundFile(macSystemSoundPath("Glass"))) return;
    if (await playOsSoundFile(macSystemSoundPath("Ping"))) return;
  }
  // Linux / web / mobile fallback
  await playSynth("chime");
}

export async function playNotificationSound(opts: {
  mode?: "normal" | "ringtone" | "preset" | "custom";
  customSoundUrl?: string;
  soundId?: string;
}): Promise<void> {
  const mode = opts.mode ?? "normal";
  if (mode === "normal") {
    await playOsDefaultNotify();
    return;
  }
  if (mode === "preset" || mode === "ringtone") {
    await playCatalogSound(opts.soundId || "ring-classic");
    return;
  }
  if (mode === "custom" && opts.customSoundUrl) {
    await playCustomSound(opts.customSoundUrl);
  }
}
