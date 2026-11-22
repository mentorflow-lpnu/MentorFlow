# MentorFlow documentation

| Section | Contents |
|---|---|
| [overview.md](overview.md) | topic, principles, roles, features in brief, architecture, technologies |
| [features/](features/) | feature specifications: what we build and how it must behave |
| [tasks/](tasks/README.md) | who does what: ownership, contracts, task lists and progress |
| [schema/](schema/README.md) | Firestore collection schemas, the contracts between parts |
| [guides/](guides/README.md) | how to set up, run and use the system |
| [decisions.md](decisions.md) | decisions made and open questions |

## Features

1. [PR review](features/01-pr-review.md)
2. [Meeting reminders](features/02-meeting-reminders.md)
3. [Feedback](features/03-feedback.md)
4. [Mentor panel](features/04-mentor-panel.md)

## Keeping the docs current

- A feature specification is updated by its owner when the implementation changes it.
- New decisions and open questions go to [decisions.md](decisions.md).
- A schema in `schema/` is changed only by the collection owner, after warning its readers.
