import type { NotificationSoundMode } from "../types/todo";

export type SoundCategory = "notifications" | "ringtone" | "enjoy";

export type SynthKind = "chime" | "ping" | "soft" | "bright" | "alarm" | "pulse" | "sparkle" | "warm";

export interface CatalogSound {
  id: string;
  name: string;
  category: SoundCategory;
  blurb: string;
  /** Filenames under C:\\Windows\\Media (tried in order) */
  windowsFiles?: string[];
  /** macOS system sound name (e.g. Ping → /System/Library/Sounds/Ping.aiff) */
  macSound?: string;
  /** Freedesktop / XDG theme sound name */
  linuxSound?: string;
  /** Web Audio fallback shape */
  synth: SynthKind;
}

export const SOUND_CATEGORIES: {
  id: SoundCategory;
  label: string;
  blurb: string;
}[] = [
  {
    id: "notifications",
    label: "Notifications",
    blurb: "Clear, short alerts for task reminders",
  },
  {
    id: "ringtone",
    label: "Ringtones",
    blurb: "Longer tones that grab attention",
  },
  {
    id: "enjoy",
    label: "Enjoy",
    blurb: "Softer, delightful sounds",
  },
];

/** Curated built-in library. Real OS files when available; synth fallback elsewhere. */
export const SOUND_CATALOG: CatalogSound[] = [
  // ── Notifications ──────────────────────────────────────────
  {
    id: "notify-default",
    name: "System Notify",
    category: "notifications",
    blurb: "Classic Windows / system notification",
    windowsFiles: [
      "Windows Notify System Generic.wav",
      "Windows Notify.wav",
      "notify.wav",
    ],
    macSound: "Glass",
    linuxSound: "message-new-instant",
    synth: "chime",
  },
  {
    id: "notify-nudge",
    name: "Nudge",
    category: "notifications",
    blurb: "Soft message nudge",
    windowsFiles: ["Windows Message Nudge.wav", "Windows Balloon.wav"],
    macSound: "Tink",
    linuxSound: "dialog-information",
    synth: "ping",
  },
  {
    id: "notify-ding",
    name: "Ding",
    category: "notifications",
    blurb: "Bright attention ding",
    windowsFiles: ["Windows Ding.wav", "ding.wav"],
    macSound: "Ping",
    linuxSound: "bell",
    synth: "bright",
  },
  {
    id: "notify-info",
    name: "Info Bar",
    category: "notifications",
    blurb: "Subtle information cue",
    windowsFiles: ["Windows Information Bar.wav", "Windows Exclamation.wav"],
    macSound: "Pop",
    linuxSound: "dialog-warning",
    synth: "soft",
  },
  {
    id: "notify-proximity",
    name: "Proximity",
    category: "notifications",
    blurb: "Modern proximity chime",
    windowsFiles: [
      "Windows Proximity Notification.wav",
      "Windows Proximity Connection.wav",
    ],
    macSound: "Purr",
    linuxSound: "message",
    synth: "pulse",
  },

  // ── Ringtones ──────────────────────────────────────────────
  {
    id: "ring-classic",
    name: "Classic Ring",
    category: "ringtone",
    blurb: "Familiar phone-style ring",
    windowsFiles: ["Ring01.wav", "Windows Ringin.wav"],
    macSound: "Sosumi",
    linuxSound: "phone-incoming-call",
    synth: "alarm",
  },
  {
    id: "ring-pulse",
    name: "Pulse Ring",
    category: "ringtone",
    blurb: "Steady pulsing alert",
    windowsFiles: ["Ring02.wav", "Ring03.wav"],
    macSound: "Funk",
    linuxSound: "phone-outgoing-busy",
    synth: "pulse",
  },
  {
    id: "ring-alarm",
    name: "Alarm",
    category: "ringtone",
    blurb: "Strong wake-up alarm",
    windowsFiles: ["Alarm01.wav", "Alarm02.wav"],
    macSound: "Hero",
    linuxSound: "alarm-clock-elapsed",
    synth: "alarm",
  },
  {
    id: "ring-echo",
    name: "Echo",
    category: "ringtone",
    blurb: "Echoing ring tone",
    windowsFiles: ["Ring05.wav", "Ring06.wav"],
    macSound: "Submarine",
    linuxSound: "phone-incoming-call",
    synth: "bright",
  },
  {
    id: "ring-urgent",
    name: "Urgent",
    category: "ringtone",
    blurb: "High-priority ringtone",
    windowsFiles: ["Alarm05.wav", "Alarm10.wav", "Ring10.wav"],
    macSound: "Sosumi",
    linuxSound: "alarm-clock-elapsed",
    synth: "alarm",
  },

  // ── Enjoy ──────────────────────────────────────────────────
  {
    id: "enjoy-chimes",
    name: "Chimes",
    category: "enjoy",
    blurb: "Gentle wind chimes",
    windowsFiles: ["chimes.wav", "Windows Logon.wav"],
    macSound: "Blow",
    linuxSound: "complete",
    synth: "sparkle",
  },
  {
    id: "enjoy-tada",
    name: "Tada",
    category: "enjoy",
    blurb: "Celebratory flourish",
    windowsFiles: ["tada.wav", "Flourish.wav"],
    macSound: "Hero",
    linuxSound: "complete",
    synth: "sparkle",
  },
  {
    id: "enjoy-chord",
    name: "Chord",
    category: "enjoy",
    blurb: "Warm musical chord",
    windowsFiles: ["chord.wav", "Windows Unlock.wav"],
    macSound: "Glass",
    linuxSound: "desktop-login",
    synth: "warm",
  },
  {
    id: "enjoy-recycle",
    name: "Soft Drop",
    category: "enjoy",
    blurb: "Light, pleasant drop",
    windowsFiles: ["recycle.wav", "Windows Recycle.wav"],
    macSound: "Bottle",
    linuxSound: "trash-empty",
    synth: "soft",
  },
  {
    id: "enjoy-calm",
    name: "Calm",
    category: "enjoy",
    blurb: "Relaxed completion tone",
    windowsFiles: ["Windows Print complete.wav", "Speech On.wav"],
    macSound: "Purr",
    linuxSound: "complete",
    synth: "warm",
  },
];

export function getCatalogSound(id: string | undefined | null): CatalogSound | undefined {
  if (!id) return undefined;
  return SOUND_CATALOG.find((s) => s.id === id);
}

export function soundsByCategory(category: SoundCategory): CatalogSound[] {
  return SOUND_CATALOG.filter((s) => s.category === category);
}

/** Resolve legacy "ringtone" mode to a preset id. */
export function resolvePresetId(
  mode: NotificationSoundMode | undefined,
  soundId: string | undefined
): string | undefined {
  if (mode === "preset" || mode === "ringtone") {
    return soundId || "ring-classic";
  }
  return soundId;
}

export function windowsMediaPath(fileName: string): string {
  return `C:\\Windows\\Media\\${fileName}`;
}

export function macSystemSoundPath(name: string): string {
  return `/System/Library/Sounds/${name}.aiff`;
}
