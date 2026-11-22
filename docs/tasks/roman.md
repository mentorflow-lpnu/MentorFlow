# Developer 1 — Roman: Discord router, PR review, reminders

← [Tasks and progress](README.md) · specs: [feature 1](../features/01-pr-review.md), [feature 2](../features/02-meeting-reminders.md)

Dependencies on others: Firebase credentials (B1), the `settings` and `meetings` schemas (N1), the `events` schema (B2).

## R1. Discord router

- One Interactions Endpoint in n8n: Ed25519 signature check, PING answer.
- Forwarding an action to its owner's workflow by `custom_id` prefix or command name: `pr:`, `mt:` → PR review and reminders; `menu:` and `/mentor` → mentor panel; `cal:`, `fb:` → calendar and feedback.
- `guides/discord-router.md`: how to plug a part in.

**Done when:** the endpoint answers PING, rejects forged requests and delivers a test action of each prefix to its workflow.

## R2. Schemas

Describe `pr_cards`, `absences` and `meeting_occurrences` in `schema/`: fields, example documents, who writes and reads.

**Done when:** the schemas are published by the end of week 1.

## R3. Tasks sheet trigger

- An Apps Script in the sheet: Name / Story points / Duration / Status columns.
- Sends every Status change; a card is published only on `In Progress → Ready for Review`.
- The task link comes from the Name cell.
- Sends the event to n8n with a secret.
- `guides/tasks-sheet.md`: how to install the script.

**Done when:** in a test sheet the status change sends an event, and only the right transition publishes a card.

## R4. PR lookup

The GitHub API finds the PR that references the issue (`Closes #N`) and returns the author and avatar, `+/−` lines, labels, the review decision, the state and `merged`. Drafts are skipped; among several PRs the newest open one wins.

**Done when:** a task with a PR returns all fields, a task without one returns "not found".

## R5. PR card

- English text.
- Role mentions by labels (label → role and the default role from `settings`).
- Avatar, a `diff` block with `+N/−M`.
- Buttons Open task · Resend (grey) · Open PR.
- The message "Task … is in Ready for Review, but no PR is linked" with an Open task button.

**Done when:** the card and the warning match the specification, and mentions notify the right roles.

## R6. PR card state

- A `pr_cards` document.
- A check every 10–15 min:
  - reactions ✅ / 🟣 / 🔁;
  - Resend is enabled after 12 h if the PR has no review decision and the task is still in `Ready for Review`;
  - the task left `Ready for Review` or the PR is closed → the card is no longer checked.

**Done when:** every row of the "PR states" table in the specification is covered by a test.

## R7. Resend

Anyone clicks → conditions are re-checked → a new card → the old one is deleted (if that fails, its button is disabled) → a new 12 h countdown.

**Done when:** the channel keeps one current card per PR.

## R8. Reminder scheduler

- Reads `meetings` of three types (weekly, every N weeks, one-time) with `meeting_exceptions`.
- Posts two cards, 30 and 5 min before (or as set in the meeting): participant mentions, title, description, time; Join and "I can't attend today" buttons.
- No duplicates after downtime.

**Done when:** there are tests for the three meeting types, for cancelling and for moving one meeting.

## R9. "I can't attend today"

- Anyone clicks → a Status form.
- The status is saved in `absences` for the meeting and date.
- On the second card the form is prefilled.
- Only the person who clicked sees the reply.

**Done when:** a status from the 30-minute card is visible on the 5-minute card and in the summary.

## R10. Meeting start

- With statuses → "Meeting started. Absent today (N)", author mentions without notifications, Join and OK buttons ("Seen by @…").
- Without statuses → "Meeting started" + Join, no mentions.
- "I can't attend today" is disabled on both cards.

**Done when:** both variants work and OK adds who has seen it.

## R11. Tests and documentation

- Unit tests of the logic; e2e on n8n with mocked GitHub, Discord and Firestore.
- `features/01-pr-review.md` and `features/02-meeting-reminders.md` updated where the implementation changed them.
- `events` documents for every publish, Resend and meeting start.

**Done when:** tests are green and the documentation matches the implementation.

## R12. Launch on a real n8n

- Fill `.env` (Firebase key via `npm run env:firebase`).
- Start n8n with the variables from `.env` and the settings from the [development guide](../guides/development.md); import and publish the six workflows.
- A public HTTPS address (a tunnel or a domain) → the Interactions Endpoint URL in the Developer Portal and `webhookUrl` in the sheet script.

**Done when:** Discord saves the Interactions Endpoint URL and `testSelectedRow` in the sheet produces an `mfPrTaskEvents` execution.

## R13. Live check

- Feature 1: a task with a linked PR → a card in `pr-review` with the right mention; approve / merge → a reaction within 10 min; a task without a PR → the warning.
- Feature 2: a test meeting in `meetings` → reminders at 30 and 5 min → a status via "I can't attend today" → the start summary → OK.

**Done when:** both scenarios pass on the team's Discord server.
