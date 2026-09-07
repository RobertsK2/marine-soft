"use client";

import { Plus, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BerthStatusBadge } from "./berth-status";
import { formatMetres } from "@/domain/berths/formatting";
import type { Berth } from "@/domain/berths/types";
import styles from "./berths-inventory.module.css";

export function BerthsInventory({ berths, canManage }: { berths: Berth[]; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const query = search.trim().toLowerCase();
  const visible = berths.filter((berth) => (status === "all" || berth.status === status) &&
    `${berth.code} ${berth.zone} ${formatMetres(berth.max_length_m)} ${formatMetres(berth.max_beam_m)} ${formatMetres(berth.max_draft_m)}`.toLowerCase().includes(query));
  return <section className={styles.inventory} aria-label="Berth inventory">
    <dl className={styles.summary} aria-label="Berth status summary">
      <div><dt>Total</dt><dd>{berths.length}</dd></div>
      <div><dt>Available</dt><dd>{berths.filter((berth) => berth.status === "available").length}</dd></div>
      <div><dt>Blocked</dt><dd>{berths.filter((berth) => berth.status === "blocked").length}</dd></div>
      <div><dt>Out of Service</dt><dd>{berths.filter((berth) => berth.status === "out_of_service").length}</dd></div>
    </dl>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search berths</span>
        <input type="search" placeholder="Search berth, zone, or dimensions…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <label><span className="sr-only">Status</span><select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="all">Status: All</option><option value="available">Available</option><option value="blocked">Blocked</option><option value="out_of_service">Out of Service</option>
      </select></label>
      {canManage ? <div className={styles.actions}>
        <Link className={styles.button} href="/dashboard/berths/import"><Upload size={16} aria-hidden="true" />Import CSV</Link>
        <Link className={`${styles.button} ${styles.primary}`} href="/dashboard/berths/new"><Plus size={18} aria-hidden="true" />Add berth</Link>
      </div> : null}
    </div>
    <div className={styles.tableWrap}>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Berth inventory table">
        <table className={styles.table}>
          <thead><tr>{["Berth", "Zone / Pier", "Maximum Dimensions", "Status", "Priority", "Actions"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{visible.map((berth) => <tr key={berth.id}>
            <td><Link className={styles.code} href={`/dashboard/berths/${berth.id}`}>{berth.code}</Link></td>
            <td>{berth.zone || "—"}</td>
            <td><span className={styles.dimensions}>LOA {formatMetres(berth.max_length_m)} · Beam {formatMetres(berth.max_beam_m)} · Draft {formatMetres(berth.max_draft_m)}</span><span className={styles.secondary}>{berth.allow_smaller_vessels ? "Smaller vessels allowed" : "Exact class only"}</span></td>
            <td><BerthStatusBadge status={berth.status} /></td>
            <td className={styles.priority}>{berth.priority}</td>
            <td><Link className={styles.view} href={`/dashboard/berths/${berth.id}`} aria-label={`View berth ${berth.code}`}>View</Link></td>
          </tr>)}</tbody>
        </table>
      </div>
      {visible.length === 0 ? <div className={styles.empty}><h2>{berths.length === 0 ? "No physical berths recorded" : "No berths match your filters"}</h2><p>{berths.length === 0 ? "Add the first berth to establish marina capacity." : "Try another search or status."}</p></div> : null}
      <footer className={styles.footer} aria-live="polite">Showing {visible.length} of {berths.length} berths</footer>
    </div>
  </section>;
}
