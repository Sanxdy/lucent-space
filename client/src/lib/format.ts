export const pad = (n: number) => String(n).padStart(2, "0");

/** Parse a local date-only string as local midnight (not UTC). */
export function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Parse "YYYY-MM-DDTHH:mm" as a local date. */
export function parseDateTime(value: string): Date {
  if (value.includes("T")) {
    const [date, time = "00:00"] = value.split("T");
    const d = parseDay(date);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }
  return parseDay(value);
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoDay(new Date());

export function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function daysBetween(a: Date, b: Date) {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

/**
 * The zones shown next to an event, in the order a person reads them: their own first, then
 * the two places the team works from.
 */
export const ZONES = [
  { key: "local", label: "Local", timeZone: undefined },
  { key: "us", label: "US", timeZone: "America/New_York" },
  { key: "eu", label: "EU", timeZone: "Europe/Berlin" },
] as const;

/** A UTC instant, as the calendar stores it. */
function instantOf(value: string): Date {
  // "2026-10-21T05:00:00.000Z" is a real instant; "2026-10-21T09:00" is a wall-clock time
  // typed in this browser, which Date parses as local. Both end up as the same kind of Date.
  return new Date(value);
}

/**
 * Time in one zone.
 *
 * The old version rebuilt the date from the string's own digits as a local Date, which threw
 * away the trailing Z: an event stored at 05:00 UTC was shown as 05:00 local instead of 12:00
 * WIB. Formatting with an explicit timeZone makes that impossible.
 */
export function timeInZone(value: string, timeZone?: string) {
  const date = instantOf(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** The short zone name Intl reports, e.g. "GMT+7", "EDT", "GMT+2". */
export function zoneName(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
}

export function timeLabel(value: string) {
  return timeInZone(value, undefined);
}

export function dayLabel(value: string, style: "short" | "long" = "short") {
  const date = parseDay(value);
  const today = new Date();
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", style === "long" ? { month: "long", day: "numeric" } : { month: "short", day: "numeric" });
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekDays(date: Date): Date[] {
  const offset = (date.getDay() + 6) % 7;
  const start = addDays(date, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function memberTime(tzOffset: number) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + tzOffset * 60_000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function timezoneRelation(tzOffset: number) {
  const local = -new Date().getTimezoneOffset();
  const diff = tzOffset - local;
  if (diff === 0) return "Same time as you";
  const hours = diff / 60;
  return `${Number.isInteger(hours) ? Math.abs(hours) : Math.abs(hours).toFixed(1)}h ${diff > 0 ? "ahead" : "behind"}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function hueColor(hue: number) {
  return `hsl(${hue} 62% 52%)`;
}

export function pct(value: number, total: number) {
  return total <= 0 ? 0 : Math.round((value / total) * 100);
}
