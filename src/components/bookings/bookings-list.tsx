"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ListFilter, Plus, Search } from "lucide-react";
import Link from "next/link";
import { BookingStatusBadge } from "./booking-status";
import { formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";
import { filterBookingRows, type BookingListFilters, type BookingListRow } from "./bookings-list-model";
import styles from "./bookings-list.module.css";

const EMPTY_FILTERS: BookingListFilters = { query: "", status: "", from: "", to: "", source: "", payment: "" };

export function BookingsList({ rows }: { rows: BookingListRow[] }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const update = (key: keyof BookingListFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const visible = filterBookingRows(rows, filters);
  const filtered = Object.values(filters).some(Boolean);
  return <div className={styles.list}>
    <div className={styles.filters} role="search" aria-label="Filter bookings">
      <label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Search bookings" type="search" placeholder="Search guest, vessel or reference…" value={filters.query} onChange={(event) => update("query", event.target.value)} /></label>
      <select aria-label="Booking status filter" value={filters.status} onChange={(event) => update("status", event.target.value)}>
        <option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked in</option><option value="checked_out">Checked out</option><option value="cancelled">Cancelled</option>
      </select>
      <details className={styles.filterMenu}><summary><CalendarDays size={14} aria-hidden="true" />Date range{filters.from || filters.to ? " •" : ""}<ChevronDown size={14} aria-hidden="true" /></summary>
        <div><label>Stay from<input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update("from", event.target.value)} /></label><label>Stay through<input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update("to", event.target.value)} /></label><small>Shows stays overlapping these dates.</small></div>
      </details>
      <details className={`${styles.filterMenu} ${styles.more}`}><summary><ListFilter size={14} aria-hidden="true" />More filters{filters.source || filters.payment ? " •" : ""}<ChevronDown size={14} aria-hidden="true" /></summary>
        <div><label>Booking source<select value={filters.source} onChange={(event) => update("source", event.target.value)}><option value="">All sources</option><option value="manual">Manual</option><option value="online">Online</option></select></label><label>Payment filter<select value={filters.payment} onChange={(event) => update("payment", event.target.value)}><option value="">All payments</option><option value="paid">Paid</option><option value="unpaid">Unpaid or balance due</option></select></label></div>
      </details>
      <Link className={styles.create} href="/dashboard/bookings/new"><Plus size={16} aria-hidden="true" />Create booking</Link>
    </div>
    {filtered ? <div className={styles.filterSummary}><span role="status">{visible.length} of {rows.length} bookings</span><button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button></div> : null}
    <div className={styles.tableWrap} role="region" aria-label="Bookings table" tabIndex={0}>
      <table className={styles.table}>
        <thead><tr>{["Booking", "Stay", "Berth", "Status", "Payment", "Actions"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{visible.map((booking) => <tr key={booking.id}>
          <td><Link className={styles.guest} href={`/dashboard/bookings/${booking.id}`} title={booking.reference}>{booking.customer_name}</Link><span className={styles.secondary}>{formatVesselName(booking.vessel_name)}</span></td>
          <td><span className={styles.stay}>{booking.stayLabel}</span><span className={styles.secondary}>ETA {formatBookingTime(booking.eta)} / ETD {formatBookingTime(booking.etd)}</span></td>
          <td>{booking.berthCodes.length ? <span className={styles.berth} title={booking.berthCodes.join(" → ")}>{booking.berthCodes[0]}{booking.berthCodes.length > 1 ? ` +${booking.berthCodes.length - 1}` : ""}</span> : <span className={styles.unassigned}>Unassigned</span>}</td>
          <td><BookingStatusBadge status={booking.status} /></td>
          <td className={styles.payment}>{booking.payment}</td>
          <td><Link className={styles.action} href={`/dashboard/bookings/${booking.id}`} aria-label={`View booking ${booking.reference}`}>View</Link></td>
        </tr>)}</tbody>
      </table>
      {!visible.length ? <div className={styles.empty}><h2>{rows.length ? "No matching bookings" : "No bookings recorded"}</h2><p>{rows.length ? "Adjust or clear the filters to see more bookings." : "Create the first capacity booking for this marina."}</p></div> : null}
    </div>
  </div>;
}
