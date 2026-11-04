"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import styles from "./guest-time-input.module.css";

export function GuestTimeInput({ defaultValue = "", onChange, "aria-describedby": describedBy, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [empty, setEmpty] = useState(!defaultValue);
  const input = useRef<HTMLInputElement>(null);
  const hintId = `${props.id}-hint`;
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => queueMicrotask(() => setEmpty(!input.current?.value));
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  return <div className={styles.field} data-empty={empty}>
    <input {...props} ref={input} type="time" defaultValue={defaultValue} aria-describedby={[describedBy, empty ? hintId : null].filter(Boolean).join(" ") || undefined} onChange={(event) => { setEmpty(!event.target.value); onChange?.(event); }} />
    {empty ? <span className={styles.hint} id={hintId}><span aria-hidden="true">!</span>Fill this out</span> : null}
  </div>;
}
