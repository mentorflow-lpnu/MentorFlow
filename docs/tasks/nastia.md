# Developer 2 — Nastia: mentor panel

← [Tasks and progress](README.md) · spec: [feature 4](../features/04-mentor-panel.md)

Dependencies on others: the Discord router (R1), the `events` schema (B2).

## N1. Schemas

Describe in `schema/` the fields, recurrence types, exceptions and example documents. The most important ones:
- `meetings` — read by reminders and calendar export;
- `settings` — read by every part.

Drafts of `meetings`, `meeting_exceptions` and `settings` already exist; reminders are built on them.

**Done when:** the schemas are published by the end of week 1.

## N2. Menu entry

- The `/mentor` slash command (a registration script).
- A pinned message with an "Open panel" button in `mentor-panel`.
- Access: the `mentor` role or an `access` entry. Others get "No access" in a message only they see.

**Done when:** the mentor opens the menu both ways, and others are refused.

## N3. Menu skeleton

- Main screen: Meetings · Templates · Announcement · Calendar export · Settings · Access.
- Every screen edits the same message; there is a Back button.
- Calendar export sends an action with the `cal:` prefix, handled by the calendar part.

**Done when:** every section can be opened and left with Back.

## N4. Creating meetings

- Wizards:
  - Weekly — Mon–Sun, each day with its own time and participants, a "Same as previous day" button;
  - Every N weeks;
  - One-time.
- Common fields: title, description, Zoom, reminders (30, 5), template, channel, end date.
- A summary before saving → `meetings`.

**Done when:** all three types are saved by the N1 schema.

## N5. Managing meetings

- Upcoming — meetings in the next 7 days.
- Edit / Cancel for one meeting (`meeting_exceptions`) or the whole series.
- On cancel — a message in Meetings.

**Done when:** a moved or cancelled meeting shows correctly in Upcoming.

## N6. Picking participants

- Select menus for roles and people.
- Text input (`@role`, comma-separated names) turned into mentions.
- Anything not found or ambiguous is shown to the mentor before saving.

**Done when:** all three ways give the same result.

## N7. Templates

New, Edit, Delete, view (`templates`). A template fills the N4 wizard. Starter templates: Daily, Demo, Retro, Planning.

**Done when:** a meeting created from a template gets all its fields.

## N8. Announcement

- Channel choice.
- Whom to mention: roles, people, `@everyone` / `@here` with a confirmation.
- Text.
- Preview → Send → an `announcements` document.

**Done when:** the announcement notifies exactly the chosen people.

## N9. Settings

Screens:
- Channels — PR review, Meetings, General, mentor-panel;
- PR — tasks sheet link, label → role, default role, 12 h, emojis;
- Meetings — default reminders, time zone;
- Feedback — form and dashboard links, negative thresholds, sprint end date.

Everything is written to `settings`.

**Done when:** changes are saved by the N1 schema.

## N10. Access

A list of people with access, Add (pick a person), Remove (`access`).

**Done when:** an added member opens the menu and a removed one can't.

## N11. Tests and documentation

- Unit tests of the handlers; e2e of the main scenarios: create a week, cancel a meeting, change a setting.
- `guides/mentor-panel.md` — the mentor's guide to every screen.
- `features/04-mentor-panel.md` updated where the implementation changed it.

**Done when:** tests are green and the documentation matches the implementation.
