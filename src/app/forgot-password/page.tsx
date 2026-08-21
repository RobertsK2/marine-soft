import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email and we will send a secure link if an account exists."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
