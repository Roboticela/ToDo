/**
 * Print the Android debug keystore SHA-1 for Google Cloud Console OAuth setup.
 * Usage: node scripts/print-android-sha1.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const keystore = path.join(os.homedir(), ".android", "debug.keystore");
const keytoolCandidates = [
  process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "keytool") : null,
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "jbr", "bin", "keytool"),
  "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe",
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool",
  "keytool",
].filter(Boolean);

function findKeytool() {
  for (const candidate of keytoolCandidates) {
    if (!candidate) continue;
    if (candidate === "keytool" || fs.existsSync(candidate)) return candidate;
  }
  return null;
}

if (!fs.existsSync(keystore)) {
  console.error(`Debug keystore not found at: ${keystore}`);
  console.error("Run an Android build/emulator once, then retry.");
  process.exit(1);
}

const keytool = findKeytool();
if (!keytool) {
  console.error("keytool not found. Install Android Studio or set JAVA_HOME.");
  process.exit(1);
}

const result = spawnSync(
  keytool,
  ["-list", "-v", "-keystore", keystore, "-alias", "androiddebugkey", "-storepass", "android"],
  { encoding: "utf8" }
);

const out = `${result.stdout || ""}\n${result.stderr || ""}`;
const sha1 = out.match(/SHA1:\s*([0-9A-Fa-f:]+)/)?.[1];
const sha256 = out.match(/SHA256:\s*([0-9A-Fa-f:]+)/)?.[1];

console.log("");
console.log("Android debug signing fingerprints for Google Cloud Console");
console.log("Package name: com.roboticela.todo");
console.log(`Keystore:     ${keystore}`);
if (sha1) console.log(`SHA-1:        ${sha1}`);
if (sha256) console.log(`SHA-256:      ${sha256}`);
if (!sha1) {
  console.error("Could not parse SHA-1 from keytool output:");
  console.error(out);
  process.exit(1);
}
console.log("");
console.log("Create an Android OAuth client with this package + SHA-1,");
console.log("and keep using the Web client ID as VITE_GOOGLE_CLIENT_ID.");
console.log("");
