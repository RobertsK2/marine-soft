"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { BookingSearchFieldErrors } from "@/domain/public-booking/types";
import { calendarDate, calendarDays, calendarKey, calendarMonth, isCalendarDate, shiftCalendarDay, shiftCalendarMonth } from "./calendar-model";
import styles from "./booking-calendar.module.css";

const fullDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type DateName = "arrivalDate" | "departureDate";
type Values = Record<DateName, string>;

function DateField({ name, label, values, minDate, error, onValue }: {
  name: DateName; label: string; values: Values; minDate: string; error?: string; onValue: (name: DateName, value: string) => void;
}) {
  const value = values[name];
  const base = isCalendarDate(value) ? value : isCalendarDate(minDate) ? minDate : calendarKey(new Date());
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(calendarMonth(base));
  const [focused, setFocused] = useState(base);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const days = calendarDays(month);
  const errorId = `public-${name}-error`;

  function changeOpen(next: boolean) {
    if (next) {
      const initial = minDate && base < minDate ? minDate : base;
      setMonth(calendarMonth(initial));
      setFocused(initial);
    }
    setOpen(next);
  }

  function focusDate(date: string) {
    const next = !isCalendarDate(date) && date.startsWith("+") ? "9999-12-31" : minDate && date < minDate ? minDate : date;
    setFocused(next);
    setMonth(calendarMonth(next));
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const day = (calendarDate(date).getUTCDay() + 6) % 7;
    const next = event.key === "ArrowLeft" ? shiftCalendarDay(date, -1)
      : event.key === "ArrowRight" ? shiftCalendarDay(date, 1)
      : event.key === "ArrowUp" ? shiftCalendarDay(date, -7)
      : event.key === "ArrowDown" ? shiftCalendarDay(date, 7)
      : event.key === "Home" ? shiftCalendarDay(date, -day)
      : event.key === "End" ? shiftCalendarDay(date, 6 - day)
      : event.key === "PageUp" ? shiftCalendarMonth(date, event.shiftKey ? -12 : -1)
      : event.key === "PageDown" ? shiftCalendarMonth(date, event.shiftKey ? 12 : 1) : null;
    if (next) { event.preventDefault(); focusDate(next); }
  }
  function choose(date: string) {
    if (input.current) {
      // Dispatch through the existing form change handling so a changed date
      // invalidates the displayed quote exactly like manual date entry.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input.current, date);
      input.current.dispatchEvent(new Event("input", { bubbles: true }));
      input.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    onValue(name, date);
    setOpen(false);
  }
  function navigateMonth(direction: number) {
    const next = shiftCalendarMonth(month, direction);
    setMonth(next);
    const first = next < minDate && next.slice(0, 7) === minDate.slice(0, 7) ? minDate : next;
    setFocused(first);
  }
  return <div className="form-field">
    <label htmlFor={`public-${name}`}>{label} <span aria-hidden="true" className={styles.required}>*</span></label>
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <div ref={anchor} className={styles.inputWrap}>
        <input ref={input} id={`public-${name}`} name={name} type="text" inputMode="none" placeholder="Select date" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" required min={minDate} defaultValue={value} onChange={(event) => onValue(name, event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} aria-haspopup="dialog"
          onClick={(event) => { event.preventDefault(); trigger.current?.click(); }}
          onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") { event.preventDefault(); trigger.current?.click(); } }} />
        <Popover.Trigger ref={trigger} className={styles.trigger} aria-label={`Choose ${label.toLowerCase()}`}><CalendarDays size={18} aria-hidden="true" /></Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner anchor={anchor} sideOffset={8} collisionPadding={12} align="start" className={styles.positioner}>
          <Popover.Popup className={styles.popup} initialFocus={() => grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')}>
            <div className={styles.navigation}>
              <button type="button" aria-label="Previous month" disabled={Boolean(minDate && month <= calendarMonth(minDate))} onClick={() => navigateMonth(-1)}><ChevronLeft size={19} aria-hidden="true" /></button>
              <Popover.Title className={styles.title} aria-live="polite"><span className="sr-only">{label} calendar: </span>{monthLabel.format(calendarDate(month))}</Popover.Title>
              <button type="button" aria-label="Next month" disabled={month >= "9999-12-01"} onClick={() => navigateMonth(1)}><ChevronRight size={19} aria-hidden="true" /></button>
            </div>
            <div ref={grid} role="grid" aria-label={`${label} calendar grid`} className={styles.grid}>
              <div role="row" className={styles.week}>
                {weekdays.map(day => <span role="columnheader" aria-label={day} key={day}>{day.slice(0, 2)}</span>)}
              </div>
              {Array.from({ length: 6 }, (_, row) => <div role="row" className={styles.week} key={row}>
                {days.slice(row * 7, row * 7 + 7).map(date => <div role="gridcell" aria-selected={date === value} key={date}>
                  <button type="button" data-date={date} data-outside={date.slice(0, 7) !== month.slice(0, 7)} data-range={Boolean(values.arrivalDate && values.departureDate && date > values.arrivalDate && date < values.departureDate)} data-selected={date === values.arrivalDate || date === values.departureDate} disabled={!isCalendarDate(date) || Boolean(minDate && date < minDate)} tabIndex={date === focused ? 0 : -1} aria-label={fullDate.format(calendarDate(date))} onKeyDown={event => onKeyDown(event, date)} onClick={() => choose(date)}>{calendarDate(date).getUTCDate()}</button>
                </div>)}
              </div>)}
            </div>
            <p className={styles.help}>Use arrow keys to move; Enter to select.</p>
            <Popover.Close className={styles.close}>Close calendar</Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
    {error ? <p id={errorId} className="field-error">{error}</p> : null}
  </div>;
}

export function BookingDateFields({ arrivalDate, departureDate, minDate, errors }: Values & { minDate: string; errors: BookingSearchFieldErrors }) {
  const [values, setValues] = useState({ arrivalDate, departureDate });
  return <>{([ ["arrivalDate", "Arrival date"], ["departureDate", "Departure date"] ] as const).map(([name, label]) =>
    <DateField key={name} name={name} label={label} values={values} minDate={minDate} error={errors[name]} onValue={(field, value) => setValues(previous => ({ ...previous, [field]: value }))} />
  )}</>;
}
