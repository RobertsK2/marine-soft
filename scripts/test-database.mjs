import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Each invocation owns a new local database. Never reset the developer project,
// accept a remote URL, or reuse an externally supplied Supabase workdir.
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "node_modules/supabase/dist/supabase.js");
const workdir = mkdtempSync(join(tmpdir(), "berthio-db-test-"));
const project = `berthio-db-test-${randomUUID().slice(0, 8)}`;
const target = join(workdir, "supabase");
mkdirSync(target);
for (const name of ["migrations", "tests", "templates", "seed.sql", "pilot-seed.sql"]) {
  cpSync(join(root, "supabase", name), join(target, name), { recursive: true });
}
const config = readFileSync(join(root, "supabase/config.toml"), "utf8")
  .replace(/^project_id = .*$/m, `project_id = "${project}"`)
  .replace(/^port = 54322$/m, "port = 56322")
  .replace(/^shadow_port = 54320$/m, "shadow_port = 56320");
writeFileSync(join(target, "config.toml"), config);
const env = { ...process.env, SUPABASE_WORKDIR: workdir };
delete env.SUPABASE_DB_URL;
delete env.SUPABASE_ACCESS_TOKEN;
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args, "--workdir", workdir], {
    cwd: root, env, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`supabase ${args.join(" ")} failed (${result.status}).`);
}

let failed = false;
try {
  console.log(`Isolated database: ${project} on local port 56322`);
  run(["db", "start"]);
  run(["db", "lint", "--local", "--schema", "public,private", "--fail-on", "error"]);
  run(["db", "advisors", "--local", "--type", "security", "--fail-on", "error"]);
  // Consecutive runs prove transactions do not leak state between DB suites.
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`Database verification ${attempt}/3 (no reset between runs)`);
    run(["test", "db"]);
  }
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  // Only remove volumes belonging to the freshly generated project. Leave the
  // temporary source copy for diagnostics; it contains no environment secrets.
  try {
    if (realpathSync(workdir) !== resolve(workdir) || !project.startsWith("berthio-db-test-")) {
      throw new Error("Refusing cleanup: isolated project identity mismatch.");
    }
    run(["stop", "--project-id", project, "--no-backup"]);
  } catch (error) {
    failed = true;
    console.error(`Database cleanup failed: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
