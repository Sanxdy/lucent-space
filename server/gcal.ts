import { createHash } from "node:crypto";
import ical from "node-ical";
import { nowIso, rows, run, tx, uid } from "./db.js";

/**
 * Google Calendar -> Lucent.
 *
 * Lucent reads a Google calendar's "Secret address in iCal format" and stores the
 * events so they appear in the Lucent calendar. Read-only by design: the feed is a
 * one-way window into Google, so nothing here can modify the Google calendar.
 *
 * No OAuth. A secret ICS address needs no Cloud project, no consent screen and no
 * token refresh; the cost is that it is a bearer URL, which is why it is stored per
 * user and never echoed back in full.
 */

/** How far back and forward to materialise events. Recurring series expand inside this window only. */
const WINDOW_PAST_DAYS = 90;
const WINDOW_FUTURE_DAYS = 400;

/** A runaway feed must not fill the table. */
const MAX_EVENTS = 5000;

/** Google serves a few MB at most; anything larger is not a calendar. */
const MAX_BYTES = 12 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 20_000;

export class FeedError extends Error {}

/**
 * Accept only https URLs on a Google host. The address is a credential, so it must not
 * travel in clear text, and restricting the host stops the field being used to make the
 * server fetch arbitrary internal URLs.
 */
export function validateFeedUrl(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new FeedError("Paste the calendar's secret address first.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new FeedError("That does not look like a calendar address.");
  }
  if (url.protocol !== "https:") throw new FeedError("The calendar address must start with https://");
  const host = url.hostname.toLowerCase();
  if (host !== "google.com" && !host.endsWith(".google.com")) {
    throw new FeedError("That is not a Google Calendar address. It should be on calendar.google.com.");
  }
  if (!url.pathname.toLowerCase().endsWith(".ics")) {
    throw new FeedError("That address does not point at an .ics feed.");
  }
  return url.toString();
}

/**
 * Show enough of the address to recognise which calendar it is, never enough to use it.
 * The secret lives in the `private-<hash>` segment, so that is what gets replaced; the
 * calendar id and the file name stay so a person can tell two calendars apart.
 */
export function maskFeedUrl(raw: string): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const shown = parts.map((part) => {
      const decoded = decodeURIComponent(part);
      if (/^(private|public)-/i.test(decoded)) return `${decoded.split("-")[0]}-••••`;
      return decoded;
    });
    return `${url.host}/${shown.join("/")}`;
  } catch {
    return "••••";
  }
}

function shortId(parts: string[]): string {
  return createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 20);
}

function inWindow(date: Date, from: Date, to: Date): boolean {
  return date >= from && date <= to;
}

/** Collect the EXDATE values of a series as ISO strings. */
function excludedDates(ev: Record<string, any>): Set<string> {
  const skip = new Set<string>();
  for (const value of Object.values(ev.exdate ?? {})) {
    if (value instanceof Date) skip.add(value.toISOString());
    else if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) skip.add(parsed.toISOString());
    }
  }
  return skip;
}

/**
 * Instances Google has edited individually.
 *
 * node-ical folds these into the master event instead of returning separate VEVENTs:
 * they live in `ev.recurrences`, and each one is keyed twice (once by date, once by
 * full timestamp). Deduplicating on RECURRENCE-ID matters — without it the same edit is
 * emitted twice and the day shows a duplicate.
 */
function editedInstances(ev: Record<string, any>): Map<string, Record<string, any>> {
  const found = new Map<string, Record<string, any>>();
  for (const value of Object.values(ev.recurrences ?? {})) {
    const override = value as Record<string, any> | null;
    if (!override) continue;
    const at = override.recurrenceid instanceof Date ? override.recurrenceid : override.start;
    if (at instanceof Date) found.set(at.toISOString(), override);
  }
  return found;
}

type Parsed = {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
};

/**
 * Turn raw ICS text into concrete events.
 *
 * Google exports a recurring series once with an RRULE rather than listing every
 * instance, so the series has to be expanded here.
 */
