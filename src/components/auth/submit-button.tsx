"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary auth-submit" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : null}
      {pending ? "Please wait…" : children}
    </button>
  );
}
