# Data schemas (Firestore)

← [Overview](../overview.md) · [Tasks](../tasks/README.md)

The contracts between the parts of the project. Each collection is described by its owning part in `docs/schema/<collection>.md`; the other parts only read data by that schema. Only the owner changes a schema, and only after warning its readers.

| Collection | Owning part | Read by | File | Status |
|---|---|---|---|---|
| `pr_cards` | PR review | analytics | [pr_cards.md](pr_cards.md) | described |
| `absences` | reminders | analytics | [absences.md](absences.md) | described |
| `meeting_occurrences` | reminders | analytics | [meeting_occurrences.md](meeting_occurrences.md) | described |
| `meetings` | mentor panel | reminders, calendar | [meetings.md](meetings.md) | draft, awaiting approval |
| `meeting_exceptions` | mentor panel | reminders, calendar | [meeting_exceptions.md](meeting_exceptions.md) | draft, awaiting approval |
| `templates` | mentor panel | — | `templates.md` | not described |
| `announcements` | mentor panel | analytics | `announcements.md` | not described |
| `settings` | mentor panel | all | [settings.md](settings.md) | draft, awaiting approval |
| `access` | mentor panel | — | `access.md` | not described |
| `feedback` | feedback | analytics | `feedback.md` | not described |
| `events` | analytics | all parts write | `events.md` | not described |

## What a collection description contains

- the purpose of the collection;
- the document ID and how it is built;
- fields: name, type, required, example;
- an example document in JSON;
- who writes and who reads;
- indexes, if queries need them.

## Events written by PR review and reminders

Until `events` is described, these parts write documents of the form `{ type, source, at, ...data }`, where `source` is `pr-review` or `reminders`.

| `type` | Data |
|---|---|
| `pr_published` | `cardId`, `pr`, `author`, `roleIds` |
| `pr_unlinked` | `taskUrl`, `taskTitle` |
| `pr_state_changed` | `cardId`, `from`, `to` |
| `pr_resent` | `cardId`, `by` |
| `reminder_sent` | `occurrenceId`, `meetingId`, `minutes` |
| `absence_marked` | `occurrenceId`, `meetingId`, `userId` |
| `meeting_started` | `occurrenceId`, `meetingId`, `absent` |
