#!/usr/bin/env node
/**
 * Runs the Vitest suite against the real Firebase Emulator Suite
 * (Firestore + Auth), so rules-vs-code invariants are genuinely provable.
 *
 * The Firestore emulator requires Java 21+. If the system `java` is older
 * (or missing), this falls back to the portable JDK at .tools/jdk-*
 * (downloaded once via the repo's own tooling — see docs/prd for context),
 * without touching the system Java install.
 */
import { spawnSync, execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function systemJavaIsModernEnough() {
  try {
    const out = execSync("java -version 2>&1").toString();
    const match = out.match(/version "(\d+)/);
    return match ? Number(match[1]) >= 21 : false;
  } catch {
    return false;
  }
}

let env = { ...process.env };

// Ensure the Firestore emulator JVM has enough heap — the default (~256 MB)
// is too small for the full test suite, causing RESOURCE_EXHAUSTED failures.
env.JAVA_TOOL_OPTIONS = "-Xmx2048m -Xms512m";

if (!systemJavaIsModernEnough()) {
  const toolsDir = path.join(repoRoot, ".tools");
  const jdkDir = existsSync(toolsDir)
    ? readdirSync(toolsDir).find((d) => d.startsWith("jdk-"))
    : null;

  if (jdkDir) {
    const javaHome = path.join(toolsDir, jdkDir);
    env.JAVA_HOME = javaHome;
    env.PATH = `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH}`;
    console.log(`[run-emulator-tests] Using portable JDK at ${javaHome} (system Java is <21)`);
  } else {
    console.error(
      "[run-emulator-tests] Firestore emulator needs Java 21+, and none was found " +
        "(system java is older, and no .tools/jdk-* portable JDK exists). " +
        "Download one from https://adoptium.net or run the setup again."
    );
    process.exit(1);
  }
}

const extraArgs = process.argv.slice(2).join(" ");
const command =
  `npx firebase emulators:exec --project demo-chronix-test --only firestore,auth "npx vitest run ${extraArgs}"`;
const result = spawnSync(command, { cwd: repoRoot, env, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
