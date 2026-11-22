import { test } from "node:test";
import assert from "node:assert/strict";
import { dueActions, occurrencesBetween } from "../src/schedule.js";
import { buildReminder, buildStart, withSeenBy } from "../src/reminder-card.js";
import { handleMeetingInteraction, tick } from "../src/reminder-service.js";
import { toFirestoreFields } from "../../common/src/firestore.js";
import { createMockApi, httpFor, mockEnv } from "../../../test/support/mock-api.mjs";

const DEFAULTS = { timezone: "Europe/Kyiv", reminders: [30, 5] };
const DEV = "900", MENTOR = "800";
const weekly = {
  id: "daily", active: true, type: "weekly", title: "Daily", zoomUrl: "https://zoom.us/j/1",
  startDate: "2026-11-01", endDate: "2026-12-31",
  slots: [
    { weekday: "mon", time: "15:00", roleIds: [MENTOR, DEV], userIds: [] },
    { weekday: "tue", time: "16:00", roleIds: [DEV], userIds: ["111"] },
  ],
};
const between = (meetings, exceptions, from, to) =>
  occurrencesBetween(meetings, exceptions, new Date(from), new Date(to), DEFAULTS).map((o) => `${o.id}@${o.startsAt}`);

test("weekly: own time and participants per day, repeats every week within the dates", () => {
  const occ = occurrencesBetween([weekly], [], new Date("2026-11-23T00:00:00Z"), new Date("2026-11-25T00:00:00Z"), DEFAULTS);
  assert.deepEqual(occ.map((o) => [o.date, o.startsAt]), [["2026-11-23", "2026-11-23T13:00:00.000Z"], ["2026-11-24", "2026-11-24T14:00:00.000Z"]]);
  assert.deepEqual(occ[1].userIds, ["111"]);
  assert.deepEqual(occ[0].reminders, [30, 5]);
  assert.equal(between([weekly], [], "2027-01-04T00:00:00Z", "2027-01-05T00:00:00Z").length, 0, "after endDate");
});

test("interval: every N weeks from the start date", () => {
  const demo = { id: "demo", active: true, type: "interval", everyWeeks: 2, startDate: "2026-11-26", zoomUrl: "z", slots: [{ weekday: "thu", time: "12:00", roleIds: [DEV] }] };
  const dates = occurrencesBetween([demo], [], new Date("2026-11-20T00:00:00Z"), new Date("2027-01-01T00:00:00Z"), DEFAULTS).map((o) => o.date);
  assert.deepEqual(dates, ["2026-11-26", "2026-12-10", "2026-12-24"]);
});

test("one-time meeting and exceptions: cancel and move", () => {
  const once = { id: "retro", active: true, type: "once", zoomUrl: "z", slots: [{ date: "2026-11-27", time: "18:00", roleIds: [DEV] }] };
  assert.deepEqual(between([once], [], "2026-11-27T00:00:00Z", "2026-11-28T00:00:00Z"), ["retro_2026-11-27_1800@2026-11-27T16:00:00.000Z"]);
  const ex = [
    { meetingId: "daily", date: "2026-11-23", action: "cancel" },
    { meetingId: "daily", date: "2026-11-24", action: "move", newTime: "17:30", zoomUrl: "https://zoom.us/j/2" },
  ];
  const occ = occurrencesBetween([weekly], ex, new Date("2026-11-23T00:00:00Z"), new Date("2026-11-25T00:00:00Z"), DEFAULTS);
  assert.deepEqual(occ.map((o) => [o.id, o.startsAt, o.zoomUrl]), [["daily_2026-11-24_1600", "2026-11-24T15:30:00.000Z", "https://zoom.us/j/2"]]);
});

test("due actions: 30 and 5 minutes, start, never twice, not too late", () => {
  const occ = { startsAt: "2026-11-23T13:00:00.000Z", reminders: [30, 5] };
  const at = (iso, doc) => dueActions(occ, doc, new Date(iso)).map((a) => a.kind === "start" ? "start" : a.minutes);
  assert.deepEqual(at("2026-11-23T12:29:00Z"), []);
  assert.deepEqual(at("2026-11-23T12:30:00Z"), [30]);
  assert.deepEqual(at("2026-11-23T12:31:00Z", { reminderMessages: { 30: "m" } }), []);
  assert.deepEqual(at("2026-11-23T12:55:00Z", { reminderMessages: { 30: "m" } }), [5]);
  assert.deepEqual(at("2026-11-23T13:00:00Z", { reminderMessages: { 30: "m", 5: "n" } }), ["start"]);
  assert.deepEqual(at("2026-11-23T13:20:00Z"), [], "more than 10 minutes late");
  assert.deepEqual(at("2026-11-23T12:45:00Z"), [], "the 30-minute reminder is 15 minutes late");
});

