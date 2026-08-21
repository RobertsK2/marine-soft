import type { AuthActionState } from "@/app/auth/actions";

export function FormMessage({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}
