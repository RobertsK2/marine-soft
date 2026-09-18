import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!["hold", "assignment", "e2e"].includes(mode)) throw new Error("Expected hold, assignment or e2e.");
const root = fileURLToPath(new URL("../", import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), "berthio-integration-"));
const project = `berthio-integration-${randomUUID().slice(0, 8)}`;
const target = join(workdir, "supabase");
mkdirSync(target);
for (const name of ["migrations", "tests", "templates", "seed.sql", "pilot-seed.sql"]) {
  cpSync(join(root, "supabase", name), join(target, name), { recursive: true });
}
const config = readFileSync(join(root, "supabase/config.toml"), "utf8")
  .replace(/^project_id = .*$/m, `project_id = "${project}"`)
  .replace(/\b5432(\d)\b/g, "5732$1")
  // This suite authenticates many users in seconds. Production policy stays intact.
  .replace(/^(sign_in_sign_ups|token_verifications|email_sent) = \d+$/gm, "$1 = 1000");
writeFileSync(join(target, "config.toml"), config);
const env = { ...process.env, SUPABASE_WORKDIR: workdir };
// Prevent Next's .env.local fallback from introducing developer/provider secrets.
for (const match of readFileSync(join(root, ".env.example"), "utf8").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) {
  env[match[1]] = "";
}
for (const key of Object.keys(env)) {
  if (/^(E2E_|SUPABASE_ACCESS_TOKEN$|SUPABASE_DB_URL$|SENTRY_AUTH_TOKEN$)/.test(key)) delete env[key];
}
env.SUPABASE_ACCESS_TOKEN = "";
env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
env.BERTHIO_LOCAL_TEST_PASSWORD = randomBytes(24).toString("hex");
env.E2E_MARINA_PASSWORD = env.BERTHIO_LOCAL_TEST_PASSWORD;
env.E2E_MARINA_EMAIL = "admin-a@berthio.test";
env.E2E_MARINA_STAFF_EMAIL = "staff-a@berthio.test";
env.E2E_RECOVERY_EMAIL = "recovery@berthio.test";
env.E2E_RECOVERY_PASSWORD = randomBytes(24).toString("hex");
env.GUEST_ACCESS_SIGNING_SECRET = randomBytes(32).toString("hex");
env.NOTIFICATION_WORKER_SECRET = randomBytes(32).toString("hex");
env.E2E_MAILPIT_URL = "http://127.0.0.1:57324";
env.E2E_SUPABASE_READY = "1";
env.BERTHIO_REQUIRE_ADMIN_MFA = "true";
env.E2E_PRODUCTION = process.env.E2E_PRODUCTION === "1" ? "1" : "0";
env.BERTHIO_ISOLATED_TESTS = "1";
env.NEXT_TELEMETRY_DISABLED = "1";
const cli = join(root, "node_modules/supabase/dist/supabase.js");
function run(file, args = [], capture = false) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root, env, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) {
      const diagnostic = result.stderr
        .replace(/\b(?:sb_secret_|(?:sk|rk)_(?:test|live)_|whsec_)[A-Za-z0-9_-]+/g, "[redacted]")
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted JWT]");
      console.error(diagnostic);
    }
    throw new Error(`${file.split(/[\\/]/).at(-1)} ${args[0] ?? ""} failed (${result.status}).`);
  }
  return result.stdout;
}
function supabase(args, capture = false) {
  return run(cli, [...args, "--workdir", workdir], capture);
}
let failed = false;
try {
  console.log(`Integration fixture: ${project}, local API port 57321`);
  // Capture status output: CLI startup includes local keys, which must not enter logs.
  supabase(["start", "--exclude", "studio,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor"], true);
  const status = JSON.parse(supabase(["status", "-o", "json"], true));
  if (status.API_URL !== "http://127.0.0.1:57321") throw new Error("Unexpected test API target.");
  env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  env.SUPABASE_SECRET_KEY = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error("Local credentials unavailable.");
  if (process.env.GITHUB_ACTIONS) {
    for (const value of [env.SUPABASE_SECRET_KEY, env.BERTHIO_LOCAL_TEST_PASSWORD, env.E2E_RECOVERY_PASSWORD]) console.log(`::add-mask::${value}`);
  }
  run(join(root, "scripts/setup-local-test-users.mjs"));
  if (mode === "e2e") {
    if (process.env.E2E_PRODUCTION === "1") {
      run(join(root, "node_modules/next/dist/bin/next"), ["build"]);
    }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(status.API_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const recovery = await client.auth.admin.createUser({ email: env.E2E_RECOVERY_EMAIL, password: env.E2E_RECOVERY_PASSWORD, email_confirm: true });
    if (recovery.error) throw recovery.error;
    const membership = await client.from("organization_members").insert({
      organization_id: "e0000000-0000-4000-8000-000000000002",
      user_id: recovery.data.user.id, role: "marina_admin", status: "active",
    });
    if (membership.error) throw membership.error;
    run(join(root, "node_modules/@playwright/test/cli.js"), ["test", ...process.argv.slice(3)]);
  } else {
    run(join(root, `scripts/test-${mode === "hold" ? "booking-hold" : "berth-assignment"}-concurrency.mjs`));
  }
} catch (error) {
  failed = true;
  console.error(error.message);
  // Retain actionable auth timing/status evidence before removing our fixture.
  // Never print raw logs: they can contain tokens, emails or request bodies.
  const authLog = spawnSync("docker", ["logs", "--tail", "100", `supabase_auth_${project}`], { encoding: "utf8" });
  for (const line of `${authLog.stdout ?? ""}\n${authLog.stderr ?? ""}`.split("\n")) {
    try {
      const entry = JSON.parse(line);
      if (["/token", "/recover", "/verify", "/user", "/logout"].includes(entry.path) && Number.isFinite(entry.status)) {
        console.error(JSON.stringify({ service: "local-auth", path: entry.path, status: entry.status, duration: entry.duration, time: entry.time }));
      }
    } catch { /* Ignore non-JSON diagnostics rather than exposing raw logs. */ }
  }
} finally {
  try {
    supabase(["stop", "--project-id", project, "--no-backup"]);
  } catch (error) {
    failed = true;
    console.error(`Isolated fixture cleanup failed: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