test("cards: text, buttons, start message with and without absences", () => {
  const occ = { id: "o1", startsAt: "2026-11-23T13:00:00.000Z", title: "Daily", zoomUrl: "https://zoom.us/j/1", roleIds: [MENTOR, DEV], userIds: [] };
  const r = buildReminder(occ, 30);
  assert.equal(r.content, `<@&${MENTOR}> <@&${DEV}>! Meeting starts in about 30 minutes`);
  assert.deepEqual(r.components[0].components.map((c) => c.label), ["Join", "I can't attend today"]);
  assert.equal(buildReminder(occ, 5, 2).embeds[0].fields[1].value, "2");
  const empty = buildStart(occ, [], "m5");
  assert.equal(empty.content, "**Meeting started**");
  assert.deepEqual(empty.components[0].components.map((c) => c.label), ["Join"]);
  assert.equal(empty.message_reference.message_id, "m5");
  const full = buildStart(occ, [{ userId: "111", text: "sick" }], "m5");
  assert.equal(full.content, "**Meeting started. Absent today (1):**\n<@111> — sick");
  assert.deepEqual(full.allowed_mentions, { parse: [] });
  assert.deepEqual(full.components[0].components.map((c) => c.label), ["Join", "OK"]);
  assert.equal(withSeenBy(withSeenBy(full.content, ["1"]), ["1", "2"]), `${full.content}\n\nSeen by <@1>, <@2>`);
});

function setup() {
  const mock = createMockApi();
  mock.state.docs.set("settings/main", { channels: { mapValue: { fields: { meetings: { stringValue: "777" } } } } });
  mock.state.docs.set("meetings/daily", toFirestoreFields({ ...weekly, id: undefined }));
  const env = mockEnv("http://mock");
  const ctx = (now) => ({ http: httpFor(mock), env, now: new Date(now) });
  return { mock, ctx };
}

const OCC = "daily_2026-11-23_1500";
const user = (id, nick) => ({ member: { nick, user: { id, username: `u${id}` } } });

test("tick + buttons: two reminders, shared status, summary at start", async () => {
  const { mock, ctx } = setup();
  await tick(ctx("2026-11-23T12:30:00Z"));
  await tick(ctx("2026-11-23T12:30:30Z"));
  assert.equal(mock.channelMessages("777").length, 1, "no duplicates");
  const first = mock.channelMessages("777")[0];
  assert.match(first.content, /about 30 minutes/);

  const modal = await handleMeetingInteraction(ctx("2026-11-23T12:40:00Z"), { type: 3, data: { custom_id: `mt:absent:${OCC}` }, ...user("111", "Olena") });
  assert.equal(modal.type, 9);
  assert.equal(modal.data.components[0].components[0].value, undefined);
  const saved = await handleMeetingInteraction(ctx("2026-11-23T12:41:00Z"), {
    type: 5, data: { custom_id: `mt:absentform:${OCC}`, components: [{ type: 1, components: [{ type: 4, custom_id: "status", value: "finished login, blockers: none" }] }] },
    ...user("111", "Olena"),
  });
  assert.match(saved.data.content, /Saved/);

  await tick(ctx("2026-11-23T12:55:00Z"));
  const second = mock.channelMessages("777")[1];
  assert.match(second.content, /about 5 minutes/);
  assert.equal(second.embeds[0].fields[1].value, "1", "marked absent count");
  const prefilled = await handleMeetingInteraction(ctx("2026-11-23T12:56:00Z"), { type: 3, data: { custom_id: `mt:absent:${OCC}` }, ...user("111", "Olena") });
  assert.equal(prefilled.data.components[0].components[0].value, "finished login, blockers: none", "same status on the second card");

  await tick(ctx("2026-11-23T13:00:00Z"));
  const start = mock.channelMessages("777")[2];
  assert.equal(start.content, "**Meeting started. Absent today (1):**\n<@111> — finished login, blockers: none");
  assert.equal(start.message_reference.message_id, second.id);
  for (const m of [first, second]) assert.equal(mock.state.messages.get(m.id).components[0].components[1].disabled, true);

  const late = await handleMeetingInteraction(ctx("2026-11-23T13:01:00Z"), { type: 3, data: { custom_id: `mt:absent:${OCC}` }, ...user("222") });
  assert.match(late.data.content, /already started/);
  const ok = await handleMeetingInteraction(ctx("2026-11-23T13:02:00Z"), { type: 3, data: { custom_id: `mt:seen:${OCC}` }, message: start, ...user("800") });
  assert.equal(ok.type, 7);
  assert.match(ok.data.content, /Seen by <@800>$/);
  assert.deepEqual(mock.doc(`meeting_occurrences/${OCC}`).seenBy, ["800"]);
});

test("tick: nobody absent → short start message without mentions", async () => {
  const { mock, ctx } = setup();
  await tick(ctx("2026-11-23T12:55:00Z"));
  await tick(ctx("2026-11-23T13:00:00Z"));
  const start = mock.channelMessages("777").at(-1);
  assert.equal(start.content, "**Meeting started**");
  assert.deepEqual(start.allowed_mentions, { parse: [] });
});
