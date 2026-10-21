/**
 * Checks for the Google Calendar import.
 *
 * The ICS parser is the risky part: Google exports a recurring series once with an
 * RRULE rather than listing every instance, so anything wrong here silently shows the
 * wrong schedule. These tests pin the behaviour against a fixture that has the awkward
 * cases in it (folding, escaping, EXDATE, an edited instance, a cancelled event).
 *
 * Runs against a throwaway database, never the real one.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "lucent-gcal-"));
process.env.DATABASE_PATH = join(scratch, "test.db");

const { parseFeed, validateFeedUrl, maskFeedUrl, syncUser, eventsBetween, recordFailure, FeedError } =
  await import("/srv/lucent/dist/server/gcal.js");
const { run, rows } = await import("/srv/lucent/dist/server/db.js");

let pass = 0;
let fail = 0;
function check(name, condition, extra = "") {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}${extra ? ` -> ${extra}` : ""}`);
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}

/* ------------------------------------------------------------------ helpers */

const pad = (n) => String(n).padStart(2, "0");
function icsStamp(date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`
  );
}
function icsDate(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** Build a calendar around `base` so the events land inside the import window. */
function buildFixture(base) {
  const day = (offset, hour = 0) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };

  const weekly = day(1, 2);           // first occurrence of the recurring series
  const weeklyIso = icsStamp(weekly);
  const movedFrom = day(8, 2);        // second occurrence, moved by the user in Google
  const movedTo = day(9, 5);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "X-WR-CALNAME:Test",
    "X-WR-TIMEZONE:Asia/Jakarta",

    // plain timed event
    "BEGIN:VEVENT",
    `DTSTART:${icsStamp(day(0, 2))}`,
    `DTEND:${icsStamp(day(0, 3))}`,
    "UID:single@google.com",
    "SUMMARY:Team standup",
    "LOCATION:Zoom",
    "END:VEVENT",

    // all-day event
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${icsDate(day(2))}`,
    `DTEND;VALUE=DATE:${icsDate(day(3))}`,
    "UID:allday@google.com",
    "SUMMARY:Public holiday",
    "END:VEVENT",

    // folded summary plus an escaped comma
    "BEGIN:VEVENT",
    `DTSTART:${icsStamp(day(3, 6))}`,
    `DTEND:${icsStamp(day(3, 7))}`,
    "UID:folded@google.com",
    "SUMMARY:Quarterly planning with the whole leadership team and external partn",
    " ers\\, including finance",
    "END:VEVENT",

    // recurring series with COUNT
    "BEGIN:VEVENT",
    `DTSTART:${weeklyIso}`,
    `DTEND:${icsStamp(new Date(weekly.getTime() + 3600_000))}`,
    "RRULE:FREQ=WEEKLY;COUNT=4",
    "UID:weekly@google.com",
    "SUMMARY:Weekly review",
    "END:VEVENT",

    // one occurrence of that series was edited in Google: same UID, RECURRENCE-ID
    "BEGIN:VEVENT",
    `RECURRENCE-ID:${icsStamp(movedFrom)}`,
    `DTSTART:${icsStamp(movedTo)}`,
    `DTEND:${icsStamp(new Date(movedTo.getTime() + 3600_000))}`,
    "UID:weekly@google.com",
    "SUMMARY:Weekly review (moved)",
    "END:VEVENT",

    // recurring series with an excluded date
    "BEGIN:VEVENT",
    `DTSTART:${icsStamp(day(1, 8))}`,
    `DTEND:${icsStamp(day(1, 9))}`,
    "RRULE:FREQ=DAILY;COUNT=3",
    `EXDATE:${icsStamp(day(2, 8))}`,
    "UID:daily@google.com",
    "SUMMARY:Morning focus",
    "END:VEVENT",

    // cancelled
    "BEGIN:VEVENT",
    `DTSTART:${icsStamp(day(4, 4))}`,
    `DTEND:${icsStamp(day(4, 5))}`,
    "UID:cancelled@google.com",
    "SUMMARY:Cancelled meeting",
    "STATUS:CANCELLED",
    "END:VEVENT",

    // far outside the window
    "BEGIN:VEVENT",
    `DTSTART:${icsStamp(new Date(base.getTime() + 800 * 86_400_000))}`,
    `DTEND:${icsStamp(new Date(base.getTime() + 800 * 86_400_000 + 3600_000))}`,
    "UID:faraway@google.com",
    "SUMMARY:Way in the future",
    "END:VEVENT",

    "END:VCALENDAR",
  ];
  return { text: lines.join("\r\n") + "\r\n", day, weekly, movedFrom, movedTo };
}

