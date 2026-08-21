import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const testPassword = process.env.BERTHIO_LOCAL_TEST_PASSWORD;

if (!testPassword || testPassword.length < 12) {
  throw new Error(
    "Set BERTHIO_LOCAL_TEST_PASSWORD to a local-only password of at least 12 characters.",
  );
}

const supabaseCli = fileURLToPath(
  new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
);
const status = JSON.parse(
  execFileSync(process.execPath, [supabaseCli, "status", "-o", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);

const apiUrl = status.API_URL;
const adminKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const localHosts = new Set(["127.0.0.1", "localhost"]);

if (!apiUrl || !adminKey || !publishableKey) {
  throw new Error("The local Supabase status is missing an API URL or API keys.");
}

const parsedApiUrl = new URL(apiUrl);
if (parsedApiUrl.protocol !== "http:" || !localHosts.has(parsedApiUrl.hostname)) {
  throw new Error(`Refusing to manage test users outside local Supabase: ${apiUrl}`);
}

const admin = createClient(apiUrl, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fixtures = [
  {
    email: "admin-a@berthio.test",
    organizationId: "d0000000-0000-4000-8000-000000000001",
    membershipId: "d4000000-0000-4000-8000-000000000001",
    organizationName: "Marina A Organization",
    marinaName: "Marina A",
    role: "marina_admin",
  },
  {
    email: "staff-a@berthio.test",
    organizationId: "d0000000-0000-4000-8000-000000000001",
    membershipId: "d4000000-0000-4000-8000-000000000003",
    organizationName: "Marina A Organization",
    marinaName: "Marina A",
    role: "marina_staff",
  },
  {
    email: "admin-b@berthio.test",
    organizationId: "e0000000-0000-4000-8000-000000000002",
    membershipId: "e4000000-0000-4000-8000-000000000002",
    organizationName: "Marina B Organization",
    marinaName: "Marina B",
    role: "marina_admin",
  },
];

async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 100) return null;
  }
}

async function ensureUser(email) {
  const existing = await findUser(email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: testPassword,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error(`Could not update ${email}.`);
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}.`);
  return data.user;
}

async function ensureMembership(fixture, userId) {
  const { error: deleteError } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", fixture.organizationId)
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  const { error: insertError } = await admin.from("organization_members").insert({
    id: fixture.membershipId,
    organization_id: fixture.organizationId,
    user_id: userId,
    role: fixture.role,
    status: "active",
  });
  if (insertError) throw insertError;
}

async function verifyFixture(fixture) {
  const client = createClient(apiUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email: fixture.email,
    password: testPassword,
  });
  if (signInError || !signIn.user) {
    throw signInError ?? new Error(`Could not sign in as ${fixture.email}.`);
  }

  const { data: memberships, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", signIn.user.id);
  const { data: organizations, error: organizationError } = await client
    .from("organizations")
    .select("id, name");
  const { data: marinas, error: marinaError } = await client
    .from("marinas")
    .select("organization_id, name");

  if (membershipError || organizationError || marinaError) {
    throw membershipError ?? organizationError ?? marinaError;
  }
  if (
    memberships?.length !== 1 ||
    memberships[0].organization_id !== fixture.organizationId ||
    memberships[0].role !== fixture.role ||
    memberships[0].status !== "active" ||
    organizations?.length !== 1 ||
    organizations[0].id !== fixture.organizationId ||
    organizations[0].name !== fixture.organizationName ||
    marinas?.length !== 1 ||
    marinas[0].organization_id !== fixture.organizationId ||
    marinas[0].name !== fixture.marinaName
  ) {
    throw new Error(`Tenant isolation verification failed for ${fixture.email}.`);
  }

  await client.auth.signOut();
}

for (const fixture of fixtures) {
  const user = await ensureUser(fixture.email);
  await ensureMembership(fixture, user.id);
}

for (const fixture of fixtures) {
  await verifyFixture(fixture);
  console.log(`PASS ${fixture.email}: ${fixture.role} for ${fixture.organizationName}`);
}

console.log("Local Phase 2 test users are ready. The password was not stored.");
