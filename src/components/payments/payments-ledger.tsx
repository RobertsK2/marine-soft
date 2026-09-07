"use client";

import { CalendarDays, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { filterLedgerRows, ledgerMoney, ledgerTotals, PAYMENT_LABELS, type LedgerRow } from "./payments-ledger-model";
import styles from "./payments-ledger.module.css";

const PAGE_SIZE = 8;

export function PaymentsLedger({ rows, timeZone }: { rows: LedgerRow[]; timeZone: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const invalidRange = Boolean(from && to && from > to);
  const filtered = filterLedgerRows(rows, query, status, from, to);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(offset, offset + PAGE_SIZE);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).filter((value) => value === 1 || value === pageCount || Math.abs(value - currentPage) <= 1);
  const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  const setFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };

  return <section className={styles.ledger} aria-label="Payments ledger">
    <dl className={styles.summary} aria-label="Payment summary">
      <div><dt><i className={styles.greenDot} />Collected</dt><dd>{ledgerTotals(filtered, "paid")}</dd></div>
      <div><dt><i className={styles.amberDot} />Outstanding</dt><dd>{ledgerTotals(filtered, "due")}</dd></div>
      <div><dt><i className={styles.redDot} />Pending / Failed</dt><dd>{ledgerTotals(filtered, "pending")}</dd><small>({filtered.filter((row) => row.status === "pending" || row.status === "failed").length} items)</small></div>
    </dl>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={16} aria-hidden="true" /><span className="sr-only">Search payments</span><input type="search" placeholder="Search booking ref, guest name, vessel…" value={query} onChange={(event) => setFilter(setQuery, event.target.value)} /></label>
      <select aria-label="Payment Status" value={status} onChange={(event) => setFilter(setStatus, event.target.value)}>
        <option value="">Payment Status: All</option>
        {Object.entries(PAYMENT_LABELS).filter(([value]) => value !== "paid_in_full").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <details className={styles.dateRange}><summary><CalendarDays size={15} aria-hidden="true" />{from || to ? "Date: Custom range" : "Date: All dates"}<ChevronDown size={14} aria-hidden="true" /></summary>
        <div><p>Last updated · {timeZone}</p><label>From<input type="date" value={from} max={to || undefined} onChange={(event) => setFilter(setFrom, event.target.value)} /></label><label>To<input type="date" value={to} min={from || undefined} onChange={(event) => setFilter(setTo, event.target.value)} /></label><button type="button" onClick={() => { setFrom(""); setTo(""); setPage(1); }}>All dates</button></div>
      </details>
    </div>
    {invalidRange ? <p className={styles.rangeError} role="alert">The end date must be on or after the start date.</p> : null}
    <div className={styles.tableWrap}>
      <div className={styles.scroll} role="region" aria-label="Payments table" tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">Booking totals and checkout amounts. Dates show the last recorded update in {timeZone}.</caption>
          <thead><tr>{["Booking", "Guest", "Amount", "Status", "Method", "Date", "Actions"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id}>
            <td>{row.bookingId ? <Link className={styles.reference} href={`/dashboard/bookings/${row.bookingId}`}>{row.reference}</Link> : <strong className={styles.reference}>Not booked</strong>}<span className={styles.secondary}>{row.vessel ?? (row.bookingId ? null : "Checkout attempt")}</span></td>
            <td>{row.guest}</td>
            <td><strong className={styles.amount}>{ledgerMoney(row.amount, row.currency)}</strong>{row.due > 0 ? <span className={styles.secondary}>Balance due: {ledgerMoney(row.due, row.currency)}</span> : null}</td>
            <td><span className={`${styles.status} ${styles[row.status]}`}><i aria-hidden="true" />{PAYMENT_LABELS[row.status]}</span></td>
            <td className={styles.muted}>{row.method ?? "Not recorded"}</td>
            <td className={styles.date}><time dateTime={row.updatedAt}>{dateFormatter.format(new Date(row.updatedAt))}<span>{timeFormatter.format(new Date(row.updatedAt))}</span></time></td>
            <td>{row.bookingId ? <Link className={styles.view} href={`/dashboard/bookings/${row.bookingId}`} aria-label={`View booking ${row.reference}`}>View</Link> : <span className={styles.muted}>—</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {visible.length === 0 ? <div className={styles.empty}><h2>{rows.length ? "No matching payments" : "No payment records yet"}</h2><p>{rows.length ? "Try another search, status, or date range." : "Booking balances and checkout attempts will appear here."}</p></div> : null}
      <footer className={styles.footer}><span role="status">Showing {filtered.length ? offset + 1 : 0} to {Math.min(offset + PAGE_SIZE, filtered.length)} of {filtered.length} records</span>
        <nav aria-label="Payments pagination"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          {pages.map((value, index) => <span className={styles.pageItem} key={value}>{index > 0 && value - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}<button aria-label={`Page ${value}`} aria-current={value === currentPage ? "page" : undefined} onClick={() => setPage(value)}>{value}</button></span>)}
          <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>
      </footer>
    </div>
    <p className={styles.note}>Dates show the last recorded update ({timeZone}). Summary follows the filters; unrecorded amounts are excluded.</p>
  </section>;
}
