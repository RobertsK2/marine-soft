"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Clock3, Search, UserRound } from "lucide-react";
import { Fragment, useState } from "react";
import { filterAuditEvents, type AuditTableEvent } from "./audit-table-model";
import styles from "./audit-settings.module.css";

const emptyFilters = { search: "", actor: "", action: "", from: "", to: "" };
const pageSize = 9;

export function AdminAuditTable({ events, timezone }: { events: AuditTableEvent[]; timezone: string }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const filtered = filterAuditEvents(events, filters, timezone);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (page - 1) * pageSize;
  function update(key: keyof typeof filters, value: string) {
    setFilters({ ...filters, [key]: value }); setPage(1); setExpanded(null);
  }
  function reset() { setFilters(emptyFilters); setPage(1); setExpanded(null); }
  return (
    <>
      <form className={styles.filters} aria-label="Audit filters" onSubmit={(event) => event.preventDefault()}>
        <label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Search audit events" placeholder="Search events, entities, or users…" value={filters.search} onChange={(event) => update("search", event.target.value)} /></label>
        <select aria-label="User / Actor" value={filters.actor} onChange={(event) => update("actor", event.target.value)}><option value="">All Actors</option>{[...new Set(events.map((event) => event.actor))].sort().map((actor) => <option key={actor}>{actor}</option>)}</select>
        <select aria-label="Action / Event Type" value={filters.action} onChange={(event) => update("action", event.target.value)}><option value="">All Event Types</option>{[...new Set(events.map((event) => event.action))].sort().map((action) => <option key={action}>{action}</option>)}</select>
        <fieldset className={styles.dates}><legend>Date Range</legend><input aria-label="From date" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => update("from", event.target.value)} /><span aria-hidden="true">–</span><input aria-label="To date" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update("to", event.target.value)} /></fieldset>
        <button className={styles.reset} type="button" onClick={reset}>Reset</button>
      </form>
      <section className={styles.tablePanel} aria-label="Marina audit history">
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Audit table, scroll horizontally on smaller screens">
          <table className={styles.table}>
            <caption className={styles.srOnly}>Marina audit events, newest first</caption>
            <thead><tr>{["Time", "User / Actor", "Action", "Entity", "Details"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
            <tbody>
              {filtered.slice(start, start + pageSize).map((event, index) => {
                const row = start + index;
                const open = expanded === row;
                return <Fragment key={row}>
                  <tr>
                    <td><time dateTime={event.time}>{new Date(event.time).toLocaleString("en-GB", { timeZone: timezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></td>
                    <td><div className={`${styles.actor} ${event.actorType === "system" ? styles.system : ""}`}><span className={styles.avatar}>{event.actorType === "system" ? <Clock3 size={15} aria-hidden="true" /> : <UserRound size={15} aria-hidden="true" />}</span><span>{event.actor}<small>{event.actorType === "system" ? "System" : event.actorType === "guest" ? "Guest" : "Member"}</small></span></div></td>
                    <td><strong className={styles.action}>{event.action}</strong></td>
                    <td><span className={styles.entity}>{event.entity}</span></td>
                    <td><div className={styles.detailsCell}><span>{event.summary}</span><button type="button" className={styles.expand} aria-label={`${open ? "Collapse" : "Expand"} event ${row + 1} details`} aria-expanded={open} aria-controls={`audit-detail-${row}`} onClick={() => setExpanded(open ? null : row)}><ChevronDown size={17} aria-hidden="true" /></button></div></td>
                  </tr>
                  {open ? <tr className={styles.expanded}><td colSpan={5}><div id={`audit-detail-${row}`} className={styles.detailPanel}>
                    <dl className={styles.metadata}><div><dt>Timestamp</dt><dd>{new Date(event.time).toLocaleString("en-GB", { timeZone: timezone, dateStyle: "long", timeStyle: "long" })}</dd></div><div><dt>Actor / Source</dt><dd>{event.actor}{event.source ? <small>{event.source}</small> : null}</dd></div><div><dt>Affected entity</dt><dd>{event.entity}</dd></div></dl>
                    {event.changes.length ? <dl className={styles.changes}>{event.changes.map((change) => <div key={change.field}><dt>{change.field}</dt><dd>{change.before !== null ? <span><small>Previous</small>{change.before}</span> : null}{change.after !== null ? <span><small>New</small>{change.after}</span> : null}</dd></div>)}</dl> : null}
                    {event.summary ? <p className={styles.note}><span>Operational note</span>{event.summary}</p> : null}
                  </div></td></tr> : null}
                </Fragment>;
              })}
              {!filtered.length ? <tr><td colSpan={5} className={styles.empty}>{events.length ? "No events match these filters." : "No recorded operational changes yet."}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <footer className={styles.pagination}><p aria-live="polite">Showing {filtered.length ? start + 1 : 0}–{Math.min(start + pageSize, filtered.length)} of {filtered.length} audit events</p><nav aria-label="Audit pagination"><span>Page {page} of {pages}</span><button type="button" disabled={page === 1} onClick={() => { setPage(page - 1); setExpanded(null); }}><ChevronLeft size={14} aria-hidden="true" />Previous</button><button type="button" disabled={page === pages} onClick={() => { setPage(page + 1); setExpanded(null); }}>Next<ChevronRight size={14} aria-hidden="true" /></button></nav></footer>
      </section>
      <p className={styles.limit}>Newest first · Filters apply to the latest {events.length} records · Maximum 250 events · Times in {timezone}</p>
    </>
  );
}
