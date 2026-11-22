# `meeting_exceptions`

← [Schemas](README.md) · [feature 4](../features/04-mentor-panel.md)

> [!WARNING]
> **Draft, awaiting approval by the mentor panel owner.** The reminder scheduler already reads this schema.

Cancelling or moving one meeting of a series. Changing the whole series is a change to the `meetings` document, not an exception.

**Document ID:** any; `<meetingId>_<date>` is recommended.

| Field | Type | Required | Description |
|---|---|---|---|
| `meetingId` | string | yes | ID in `meetings` |
| `date` | string `YYYY-MM-DD` | yes | the scheduled date being changed |
| `action` | string | yes | `cancel` or `move` |
| `newDate` | string `YYYY-MM-DD` | no | for `move`: the new date (the same date if empty) |
| `newTime` | string `HH:MM` | no | for `move`: the new time |
| `zoomUrl` | string | no | for `move`: a different link for this meeting |

An exception applies to every slot of the series on that day.

```json
{ "meetingId": "daily", "date": "2026-11-24", "action": "move", "newTime": "17:30" }
```

**Written by:** mentor panel. **Read by:** reminders, calendar export.

**Queries:** `date >= <yesterday>` (reminders only need current exceptions).
