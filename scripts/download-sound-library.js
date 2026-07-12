/**
 * Download free Mixkit SFX (Mixkit License — free for commercial use, no attribution required)
 * into public/sounds for the Roboticela notification library.
 *
 * Run: node scripts/download-sound-library.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "sounds");

/** @type {{ id: string, mixkitId: number, name: string, category: string, blurb: string }[]} */
export const DOWNLOAD_MANIFEST = [
  // Notifications
  { id: "notify-correct", mixkitId: 2870, name: "Correct Tone", category: "notifications", blurb: "Short correct-answer chime" },
  { id: "notify-long-pop", mixkitId: 2358, name: "Long Pop", category: "notifications", blurb: "Playful long pop" },
  { id: "notify-bell", mixkitId: 933, name: "Bell", category: "notifications", blurb: "Classic bell notification" },
  { id: "notify-sci-click", mixkitId: 900, name: "Sci-Fi Click", category: "notifications", blurb: "Futuristic click" },
  { id: "notify-message-pop", mixkitId: 2354, name: "Message Pop", category: "notifications", blurb: "Message pop alert" },
  { id: "notify-ui-start", mixkitId: 2574, name: "UI Start", category: "notifications", blurb: "Interface start cue" },
  { id: "notify-ui-back", mixkitId: 2575, name: "UI Back", category: "notifications", blurb: "Interface back cue" },
  { id: "notify-happy-bells", mixkitId: 937, name: "Happy Bells", category: "notifications", blurb: "Bright happy bells" },
  { id: "notify-sci-confirm", mixkitId: 914, name: "Sci Confirm", category: "notifications", blurb: "Sci-fi confirmation" },
  { id: "notify-positive", mixkitId: 951, name: "Positive", category: "notifications", blurb: "Upbeat positive ping" },
  { id: "notify-gaming-lock", mixkitId: 2580, name: "Lock", category: "notifications", blurb: "Gaming lock click" },
  { id: "notify-confirm", mixkitId: 2867, name: "Confirm", category: "notifications", blurb: "Clean confirmation tone" },
  { id: "notify-bubble", mixkitId: 2356, name: "Bubble Pop", category: "notifications", blurb: "Bubble pop-up alert" },
  { id: "notify-option", mixkitId: 2573, name: "Option Select", category: "notifications", blurb: "Option select tap" },
  { id: "notify-clear", mixkitId: 2861, name: "Clear Announce", category: "notifications", blurb: "Clear announce tones" },
  { id: "notify-dry-pop", mixkitId: 2357, name: "Dry Pop", category: "notifications", blurb: "Dry pop-up alert" },
  { id: "notify-elevator", mixkitId: 2863, name: "Elevator", category: "notifications", blurb: "Elevator tone" },
  { id: "notify-light-btn", mixkitId: 2864, name: "Light Button", category: "notifications", blurb: "Light button press" },
  { id: "notify-digital", mixkitId: 2866, name: "Digital Quick", category: "notifications", blurb: "Quick digital tone" },
  { id: "notify-tile", mixkitId: 960, name: "Tile Reveal", category: "notifications", blurb: "Tile game reveal" },
  { id: "notify-doorbell", mixkitId: 333, name: "Doorbell", category: "notifications", blurb: "Single doorbell press" },
  { id: "notify-hint", mixkitId: 911, name: "Hint", category: "notifications", blurb: "Interface hint cue" },
  { id: "notify-atm", mixkitId: 2869, name: "Key Press", category: "notifications", blurb: "Key press click" },
  { id: "notify-reward", mixkitId: 952, name: "Reward", category: "notifications", blurb: "Correct reward chime" },

  // Ringtones / alarms
  { id: "ring-urgent-loop", mixkitId: 987, name: "Urgent Loop", category: "ringtone", blurb: "Urgent simple tone loop" },
  { id: "ring-magic", mixkitId: 2344, name: "Magic Ring", category: "ringtone", blurb: "Magic notification ring" },
  { id: "ring-wave-alarm", mixkitId: 2489, name: "Wave Alarm", category: "ringtone", blurb: "Game wave alarm" },
  { id: "ring-classic-alarm", mixkitId: 995, name: "Classic Alarm", category: "ringtone", blurb: "Classic alarm tone" },
  { id: "ring-facility", mixkitId: 999, name: "Facility Alarm", category: "ringtone", blurb: "Facility alarm sound" },
  { id: "ring-security", mixkitId: 996, name: "Security", category: "ringtone", blurb: "Security alarm" },
  { id: "ring-buzzer", mixkitId: 991, name: "Warning Buzzer", category: "ringtone", blurb: "Warning alarm buzzer" },
  { id: "ring-ringtone-a", mixkitId: 1354, name: "Phone Ring A", category: "ringtone", blurb: "Phone ringtone A" },
  { id: "ring-ringtone-b", mixkitId: 1356, name: "Phone Ring B", category: "ringtone", blurb: "Phone ringtone B" },
  { id: "ring-ringtone-c", mixkitId: 1359, name: "Phone Ring C", category: "ringtone", blurb: "Phone ringtone C" },
  { id: "ring-ringtone-d", mixkitId: 1360, name: "Phone Ring D", category: "ringtone", blurb: "Phone ringtone D" },
  { id: "ring-ringtone-e", mixkitId: 1361, name: "Phone Ring E", category: "ringtone", blurb: "Phone ringtone E" },
  { id: "ring-alert-bells", mixkitId: 1000, name: "Alert Bells", category: "ringtone", blurb: "Alert bells ring" },
  { id: "ring-siren", mixkitId: 1003, name: "Siren", category: "ringtone", blurb: "Siren-style alarm" },
  { id: "ring-pulse-alarm", mixkitId: 990, name: "Pulse Alarm", category: "ringtone", blurb: "Pulsing alarm" },
  { id: "ring-digital-alarm", mixkitId: 994, name: "Digital Alarm", category: "ringtone", blurb: "Digital alarm beep" },

  // Enjoy
  { id: "enjoy-flute", mixkitId: 2841, name: "Flute Melody", category: "enjoy", blurb: "Melodical flute notification" },
  { id: "enjoy-marimba", mixkitId: 2820, name: "Magic Marimba", category: "enjoy", blurb: "Playful magic marimba" },
  { id: "enjoy-harp", mixkitId: 2848, name: "Mystery Harp", category: "enjoy", blurb: "Arabian mystery harp" },
  { id: "enjoy-uplift-flute", mixkitId: 2976, name: "Uplifting Flute", category: "enjoy", blurb: "Uplifting flute tone" },
  { id: "enjoy-guitar", mixkitId: 2974, name: "Guitar Alert", category: "enjoy", blurb: "Guitar notification" },
  { id: "enjoy-doorbell-tone", mixkitId: 2310, name: "Doorbell Tone", category: "enjoy", blurb: "Warm doorbell tone" },
  { id: "enjoy-achievement", mixkitId: 600, name: "Achievement Bell", category: "enjoy", blurb: "Achievement bell" },
  { id: "enjoy-arcade", mixkitId: 767, name: "Arcade Bonus", category: "enjoy", blurb: "Arcade bonus alert" },
  { id: "enjoy-unlock", mixkitId: 254, name: "Unlock", category: "enjoy", blurb: "Game unlock cue" },
  { id: "enjoy-bell-soft", mixkitId: 586, name: "Soft Bell", category: "enjoy", blurb: "Soft bell chime" },
  { id: "enjoy-bell-bright", mixkitId: 590, name: "Bright Bell", category: "enjoy", blurb: "Bright bell ring" },
  { id: "enjoy-chime-a", mixkitId: 595, name: "Chime A", category: "enjoy", blurb: "Light chime" },
  { id: "enjoy-chime-b", mixkitId: 598, name: "Chime B", category: "enjoy", blurb: "Gentle chime" },
  { id: "enjoy-sparkle-bell", mixkitId: 601, name: "Sparkle Bell", category: "enjoy", blurb: "Sparkling bell" },
  { id: "enjoy-bell-deep", mixkitId: 603, name: "Deep Bell", category: "enjoy", blurb: "Deep bell tone" },
  { id: "enjoy-bell-clear", mixkitId: 619, name: "Clear Bell", category: "enjoy", blurb: "Clear bell ding" },
];

