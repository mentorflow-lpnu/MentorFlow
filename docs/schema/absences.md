# `absences`

← [Schemas](README.md) · [feature 2](../features/02-meeting-reminders.md)

One person's "I can't attend today" status for one meeting. Shared by both reminder cards.

**Document ID:** `<occurrenceId>_<discordUserId>`, so a person has at most one status per meeting and submitting the form again overwrites it.

| Field | Type | Description |
|---|---|---|
| `occurrenceId` | string | ID in `meeting_occurrences` |
| `meetingId` | string | ID in `meetings` |
| `date` | string | meeting date (`YYYY-MM-DD`) |
| `userId` | string | Discord ID |
| `userName` | string | server nickname at the time of the status |
| `text` | string | the status (up to 1000 characters) |
| `updatedAt` | timestamp | last change |

```json
{ "occurrenceId": "daily_2026-11-23_1500", "meetingId": "daily", "date": "2026-11-23", "userId": "111", "userName": "Olena", "text": "sick, PR #42 waits for review", "updatedAt": "2026-11-23T12:41:00Z" }
```

**Written by:** reminders. **Read by:** reminders (the start summary), analytics (attendance dashboard).

**Queries:** `occurrenceId == X`.

> [!IMPORTANT]
> Open question: how long to keep statuses — delete after the meeting or keep them for statistics. Currently they are kept.
