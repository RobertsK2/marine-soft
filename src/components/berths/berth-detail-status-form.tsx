"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { BerthStatusActionState } from "@/app/dashboard/berths/actions";
import type { BerthStatus } from "@/domain/berths/types";
import styles from "./berth-detail.module.css";

const initialState: BerthStatusActionState = { status: "idle" };

function StatusButton({ target, current, onChoose }: { target: BerthStatus; current: BerthStatus; onChoose: () => void }) {
  const { pending } = useFormStatus();
  const labels: Record<BerthStatus, string> = { available: "Set Available", blocked: "Block Berth", out_of_service: "Set Out of Service" };
  return <button className={`${styles.statusButton} ${target === "out_of_service" ? styles.danger : ""}`} disabled={pending || target === current} name="status" onClick={onChoose} type="submit" value={target}>
    {pending ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : null}{labels[target]}
  </button>;
}

export function BerthDetailStatusForm({ action, status }: {
  action: (state: BerthStatusActionState, formData: FormData) => Promise<BerthStatusActionState>;
  status: BerthStatus;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [requestedStatus, setRequestedStatus] = useState<BerthStatus>(status);
  return <form action={formAction} className={styles.statusForm}>
    <p>Service Status</p>
    <div className={styles.statusActions}>
      {status !== "available" ? <StatusButton current={status} target="available" onChoose={() => setRequestedStatus("available")} /> : null}
      {status !== "blocked" ? <StatusButton current={status} target="blocked" onChoose={() => setRequestedStatus("blocked")} /> : null}
      {status !== "out_of_service" ? <StatusButton current={status} target="out_of_service" onChoose={() => setRequestedStatus("out_of_service")} /> : null}
    </div>
    {state.status === "impact" && state.impact ? <div className={styles.impact} role="alert">
      <strong><AlertTriangle size={15} aria-hidden="true" />{state.impact.affectedCount} affected booking{state.impact.affectedCount === 1 ? "" : "s"}</strong>
      <p>{state.message}</p>
      <ul>{state.impact.affectedBookings.map((booking) => <li key={booking.bookingId}><Link href={`/dashboard/bookings/${booking.bookingId}`}>{booking.reference}</Link><span>{booking.arrivalDate} – {booking.departureDate}</span></li>)}</ul>
      <input name="confirmImpact" type="hidden" value="true" />
      <button className={styles.confirm} name="status" type="submit" value={requestedStatus}>Confirm outage, leave bookings unresolved</button>
    </div> : null}
    {state.message && state.status !== "impact" ? <p className={styles.message} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
