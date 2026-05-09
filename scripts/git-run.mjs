/**
 * Run git with inherited stdio so Windows PowerShell/Cursor shells don't
 * mis-report stderr progress lines as terminating errors.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/git-run.mjs <git arguments...>");
  process.exit(1);
}

const win = process.platform === "win32";
const r = spawnSync("git", args, {
  stdio: "inherit",
  shell: win,
  windowsHide: true,
});
process.exit(r.status ?? 1);
