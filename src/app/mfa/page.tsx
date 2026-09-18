import { redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/mfa-form";
import { resolveAuthCallbackDestination } from "@/lib/auth/authorization";
import { getAuthorizationContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Verify your sign-in" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const context = await getAuthorizationContext({ allowUnverifiedAdmin: true });
  if (!context) redirect("/login");
  const next = resolveAuthCallbackDestination((await searchParams).next);
  if (context.role !== "marina_admin") redirect(next);
  const { data } = await (await createClient()).auth.getClaims();
  if (data?.claims?.aal === "aal2") redirect(next);

  return <main className="legal-page">
    <h1>Verify your sign-in</h1>
    <p>Marina admin access requires an authenticator app code.</p>
    <MfaForm next={next} />
  </main>;
}
