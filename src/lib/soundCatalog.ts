import type { NotificationSoundMode } from "../types/todo";

export type SoundCategory = "notifications" | "ringtone" | "enjoy";

export interface CatalogSound {
  id: string;
  name: string;
  category: SoundCategory;
  blurb: string;
  /** Bundled Mixkit MP3 under public/sounds */
  src: string;
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

/** Free Mixkit SFX downloaded into public/sounds (see scripts/download-sound-library.js). */
export const SOUND_CATALOG: CatalogSound[] = [
  // Notifications
  { id: "notify-correct", name: "Correct Tone", category: "notifications", blurb: "Short correct-answer chime", src: "/sounds/notify-correct.mp3" },
  { id: "notify-long-pop", name: "Long Pop", category: "notifications", blurb: "Playful long pop", src: "/sounds/notify-long-pop.mp3" },
  { id: "notify-bell", name: "Bell", category: "notifications", blurb: "Classic bell notification", src: "/sounds/notify-bell.mp3" },
  { id: "notify-sci-click", name: "Sci-Fi Click", category: "notifications", blurb: "Futuristic click", src: "/sounds/notify-sci-click.mp3" },
  { id: "notify-message-pop", name: "Message Pop", category: "notifications", blurb: "Message pop alert", src: "/sounds/notify-message-pop.mp3" },
  { id: "notify-ui-start", name: "UI Start", category: "notifications", blurb: "Interface start cue", src: "/sounds/notify-ui-start.mp3" },
  { id: "notify-ui-back", name: "UI Back", category: "notifications", blurb: "Interface back cue", src: "/sounds/notify-ui-back.mp3" },
  { id: "notify-happy-bells", name: "Happy Bells", category: "notifications", blurb: "Bright happy bells", src: "/sounds/notify-happy-bells.mp3" },
  { id: "notify-sci-confirm", name: "Sci Confirm", category: "notifications", blurb: "Sci-fi confirmation", src: "/sounds/notify-sci-confirm.mp3" },
  { id: "notify-positive", name: "Positive", category: "notifications", blurb: "Upbeat positive ping", src: "/sounds/notify-positive.mp3" },
  { id: "notify-gaming-lock", name: "Lock", category: "notifications", blurb: "Gaming lock click", src: "/sounds/notify-gaming-lock.mp3" },
  { id: "notify-confirm", name: "Confirm", category: "notifications", blurb: "Clean confirmation tone", src: "/sounds/notify-confirm.mp3" },
  { id: "notify-bubble", name: "Bubble Pop", category: "notifications", blurb: "Bubble pop-up alert", src: "/sounds/notify-bubble.mp3" },
  { id: "notify-option", name: "Option Select", category: "notifications", blurb: "Option select tap", src: "/sounds/notify-option.mp3" },
  { id: "notify-clear", name: "Clear Announce", category: "notifications", blurb: "Clear announce tones", src: "/sounds/notify-clear.mp3" },
  { id: "notify-dry-pop", name: "Dry Pop", category: "notifications", blurb: "Dry pop-up alert", src: "/sounds/notify-dry-pop.mp3" },
  { id: "notify-elevator", name: "Elevator", category: "notifications", blurb: "Elevator tone", src: "/sounds/notify-elevator.mp3" },
  { id: "notify-light-btn", name: "Light Button", category: "notifications", blurb: "Light button press", src: "/sounds/notify-light-btn.mp3" },
  { id: "notify-digital", name: "Digital Quick", category: "notifications", blurb: "Quick digital tone", src: "/sounds/notify-digital.mp3" },
  { id: "notify-tile", name: "Tile Reveal", category: "notifications", blurb: "Tile game reveal", src: "/sounds/notify-tile.mp3" },
  { id: "notify-doorbell", name: "Doorbell", category: "notifications", blurb: "Single doorbell press", src: "/sounds/notify-doorbell.mp3" },
  { id: "notify-hint", name: "Hint", category: "notifications", blurb: "Interface hint cue", src: "/sounds/notify-hint.mp3" },
  { id: "notify-atm", name: "Key Press", category: "notifications", blurb: "Key press click", src: "/sounds/notify-atm.mp3" },
  { id: "notify-reward", name: "Reward", category: "notifications", blurb: "Correct reward chime", src: "/sounds/notify-reward.mp3" },

  // Ringtones
  { id: "ring-urgent-loop", name: "Urgent Loop", category: "ringtone", blurb: "Urgent simple tone loop", src: "/sounds/ring-urgent-loop.mp3" },
  { id: "ring-magic", name: "Magic Ring", category: "ringtone", blurb: "Magic notification ring", src: "/sounds/ring-magic.mp3" },
  { id: "ring-wave-alarm", name: "Wave Alarm", category: "ringtone", blurb: "Game wave alarm", src: "/sounds/ring-wave-alarm.mp3" },
  { id: "ring-classic-alarm", name: "Classic Alarm", category: "ringtone", blurb: "Classic alarm tone", src: "/sounds/ring-classic-alarm.mp3" },
  { id: "ring-facility", name: "Facility Alarm", category: "ringtone", blurb: "Facility alarm sound", src: "/sounds/ring-facility.mp3" },
  { id: "ring-security", name: "Security", category: "ringtone", blurb: "Security alarm", src: "/sounds/ring-security.mp3" },
  { id: "ring-buzzer", name: "Warning Buzzer", category: "ringtone", blurb: "Warning alarm buzzer", src: "/sounds/ring-buzzer.mp3" },
  { id: "ring-ringtone-a", name: "Phone Ring A", category: "ringtone", blurb: "Phone ringtone A", src: "/sounds/ring-ringtone-a.mp3" },
  { id: "ring-ringtone-b", name: "Phone Ring B", category: "ringtone", blurb: "Phone ringtone B", src: "/sounds/ring-ringtone-b.mp3" },
  { id: "ring-ringtone-c", name: "Phone Ring C", category: "ringtone", blurb: "Phone ringtone C", src: "/sounds/ring-ringtone-c.mp3" },
  { id: "ring-ringtone-d", name: "Phone Ring D", category: "ringtone", blurb: "Phone ringtone D", src: "/sounds/ring-ringtone-d.mp3" },
  { id: "ring-ringtone-e", name: "Phone Ring E", category: "ringtone", blurb: "Phone ringtone E", src: "/sounds/ring-ringtone-e.mp3" },
  { id: "ring-alert-bells", name: "Alert Bells", category: "ringtone", blurb: "Alert bells ring", src: "/sounds/ring-alert-bells.mp3" },
  { id: "ring-siren", name: "Siren", category: "ringtone", blurb: "Siren-style alarm", src: "/sounds/ring-siren.mp3" },
  { id: "ring-pulse-alarm", name: "Pulse Alarm", category: "ringtone", blurb: "Pulsing alarm", src: "/sounds/ring-pulse-alarm.mp3" },
  { id: "ring-digital-alarm", name: "Digital Alarm", category: "ringtone", blurb: "Digital alarm beep", src: "/sounds/ring-digital-alarm.mp3" },

  // Enjoy
  { id: "enjoy-flute", name: "Flute Melody", category: "enjoy", blurb: "Melodical flute notification", src: "/sounds/enjoy-flute.mp3" },
  { id: "enjoy-marimba", name: "Magic Marimba", category: "enjoy", blurb: "Playful magic marimba", src: "/sounds/enjoy-marimba.mp3" },
  { id: "enjoy-harp", name: "Mystery Harp", category: "enjoy", blurb: "Arabian mystery harp", src: "/sounds/enjoy-harp.mp3" },
  { id: "enjoy-uplift-flute", name: "Uplifting Flute", category: "enjoy", blurb: "Uplifting flute tone", src: "/sounds/enjoy-uplift-flute.mp3" },
  { id: "enjoy-guitar", name: "Guitar Alert", category: "enjoy", blurb: "Guitar notification", src: "/sounds/enjoy-guitar.mp3" },
  { id: "enjoy-doorbell-tone", name: "Doorbell Tone", category: "enjoy", blurb: "Warm doorbell tone", src: "/sounds/enjoy-doorbell-tone.mp3" },
  { id: "enjoy-achievement", name: "Achievement Bell", category: "enjoy", blurb: "Achievement bell", src: "/sounds/enjoy-achievement.mp3" },
  { id: "enjoy-arcade", name: "Arcade Bonus", category: "enjoy", blurb: "Arcade bonus alert", src: "/sounds/enjoy-arcade.mp3" },
  { id: "enjoy-unlock", name: "Unlock", category: "enjoy", blurb: "Game unlock cue", src: "/sounds/enjoy-unlock.mp3" },
  { id: "enjoy-bell-soft", name: "Soft Bell", category: "enjoy", blurb: "Soft bell chime", src: "/sounds/enjoy-bell-soft.mp3" },
  { id: "enjoy-bell-bright", name: "Bright Bell", category: "enjoy", blurb: "Bright bell ring", src: "/sounds/enjoy-bell-bright.mp3" },
  { id: "enjoy-chime-a", name: "Chime A", category: "enjoy", blurb: "Light chime", src: "/sounds/enjoy-chime-a.mp3" },
  { id: "enjoy-chime-b", name: "Chime B", category: "enjoy", blurb: "Gentle chime", src: "/sounds/enjoy-chime-b.mp3" },
  { id: "enjoy-sparkle-bell", name: "Sparkle Bell", category: "enjoy", blurb: "Sparkling bell", src: "/sounds/enjoy-sparkle-bell.mp3" },
  { id: "enjoy-bell-deep", name: "Deep Bell", category: "enjoy", blurb: "Deep bell tone", src: "/sounds/enjoy-bell-deep.mp3" },
  { id: "enjoy-bell-clear", name: "Clear Bell", category: "enjoy", blurb: "Clear bell ding", src: "/sounds/enjoy-bell-clear.mp3" },
];

/** Map older OS/synth catalog ids to the Mixkit library. */
const LEGACY_SOUND_IDS: Record<string, string> = {
  "notify-default": "notify-correct",
  "notify-nudge": "notify-message-pop",
  "notify-ding": "notify-bell",
  "notify-info": "notify-hint",
  "notify-proximity": "notify-positive",
  "ring-classic": "ring-classic-alarm",
  "ring-pulse": "ring-pulse-alarm",
  "ring-alarm": "ring-classic-alarm",
  "ring-echo": "ring-magic",
  "ring-urgent": "ring-urgent-loop",
  "enjoy-chimes": "enjoy-chime-a",
  "enjoy-tada": "enjoy-achievement",
  "enjoy-chord": "enjoy-guitar",
  "enjoy-recycle": "enjoy-bell-soft",
  "enjoy-calm": "enjoy-flute",
};

export const DEFAULT_LIBRARY_SOUND_ID = "notify-correct";
export const DEFAULT_RINGTONE_SOUND_ID = "ring-classic-alarm";

export function getCatalogSound(id: string | undefined | null): CatalogSound | undefined {
  if (!id) return undefined;
  const resolved = LEGACY_SOUND_IDS[id] ?? id;
  return SOUND_CATALOG.find((s) => s.id === resolved);
}

export function soundsByCategory(category: SoundCategory): CatalogSound[] {
  return SOUND_CATALOG.filter((s) => s.category === category);
}

/** Resolve preset/ringtone mode to a catalog id with the correct default per mode. */
export function resolvePresetId(
  mode: NotificationSoundMode | undefined,
  soundId: string | undefined
): string | undefined {
  if (mode === "preset") {
    return getCatalogSound(soundId)?.id || DEFAULT_LIBRARY_SOUND_ID;
  }
  if (mode === "ringtone") {
    return getCatalogSound(soundId)?.id || DEFAULT_RINGTONE_SOUND_ID;
  }
  return soundId;
}

/** Used by Normal mode on Windows (OS default notify). */
export function windowsMediaPath(fileName: string): string {
  return `C:\\Windows\\Media\\${fileName}`;
}

export function macSystemSoundPath(name: string): string {
  return `/System/Library/Sounds/${name}.aiff`;
}
