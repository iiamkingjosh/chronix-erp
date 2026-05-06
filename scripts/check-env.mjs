/**
 * Validates env vars used by src/. Loads `.env.local` then `.env` into process.env
 * when Node hasn't inherited them (e.g. raw `node scripts/check-env.mjs`).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const REQUIRED_NEXT_PUBLIC = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

function parseDotEnv(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    parseDotEnv(fs.readFileSync(p, "utf8"));
  }
}

function nonEmpty(v) {
  return typeof v === "string" && v.trim().length > 0;
}

loadEnvFiles();

const missing = REQUIRED_NEXT_PUBLIC.filter((k) => !nonEmpty(process.env[k]));

if (missing.length) {
  console.error("[check-env] Missing or empty required variables:");
  for (const k of missing) console.error(`  - ${k}`);
  console.error("\nCopy .env.example to .env.local and add Firebase Web config.");
  process.exit(1);
}

const adminKeys = ["FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY"];
const adminPresent = adminKeys.filter((k) => nonEmpty(process.env[k]));
if (adminPresent.length > 0 && adminPresent.length < adminKeys.length) {
  console.warn("[check-env] Partial FIREBASE_ADMIN_* set — Admin SDK may fall back to ADC or fail:");
  for (const k of adminKeys) {
    console.warn(`  ${nonEmpty(process.env[k]) ? "✓" : "✗"} ${k}`);
  }
}

console.log("[check-env] Required NEXT_PUBLIC_FIREBASE_* present.");
