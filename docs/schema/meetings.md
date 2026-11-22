# `meetings`

← [Schemas](README.md) · [feature 4](../features/04-mentor-panel.md), [feature 2](../features/02-meeting-reminders.md)

> [!WARNING]
> **Draft, awaiting approval by the mentor panel owner.** The reminder scheduler (`services/reminders/src/schedule.js`) is already built on this schema and must be adjusted if it changes.

A meeting or a meeting series that the mentor creates in the menu. One series is one document.

**Document ID:** any, for example an automatic Firestore ID.

| Field | Type | Required | Description |
|---|---|---|---|
| `active` | boolean | yes | `false` — the series is deleted or paused |
| `type` | string | yes | `weekly`, `interval` (every N weeks), `once` |
| `slots` | array<map> | yes | when and who; see below |
| `zoomUrl` | string | yes | call link |
| `title` | string | no | title (General Meeting) |
| `description` | string | no | description, agenda |
| `reminders` | array<integer> | no | minutes before the start; defaults to `settings` (`[30, 5]`) |
| `channelId` | string | no | reminder channel; defaults to Meetings from `settings` |
| `timezone` | string | no | defaults to `settings` (`Europe/Kyiv`) |
| `startDate`, `endDate` | string `YYYY-MM-DD` | no | series bounds; `startDate` is required for `interval`, weeks are counted from it |
| `everyWeeks` | integer | for `interval` | N in "every N weeks" |
| `templateId` | string | no | the template it was created from |

**`slots`** element:

| Field | Type | For type | Description |
|---|---|---|---|
| `weekday` | string | `weekly`, `interval` | `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` |
| `date` | string `YYYY-MM-DD` | `once` | meeting date |
| `time` | string `HH:MM` | all | start time |
| `roleIds` | array<string> | all | participant roles |
| `userIds` | array<string> | all | participant people |

For `weekly` each day has its own slot with its own time and participants, for example "Mon 15:00 mentor + developers, Tue 16:00 developers".

```json
{
  "active": true, "type": "weekly", "title": "Daily", "zoomUrl": "https://zoom.us/j/1",
  "startDate": "2026-11-01", "endDate": "2026-12-31",
  "slots": [
    { "weekday": "mon", "time": "15:00", "roleIds": ["<mentor>", "<student-developer>"], "userIds": [] },
    { "weekday": "tue", "time": "16:00", "roleIds": ["<student-developer>"], "userIds": ["<user>"] }
  ]
}
```

**Written by:** mentor panel. **Read by:** reminders, calendar export.

**Queries:** `active == true`.
