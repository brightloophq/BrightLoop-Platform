/* =============================================================================
 * Google Calendar operations (F4.2). Provider-neutral in/out.
 * ========================================================================== */

import type { CanonicalConnectorEvent, ConnectorResult, OperationOutput, PollResult } from "@brightloop/domain";
import { callGoogle, type GoogleAdapterConfig } from "./client.js";
import { arr, obj, optNum, optStr, optStrArr, output, reqStr, type OpInput } from "./helpers.js";

const BASE = "https://www.googleapis.com/calendar/v3";
const cal = (input: OpInput, conn: OpInput): string => optStr(input, "calendarId", optStr(conn, "calendarId", "primary"));

export type CalendarHandler = (cfg: GoogleAdapterConfig, token: string | null, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;

function eventBody(input: OpInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (optStr(input, "summary")) body["summary"] = optStr(input, "summary");
  if (optStr(input, "description")) body["description"] = optStr(input, "description");
  if (optStr(input, "start")) body["start"] = { dateTime: optStr(input, "start") };
  if (optStr(input, "end")) body["end"] = { dateTime: optStr(input, "end") };
  const attendees = optStrArr(input, "attendees");
  if (attendees.length > 0) body["attendees"] = attendees.map((email) => ({ email }));
  return body;
}
const normEvent = (e: Record<string, unknown>) => ({ id: optStr(e, "id"), status: optStr(e, "status"), summary: optStr(e, "summary"), htmlLink: optStr(e, "htmlLink") });

export const CALENDAR_OPS: Record<string, CalendarHandler> = {
  "calendar.calendars.list": async (cfg, t) => {
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/users/me/calendarList` });
    if (!res.ok) return res;
    return output({ calendars: arr(res.value["items"]).map((c) => ({ id: optStr(c, "id"), summary: optStr(c, "summary"), primary: c["primary"] === true })) });
  },
  "calendar.events.list": async (cfg, t, input, conn) => {
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/calendars/${encodeURIComponent(cal(input, conn))}/events`, query: { timeMin: optStr(input, "timeMin") || undefined, timeMax: optStr(input, "timeMax") || undefined, maxResults: optNum(input, "maxResults", 25), singleEvents: true, orderBy: "startTime" } });
    if (!res.ok) return res;
    return output({ events: arr(res.value["items"]).map(normEvent), nextSyncToken: optStr(res.value, "nextSyncToken") });
  },
  "calendar.events.create": async (cfg, t, input, conn) => {
    const res = await callGoogle(cfg, t, { method: "POST", url: `${BASE}/calendars/${encodeURIComponent(cal(input, conn))}/events`, query: { sendUpdates: "all" }, jsonBody: eventBody(input) });
    if (!res.ok) return res;
    return output(normEvent(res.value));
  },
  "calendar.events.update": async (cfg, t, input, conn) => {
    const id = reqStr(input, "eventId"); if (!id.ok) return id;
    const res = await callGoogle(cfg, t, { method: "PATCH", url: `${BASE}/calendars/${encodeURIComponent(cal(input, conn))}/events/${encodeURIComponent(id.value)}`, jsonBody: eventBody(input) });
    if (!res.ok) return res;
    return output(normEvent(res.value));
  },
  "calendar.events.delete": async (cfg, t, input, conn) => {
    const id = reqStr(input, "eventId"); if (!id.ok) return id;
    const res = await callGoogle(cfg, t, { method: "DELETE", url: `${BASE}/calendars/${encodeURIComponent(cal(input, conn))}/events/${encodeURIComponent(id.value)}`, query: { sendUpdates: "all" } });
    if (!res.ok) return res;
    return output({ eventId: id.value, deleted: true });
  },
  "calendar.freebusy": async (cfg, t, input, conn) => {
    const timeMin = reqStr(input, "timeMin"); if (!timeMin.ok) return timeMin;
    const timeMax = reqStr(input, "timeMax"); if (!timeMax.ok) return timeMax;
    const res = await callGoogle(cfg, t, { method: "POST", url: `${BASE}/freeBusy`, jsonBody: { timeMin: timeMin.value, timeMax: timeMax.value, items: [{ id: cal(input, conn) }] } });
    if (!res.ok) return res;
    const cals = obj(res.value["calendars"]);
    const busy = arr(obj(cals[cal(input, conn)])["busy"]);
    return output({ calendarId: cal(input, conn), busy: busy.map((b) => ({ start: optStr(b, "start"), end: optStr(b, "end") })) });
  },
  "calendar.events.invite": async (cfg, t, input, conn) => {
    const id = reqStr(input, "eventId"); if (!id.ok) return id;
    const attendees = optStrArr(input, "attendees");
    const res = await callGoogle(cfg, t, { method: "PATCH", url: `${BASE}/calendars/${encodeURIComponent(cal(input, conn))}/events/${encodeURIComponent(id.value)}`, query: { sendUpdates: "all" }, jsonBody: { attendees: attendees.map((email) => ({ email })) } });
    if (!res.ok) return res;
    return output({ id: optStr(res.value, "id"), attendees: arr(res.value["attendees"]).map((a) => optStr(a, "email")) });
  },
};

/** Poll changed events → canonical `calendar.event.changed`. Cursor = nextSyncToken. */
export async function calendarPoll(cfg: GoogleAdapterConfig, token: string | null, conn: OpInput, cursor: string | null, limit: number): Promise<ConnectorResult<PollResult>> {
  const query: Record<string, string | number | boolean | undefined> = { maxResults: limit, singleEvents: true };
  if (cursor) query["syncToken"] = cursor; else query["timeMin"] = cfg.now();
  const res = await callGoogle(cfg, token, { method: "GET", url: `${BASE}/calendars/${encodeURIComponent(optStr(conn, "calendarId", "primary"))}/events`, query });
  if (!res.ok) return res;
  const events: CanonicalConnectorEvent[] = arr(res.value["items"]).map((e) => ({
    type: optStr(e, "status") === "cancelled" ? "calendar.event.cancelled" : "calendar.event.changed",
    externalId: optStr(e, "id"), occurredAt: optStr(e, "updated") || cfg.now(),
    payload: { summary: optStr(e, "summary"), status: optStr(e, "status") }, provenance: "google-calendar:poll",
  })).filter((e) => e.externalId.length > 0);
  const nextCursor = optStr(res.value, "nextSyncToken") || cursor;
  return { ok: true, value: { events, nextCursor } };
}
