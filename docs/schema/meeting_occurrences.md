# `meeting_occurrences`

← [Schemas](README.md) · [feature 2](../features/02-meeting-reminders.md)

One specific meeting, i.e. one day of a series. Created with the first reminder. Stores the IDs of posted cards, so reminders are not duplicated and the start can disable the buttons and reply to the last card.

**Document ID:** `<meetingId>_<date YYYY-MM-DD>_<time HHMM>` — the scheduled date and time, before any move. For example, `daily_2026-11-23_1500`.

| Field | Type | Description |
|---|---|---|
| `meetingId` | string | document ID in `meetings` |
| `date` | string | scheduled date (`YYYY-MM-DD`) |
| `startsAt` | string (ISO) | the actual start, after a move |
| `title` | string \| null | meeting title |
| `zoomUrl` | string \| null | call link |
| `roleIds`, `userIds` | array<string> | participants |
| `channelId` | string | where cards are posted |
| `reminderMessages` | map | `{ "30": "<messageId>", "5": "<messageId>" }` — posted reminders |
| `started` | boolean | "Meeting started" is posted |
| `startMessageId` | string | the start message |
| `seenBy` | array<string> | who clicked OK under the summary |

**Written and read by:** reminders. **May be read by:** analytics (attendance dashboard).