const base = new Date();
base.setUTCHours(0, 0, 0, 0);
const fixture = buildFixture(base);
const events = parseFeed(fixture.text, base);

const byTitle = (title) => events.filter((e) => e.title === title);
const startsOf = (title) => byTitle(title).map((e) => e.startsAt).sort();

/* --------------------------------------------------------------- parsing */

console.log("=== plain events ===");
const standup = byTitle("Team standup");
eq("one standup parsed", standup.length, 1);
eq("standup keeps its UTC start", standup[0]?.startsAt, fixture.day(0, 2).toISOString());
eq("standup keeps its end", standup[0]?.endsAt, fixture.day(0, 3).toISOString());
eq("standup carries the location", standup[0]?.location, "Zoom");
eq("standup is not all-day", standup[0]?.allDay, false);

console.log("=== all-day events ===");
const holiday = byTitle("Public holiday");
eq("all-day parsed", holiday.length, 1);
eq("all-day flag set", holiday[0]?.allDay, true);
eq("all-day start is UTC midnight", holiday[0]?.startsAt, `${icsDate(fixture.day(2)).slice(0, 4)}-${icsDate(fixture.day(2)).slice(4, 6)}-${icsDate(fixture.day(2)).slice(6, 8)}T00:00:00.000Z`);

console.log("=== folding and escaping ===");
const folded = byTitle("Quarterly planning with the whole leadership team and external partners, including finance");
eq("folded summary unfolded and unescaped", folded.length, 1);

console.log("=== recurrence ===");
eq("weekly series expands to 4, minus the one Google moved", startsOf("Weekly review").length, 3);
check(
  "the moved occurrence is gone from its original slot",
  !startsOf("Weekly review").includes(fixture.movedFrom.toISOString()),
);
const moved = byTitle("Weekly review (moved)");
eq("the edited instance appears once", moved.length, 1);
eq("the edited instance sits at the new time", moved[0]?.startsAt, fixture.movedTo.toISOString());

console.log("=== EXDATE ===");
eq("daily series drops the excluded date", startsOf("Morning focus").length, 2);
check(
  "the excluded date is really absent",
  !startsOf("Morning focus").includes(fixture.day(2, 8).toISOString()),
);

console.log("=== filtering ===");
eq("cancelled events are skipped", byTitle("Cancelled meeting").length, 0);
eq("events outside the window are skipped", byTitle("Way in the future").length, 0);

console.log("=== identity ===");
const ids = events.map((e) => e.uid);
check("every event id is unique", new Set(ids).size === ids.length, `${ids.length} events`);
check("events come back in time order", events.every((e, i) => i === 0 || events[i - 1].startsAt <= e.startsAt));

console.log("=== robustness ===");
eq("an empty string yields no events", parseFeed("", base).length, 0);
eq("garbage yields no events", parseFeed("this is not a calendar", base).length, 0);
eq("a calendar with no VEVENT yields no events", parseFeed("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n", base).length, 0);
const lfOnly = parseFeed(fixture.text.replace(/\r\n/g, "\n"), base);
eq("bare newlines are tolerated", lfOnly.length, events.length);

/* ------------------------------------------------------------ validation */

console.log("=== feed address validation ===");
const accepts = (url) => {
  try {
    validateFeedUrl(url);
    return true;
  } catch (error) {
    return error instanceof FeedError ? false : "wrong error type";
  }
};
check("a real Google address is accepted", accepts("https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-1234/basic.ics") === true);
check("plain http is refused", accepts("http://calendar.google.com/calendar/ical/a/private-1/basic.ics") === false);
check("a non-Google host is refused (no server-side fetch of arbitrary URLs)", accepts("https://evil.example.com/x.ics") === false);
check("localhost is refused", accepts("https://localhost/x.ics") === false);
check("a private IP is refused", accepts("https://127.0.0.1/x.ics") === false);
check("a lookalike host is refused", accepts("https://calendar.google.com.evil.tld/x.ics") === false);
check("a non-ics path is refused", accepts("https://calendar.google.com/calendar/u/0") === false);
check("empty is refused", accepts("") === false);