function urlFor(mixkitId) {
  return `https://assets.mixkit.co/active_storage/sfx/${mixkitId}/${mixkitId}-preview.mp3`;
}

async function downloadOne(entry) {
  const url = urlFor(entry.mixkitId);
  const dest = path.join(OUT, `${entry.id}.mp3`);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "RoboticelaToDo/1.0 (sound library fetch)",
      Accept: "audio/mpeg,audio/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.id} (${url})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error(`Too small: ${entry.id} (${buf.length} bytes)`);
  fs.writeFileSync(dest, buf);
  return dest;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Clear previous generated/owned wavs so only downloaded assets remain
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith(".wav") || f.endsWith(".mp3")) {
      fs.unlinkSync(path.join(OUT, f));
    }
  }

  let ok = 0;
  const failed = [];
  for (const entry of DOWNLOAD_MANIFEST) {
    try {
      process.stdout.write(`↓ ${entry.id} … `);
      await downloadOne(entry);
      console.log("ok");
      ok++;
    } catch (e) {
      console.log("FAIL", e.message);
      failed.push(entry.id);
    }
  }

  const manifestPath = path.join(OUT, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        source: "Mixkit (https://mixkit.co) — Mixkit License",
        downloadedAt: new Date().toISOString(),
        sounds: DOWNLOAD_MANIFEST.filter((e) => !failed.includes(e.id)).map((e) => ({
          ...e,
          src: `/sounds/${e.id}.mp3`,
        })),
      },
      null,
      2
    )
  );

  console.log(`\nDownloaded ${ok}/${DOWNLOAD_MANIFEST.length} → ${OUT}`);
  if (failed.length) console.log("Failed:", failed.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
