import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE = /^BK-[A-Z0-9]{10}$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function assertLocalSupabaseUrl(value) {
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required in .env.local.");
  const url = new URL(value);
  if (url.protocol !== "http:" || !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing to reset a booking outside local Supabase: ${url.origin}`);
  }
  return url;
}

export function parseBookingTarget(value) {
  const target = String(value ?? "").trim();
  if (UUID.test(target)) return { kind: "id", value: target.toLowerCase() };
  if (REFERENCE.test(target)) return { kind: "reference", value: target };
  throw new Error("Pass one explicit booking UUID or reference such as BK-ABC1234567.");
}

function targetPredicate(target) {
  return target.kind === "id"
    ? `bookings.id = '${target.value}'::uuid`
    : `bookings.reference = '${target.value}'`;
}

export function buildResetSql(target) {
  const predicate = targetPredicate(target);
  return `
begin;
set local lock_timeout = '5s';
lock table public.bookings in access exclusive mode;

create temporary table local_booking_reset_target on commit drop as
select bookings.id, bookings.reference, bookings.status,
  bookings.actual_check_in_at, bookings.actual_check_out_at
from public.bookings bookings
where ${predicate};

do $local_reset$
declare target_record record;
begin
  if (select count(*) from local_booking_reset_target) <> 1 then
    raise exception 'The explicit local booking target was not found.';
  end if;
  select * into target_record from local_booking_reset_target;
  if target_record.status <> 'checked_in' then
    raise exception 'Local reset requires a checked_in booking; current status is %.', target_record.status;
  end if;
  if target_record.actual_check_in_at is null or target_record.actual_check_out_at is not null then
    raise exception 'The local booking has inconsistent check-in timestamps.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.bookings'::regclass
      and tgname = 'bookings_enforce_operational_transition'
      and tgenabled = 'O'
  ) then
    raise exception 'The production operational-transition trigger is not enabled.';
  end if;
end
$local_reset$;

alter table public.bookings disable trigger bookings_enforce_operational_transition;

update public.bookings bookings
set status = 'confirmed',
    actual_check_in_at = null,
    actual_check_out_at = null,
    check_in_without_assignment = false,
    check_in_assignment_exception_by = null
where bookings.id = (select id from local_booking_reset_target);

alter table public.bookings enable trigger bookings_enforce_operational_transition;

select json_build_object(
  'reference', target.reference,
  'booking_id', target.id,
  'status', 'confirmed',
  'cleared_local_check_in_at', target.actual_check_in_at
)::text
from local_booking_reset_target target;

commit;
`;
}

function projectId() {
  const configUrl = new URL("../supabase/config.toml", import.meta.url);
  const config = readFileSync(configUrl, "utf8");
  const match = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m.exec(config);
  if (!match) throw new Error("supabase/config.toml has no safe project_id.");
  return match[1];
}

function runPsql(sql) {
  const container = `supabase_db_${projectId()}`;
  const running = execFileSync(
    "docker",
    ["inspect", "--format", "{{.State.Running}}", container],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  if (running !== "true") throw new Error(`Local Supabase database container is not running: ${container}`);

  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function listCheckedIn() {
  return runPsql(`
    select reference || ' | ' || id::text || ' | checked in ' || actual_check_in_at::text
    from public.bookings
    where status = 'checked_in'
    order by actual_check_in_at desc;
  `);
}

function main() {
  assertLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
  const argument = process.argv[2];
  if (argument === "--list") {
    const rows = listCheckedIn();
    console.log(rows || "No local checked-in bookings.");
    return;
  }

  const target = parseBookingTarget(argument);
  const result = runPsql(buildResetSql(target));
  console.log(`Local test booking reset: ${result}`);
  console.log("Production migrations and status-transition triggers were not changed.");
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === fileURLToPath(new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`)).toLowerCase();

if (isMain) {
  try {
    main();
  } catch (error) {
    const detail = error?.stderr?.toString().trim();
    console.error(detail || (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
