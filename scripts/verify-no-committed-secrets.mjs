import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tracked = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
    encoding: "utf8",
    shell: false,
  },
);
if (tracked.status !== 0) {
  throw new Error(tracked.stderr.trim() || "Unable to enumerate tracked files.");
}

const credentialPatterns = [
  new RegExp(
    `\\b(?:${["s", "k"].join("")}|${["r", "k"].join("")})_(?:live|test)_[A-Za-z0-9]{16,}\\b`,
    "g",
  ),
  new RegExp(`\\b${["wh", "sec"].join("")}_[A-Za-z0-9_-]{16,}\\b`, "g"),
  new RegExp(`\\b${["sb", "secret"].join("_")}_[A-Za-z0-9_-]{16,}\\b`, "g"),
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];
const allowedPlaceholder =
  /replace_for_each_environment|replace_with_|_unit_test\b|\.\.\./i;
const findings = [];

for (const path of tracked.stdout.split("\0").filter(Boolean)) {
  const content = readFileSync(path);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const pattern of credentialPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (!allowedPlaceholder.test(match[0])) findings.push(`${path}:${text.slice(0, match.index).split("\n").length}`);
    }
  }
}

if (findings.length) {
  console.error("Potential committed credential material detected at:");
  for (const location of findings) console.error(`- ${location}`);
  process.exitCode = 1;
} else {
  console.log("PASS: no Stripe, Supabase, or private-key credential material found in tracked files.");
}
