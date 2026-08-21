import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; message?: string; error?: string }>;
}) {
  const { next, message, error } = await searchParams;

  return (
    <AuthCard
      eyebrow="Restricted / Marina staff"
      title="Log in to Berthio"
      description="Use the email and password assigned to your marina account."
    >
      {message === "password-updated" ? (
        <p className="form-message form-success" role="status">
          Your password has been updated. You can log in now.
        </p>
      ) : null}
      {error === "no-membership" ? (
        <p className="form-message form-error" role="alert">
          This account does not have an active marina membership.
        </p>
      ) : null}
      {error === "invalid-callback" ? (
        <p className="form-message form-error" role="alert">
          This authentication link is invalid or expired.
        </p>
      ) : null}
      <LoginForm next={next} />
    </AuthCard>
  );
}
