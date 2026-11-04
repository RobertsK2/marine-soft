// Presentation-only UTC date arithmetic. Availability remains server-validated.
export function isCalendarDate(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = calendarDate(key);
  return Number.isFinite(date.getTime()) && calendarKey(date) === key;
}
export function calendarDate(key: string) {
  return new Date(`${key}T00:00:00Z`);
}
export function calendarKey(date: Date) {
  return date.toISOString().split("T")[0];
}
export function calendarMonth(key: string) {
  return `${key.slice(0, 7)}-01`;
}
export function shiftCalendarDay(key: string, days: number) {
  const date = calendarDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return calendarKey(date);
}
export function shiftCalendarMonth(key: string, months: number) {
  const date = calendarDate(key);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return calendarKey(date);
}
export function calendarDays(month: string) {
  const start = calendarDate(calendarMonth(month));
  const offset = (start.getUTCDay() + 6) % 7;
  const first = shiftCalendarDay(calendarKey(start), -offset);
  return Array.from({ length: 42 }, (_, index) => shiftCalendarDay(first, index));
}
