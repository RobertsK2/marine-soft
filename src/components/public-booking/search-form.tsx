"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { BOOKING_SEARCH_FIELDS } from "@/domain/public-booking/types";
import styles from "./guest-booking.module.css";

const SearchPending = createContext(false);
const MOBILE_QUERY = "(max-width: 650px)";
const DESKTOP_SCROLL_ATTEMPT = "berthio:desktop-availability-scroll";

function stickyTopOffset() {
  let offset = 16;
  for (const element of document.querySelectorAll<HTMLElement>("header")) {
    const position = window.getComputedStyle(element).position;
    const bounds = element.getBoundingClientRect();
    if ((position === "sticky" || position === "fixed") && bounds.top <= 1 && bounds.bottom > 0) {
      offset = Math.max(offset, bounds.bottom + 16);
    }
  }
  return offset;
}

export function AvailabilitySubmitButton({ className }: { className: string }) {
  const searching = useContext(SearchPending);
  const { pending: paying } = useFormStatus();
  return <button className={className} disabled={searching || paying} type="submit">
    <Search size={16} aria-hidden="true" /> {searching ? "Checking availability…" : "Check Availability"}
  </button>;
}

function EditSearchButton({ onEdit }: { onEdit: () => void }) {
  const { pending } = useFormStatus();
  return <button className={styles.editSearch} disabled={pending} onClick={onEdit} type="button">
    <ArrowLeft aria-hidden="true" size={16} /> Back / Edit Search
  </button>;
}

export function SearchForm({ action, children, resultAttempt, reviewAvailable }: { action: string; children: ReactNode; resultAttempt?: string; reviewAvailable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [review, setReview] = useState(reviewAvailable);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const edited = useRef(false);

  useEffect(() => {
    if (window.matchMedia(MOBILE_QUERY).matches && (review || edited.current)) {
      stepHeading.current?.focus({ preventScroll: true });
      stepHeading.current?.parentElement?.scrollIntoView({ block: "start" });
    }
  }, [review]);

  useEffect(() => {
    if (!resultAttempt || window.matchMedia(MOBILE_QUERY).matches
      || sessionStorage.getItem(DESKTOP_SCROLL_ATTEMPT) !== resultAttempt) return;
    if (!reviewAvailable) {
      sessionStorage.removeItem(DESKTOP_SCROLL_ATTEMPT);
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (sessionStorage.getItem(DESKTOP_SCROLL_ATTEMPT) !== resultAttempt) return;
      const target = form.current?.querySelector<HTMLElement>('[data-availability="available"]');
      if (!target) return;
      sessionStorage.removeItem(DESKTOP_SCROLL_ATTEMPT);
      const top = window.scrollY + target.getBoundingClientRect().top - stickyTopOffset();
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.scrollTo({ top: Math.max(0, top), behavior });
    });
    return () => cancelAnimationFrame(frame);
  }, [resultAttempt, reviewAvailable]);

  return <SearchPending.Provider value={pending}><form ref={form} action={action} method="get" noValidate className={styles.searchForm} aria-busy={pending} data-search-pending={pending} data-search-dirty={dirty} data-mobile-step={review ? "review" : "search"} onChange={(event) => { const target = event.target; if (target instanceof HTMLInputElement && BOOKING_SEARCH_FIELDS.some((field) => field === target.name)) { setDirty(true); setReview(false); } }} onSubmit={(event) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (pending || event.currentTarget.querySelector('.public-hold-control[aria-busy="true"]')) {
      event.preventDefault();
      return;
    }
    if (submitter?.hasAttribute("formaction")) {
      if (dirty) event.preventDefault();
      return;
    }
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Mobile collects dates only. Keep the existing server validation and
    // submit explicit estimated times, preserving any previously entered times.
    if (window.matchMedia(MOBILE_QUERY).matches) {
      if (!data.get("eta")) data.set("eta", "14:00");
      if (!data.get("etd")) data.set("etd", "10:00");
    }
    const query = new URLSearchParams();
    for (const field of BOOKING_SEARCH_FIELDS) query.set(field, String(data.get(field) ?? ""));
    // Rechecking identical details still refreshes capacity and resets errors.
    const searchAttempt = crypto.randomUUID();
    query.set("searchAttempt", searchAttempt);
    if (!window.matchMedia(MOBILE_QUERY).matches) sessionStorage.setItem(DESKTOP_SCROLL_ATTEMPT, searchAttempt);
    startTransition(() => router.push(`${action.split("#")[0]}?${query}#booking-entry`, { scroll: false }));
  }}>
    <div className={styles.mobileStep}>
      {review ? <EditSearchButton onEdit={() => { edited.current = true; setReview(false); }} /> : null}
      <p>Step {review ? "2" : "1"} of 2</p>
      <h2 ref={stepHeading} tabIndex={-1}>{review ? "Review & Pay" : "Search Availability"}</h2>
    </div>
    {children}
    {dirty && !pending ? <p role="status">Details changed. Please check availability again.</p> : null}
    {pending ? <div className={styles.skeleton} role="status"><span>Checking availability…</span><i /><i /><i /></div> : null}
  </form></SearchPending.Provider>;
}
