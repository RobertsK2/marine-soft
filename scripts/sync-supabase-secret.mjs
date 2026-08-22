import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const supabaseCli = fileURLToPath(
  new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
);

function readEnvValue(source, name) {
  const match = source.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) return null;

  const value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

const envSource = await readFile(envPath, "utf8");
const supabaseUrl = readEnvValue(envSource, "NEXT_PUBLIC_SUPABASE_URL");

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.");
}

const hostname = new URL(supabaseUrl).hostname;
const localHosts = new Set(["127.0.0.1", "localhost"]);

if (!localHosts.has(hostname)) {
  throw new Error(
    "Refusing to sync a server key because NEXT_PUBLIC_SUPABASE_URL is not local.",
  );
}

const cliOptions = {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
};

const status = JSON.parse(
  execFileSync(
    process.execPath,
    [supabaseCli, "status", "--output", "json"],
    cliOptions,
  ),
);
const configuredOrigin = new URL(supabaseUrl).origin;
const runningOrigin = status.API_URL ? new URL(status.API_URL).origin : null;

if (configuredOrigin !== runningOrigin) {
  throw new Error(
    `The running local Supabase origin (${runningOrigin ?? "missing"}) does not match .env.local (${configuredOrigin}).`,
  );
}

const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;

if (!secretKey) {
  throw new Error("Supabase did not return a server secret key.");
}

const newline = envSource.includes("\r\n") ? "\r\n" : "\n";
const secretLine = `SUPABASE_SECRET_KEY=${secretKey}`;
const nextEnvSource = /^SUPABASE_SECRET_KEY=.*$/m.test(envSource)
  ? envSource.replace(/^SUPABASE_SECRET_KEY=.*$/m, secretLine)
  : `${envSource.trimEnd()}${newline}${secretLine}${newline}`;

await writeFile(envPath, nextEnvSource, "utf8");
console.log("Updated SUPABASE_SECRET_KEY in .env.local. Restart Next.js to load it.");
