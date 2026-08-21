import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export default function ResetPasswordPage() {
  return (
    <AuthCard
      eyebrow="Choose a new password"
      title="Secure your account"
      description="Use at least eight characters and avoid a password you use elsewhere."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