export function parseFeed(text: string, now = new Date()): Parsed[] {
  // RFC 5545 requires CRLF. Google sends it, but a feed that arrives with bare newlines
  // or doubled carriage returns would otherwise parse as empty with no error at all.
  // Dropping every CR first and then rebuilding the pairs handles all three shapes.
  const normalised = text.replace(/\r/g, "").replace(/\n/g, "\r\n");
  const data = ical.sync.parseICS(normalised) as Record<string, unknown>;

  const from = new Date(now.getTime() - WINDOW_PAST_DAYS * 86_400_000);
  const to = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86_400_000);

  const events: Parsed[] = [];

  for (const entry of Object.values(data)) {
    if (!entry || typeof entry !== "object") continue;
    const ev = entry as Record<string, any>;
    if (String(ev.type).toUpperCase() !== "VEVENT") continue;
    if (ev.status && String(ev.status).toUpperCase() === "CANCELLED") continue;

    const start: Date | undefined = ev.start instanceof Date ? ev.start : undefined;
    if (!start) continue;

    const title = String(ev.summary ?? "(no title)").trim() || "(no title)";
    const location = String(ev.location ?? "").trim();
    const allDay = ev.datetype === "date";
    const seriesUid = String(ev.uid ?? shortId([title, start.toISOString()]));

    const end: Date =
      ev.end instanceof Date ? ev.end : new Date(start.getTime() + (allDay ? 86_400_000 : 30 * 60_000));
    const durationMs = Math.max(0, end.getTime() - start.getTime());

    if (ev.rrule && typeof ev.rrule.between === "function") {
      const edits = editedInstances(ev);
      // The original slot of a moved instance must not also be generated by the RRULE.
      const skip = excludedDates(ev);
      edits.forEach((_override, at) => skip.add(at));

      let occurrences: Date[] = [];
      try {
        occurrences = ev.rrule.between(from, to, true);
      } catch {
        occurrences = [];
      }
      for (const occurrence of occurrences) {
        if (skip.has(occurrence.toISOString())) continue;
        events.push({
          uid: shortId([seriesUid, occurrence.toISOString()]),
          title,
          startsAt: occurrence.toISOString(),
          endsAt: new Date(occurrence.getTime() + durationMs).toISOString(),
          allDay,
          location,
        });
      }

      // Then the edited instances, each at the time Google moved it to.
      for (const override of Array.from(edits.values())) {
        const movedStart: Date | undefined = override.start instanceof Date ? override.start : undefined;
        if (!movedStart) continue;
        if (override.status && String(override.status).toUpperCase() === "CANCELLED") continue;
        if (!inWindow(movedStart, from, to)) continue;
        const movedEnd: Date =
          override.end instanceof Date ? override.end : new Date(movedStart.getTime() + durationMs);
        events.push({
          uid: shortId([seriesUid, movedStart.toISOString()]),
          title: String(override.summary ?? title).trim() || title,
          startsAt: movedStart.toISOString(),
          endsAt: movedEnd.toISOString(),
          allDay: override.datetype === "date" ? true : allDay,
          location: String(override.location ?? location).trim(),
        });
      }
      continue;
    }

    if (inWindow(start, from, to)) {
      events.push({
        uid: shortId([seriesUid, start.toISOString()]),
        title,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay,
        location,
      });
    }
  }

  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return events.slice(0, MAX_EVENTS);
}

async function download(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Lucent calendar sync" },
    });
    if (!res.ok) {
      throw new FeedError(
        res.status === 404
          ? "Google says that address does not exist. Check it was copied in full."
          : `Google returned ${res.status} for that address.`,
      );
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new FeedError("That feed is too large to be a calendar.");
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new FeedError("That feed is too large to be a calendar.");
    if (!body.includes("BEGIN:VCALENDAR")) {
      throw new FeedError(
        "That address did not return a calendar. Make sure it is the iCal address, not the web link.",
      );
    }
    return body;
  } catch (error) {
    if (error instanceof FeedError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FeedError("Google took too long to answer. Try again in a moment.");
    }
    throw new FeedError("Could not reach Google. Check the address and try again.");
  } finally {
    clearTimeout(timer);
  }
}

/** Replace one user's imported events with a fresh copy of their feed. */
export async function syncUser(userId: string, url: string): Promise<number> {
  const body = await download(url);
  const events = parseFeed(body);
  const syncedAt = nowIso();

  tx(() => {
    run("DELETE FROM external_events WHERE user_id = ?", userId);
    for (const event of events) {
      run(
        `INSERT INTO external_events (id, user_id, title, starts_at, ends_at, all_day, location, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        uid(), userId, event.title, event.startsAt, event.endsAt,
        event.allDay ? 1 : 0, event.location, syncedAt,
      );
    }
    run(
      "UPDATE users SET google_calendar_synced_at = ?, google_calendar_error = '' WHERE id = ?",
      syncedAt, userId,
    );
  });

  return events.length;
}

/** Record why a sync failed without dropping the events already imported. */
export function recordFailure(userId: string, message: string): void {
  run("UPDATE users SET google_calendar_error = ? WHERE id = ?", message.slice(0, 300), userId);
}

export function disconnect(userId: string): void {
  tx(() => {
    run("DELETE FROM external_events WHERE user_id = ?", userId);
    run(
      "UPDATE users SET google_calendar_url = NULL, google_calendar_synced_at = NULL, google_calendar_error = '' WHERE id = ?",
      userId,
    );
  });
}

export function eventsBetween(userId: string, fromIso: string, toIso: string) {
  return rows<{
    id: string; title: string; starts_at: string; ends_at: string; all_day: number; location: string;
  }>(
    `SELECT id, title, starts_at, ends_at, all_day, location
       FROM external_events
      WHERE user_id = ? AND ends_at >= ? AND starts_at <= ?
      ORDER BY starts_at`,
    userId, fromIso, toIso,
  );
}

/** Every user with a connected feed, for the background refresh. */
export function connectedUsers() {
  return rows<{ id: string; google_calendar_url: string }>(
    "SELECT id, google_calendar_url FROM users WHERE google_calendar_url IS NOT NULL AND google_calendar_url <> ''",
  );
}