console.log("=== masking ===");
const secret = "https://calendar.google.com/calendar/ical/example%40example.com/private-0000placeholder0000/basic.ics";
const masked = maskFeedUrl(secret);
check("the private hash is not shown", !masked.includes("0000placeholder0000"), masked);
check("the host is still recognisable", masked.includes("calendar.google.com"), masked);

/* ------------------------------------------------------- storage (temp db) */

console.log("=== storing a feed ===");
run("INSERT INTO workspaces (id, name, created_at) VALUES ('w1', 'W', '2026-01-01T00:00:00Z')");
run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u1', 'a@b.c', 'A', 'x', '2026-01-01T00:00:00Z')");
run("INSERT INTO memberships (user_id, workspace_id, role) VALUES ('u1', 'w1', 'member')");

let fetchCalls = 0;
let fetchBody = fixture.text;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => fetchBody,
  };
};

const stored = await syncUser("u1", "https://calendar.google.com/calendar/ical/x/private-1/basic.ics");
eq("every parsed event was stored", stored, events.length);
eq("the rows are in the table", rows("SELECT id FROM external_events WHERE user_id = 'u1'").length, events.length);
eq("the sync timestamp was recorded", Boolean(rows("SELECT google_calendar_synced_at AS t FROM users WHERE id = 'u1'")[0]?.t), true);

const rangeFrom = new Date(base.getTime() - 86_400_000).toISOString();
const rangeTo = new Date(base.getTime() + 30 * 86_400_000).toISOString();
const inRange = eventsBetween("u1", rangeFrom, rangeTo);
eq("range query returns the same events", inRange.length, events.length);
eq("a narrow range returns fewer", eventsBetween("u1", fixture.day(0, 1).toISOString(), fixture.day(0, 2).toISOString()).length, 1);
eq("a range with nothing in it returns none", eventsBetween("u1", "1990-01-01T00:00:00Z", "1990-02-01T00:00:00Z").length, 0);

console.log("=== re-syncing replaces, never duplicates ===");
const again = await syncUser("u1", "https://calendar.google.com/calendar/ical/x/private-1/basic.ics");
eq("same count the second time", again, events.length);
eq("still the same number of rows", rows("SELECT id FROM external_events WHERE user_id = 'u1'").length, events.length);

console.log("=== a failed refresh keeps what was already imported ===");
fetchBody = "<html>not a calendar</html>";
let threw = null;
try {
  await syncUser("u1", "https://calendar.google.com/calendar/ical/x/private-1/basic.ics");
} catch (error) {
  threw = error;
}
check("a non-calendar response is rejected", threw instanceof FeedError, threw?.message);
recordFailure("u1", threw?.message ?? "");
eq("the previous events survive the failure", rows("SELECT id FROM external_events WHERE user_id = 'u1'").length, events.length);
eq("the failure is recorded for the person to see", rows("SELECT google_calendar_error AS e FROM users WHERE id = 'u1'")[0]?.e?.length > 0, true);

console.log("=== a failed fetch is reported, not swallowed ===");
globalThis.fetch = async () => {
  throw new Error("network down");
};
let networkError = null;
try {
  await syncUser("u1", "https://calendar.google.com/calendar/ical/x/private-1/basic.ics");
} catch (error) {
  networkError = error;
}
check("an unreachable host becomes a readable message", networkError instanceof FeedError, networkError?.message);

globalThis.fetch = async () => ({ ok: false, status: 404, headers: { get: () => null }, text: async () => "" });
let missing = null;
try {
  await syncUser("u1", "https://calendar.google.com/calendar/ical/x/private-1/basic.ics");
} catch (error) {
  missing = error;
}
check("a 404 explains itself", missing instanceof FeedError && /does not exist/.test(missing.message), missing?.message);

/* -------------------------------------------------------------------- done */

rmSync(scratch, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
