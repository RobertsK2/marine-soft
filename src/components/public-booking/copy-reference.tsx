"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function CopyReference({ reference }: { reference: string }) {
  const [message, setMessage] = useState("Copy");
  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setMessage("Copied");
    } catch {
      setMessage("Copy unavailable — select the reference");
    }
  }
  return <button type="button" onClick={copy} aria-label="Copy booking reference"><Copy size={16} aria-hidden="true" /><span aria-live="polite">{message}</span></button>;
}
