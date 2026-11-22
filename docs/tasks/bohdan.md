# Developer 3 — Bohdan: feedback, analytics, calendar, infrastructure

← [Tasks and progress](README.md) · specs: [feature 3](../features/03-feedback.md), [calendar export in feature 4](../features/04-mentor-panel.md)

Dependencies on others: the `settings` and `meetings` schemas (N1), the `pr_cards` and `absences` schemas (R2), the Discord router (R1).

## B1. Infrastructure

- A Firebase project, Firestore, a service account.
- `docker-compose.yml`: n8n + Grafana.
- Public HTTPS for n8n.
- The Discord application: Interactions Endpoint URL; bot permissions (messages, embeds, reactions, history); Server Members Intent.
- `guides/setup.md`.

**Done when:** anyone on the team brings the environment up from scratch with `guides/setup.md`.

## B2. Schemas

Describe `feedback` and `events` in `schema/`. For `events` — the list of event types every part writes (the types already written by PR review and reminders are in [schema/README.md](../schema/README.md)).

**Done when:** the schemas are published by the end of week 1.

## B3. Google Form

4 sections by the specification:
- role, name;
- a grid of 7 ratings 1–5, difficulty, NPS;
- 5 open questions;
- contact with branching.

Plus a hidden "project / sprint" field. Google email collection is off. `guides/feedback-form.md`.

**Done when:** the form matches the specification and the contact is required only after "Yes…".

## B4. Feedback intake

Apps Script `onFormSubmit` → n8n webhook → validation and normalisation → `feedback`. Without a name and contact the response is stored anonymously.

**Done when:** a response appears in Firestore within seconds.

## B5. Negative feedback

- Rules from `settings`: average ≤ 2.0 or "Team" / "Mentor" / "Project overall" = 1.
- A `negative` flag.
- A card in `mentor-panel`: ratings (low ones highlighted), texts, contact (if allowed), a dashboard button.

**Done when:** a test negative response produces a card and a normal one doesn't.

## B6. Sending the form

On the sprint end date (from `settings`) the bot posts a message to General with the form link, project and sprint prefilled.

**Done when:** the message arrives on the set date with the right link.

## B7. Grafana

- Check the Firestore data source plugin. Fallback: n8n → Google Sheet → Looker Studio.
- The feedback dashboard with every panel from the specification: summary, criteria, difficulty; trend, roles; negative feedback, what to improve, contacts.
- Access for the mentor only.
- `guides/grafana.md`.

**Done when:** the dashboard shows test data on every panel.

## B8. PR and meeting dashboard

Data from `pr_cards`, `absences`, `events`:
- PRs per week;
- time to first review;
- number of Resends;
- absences at meetings.

**Done when:** the panels show test data.

## B9. Calendar export

- The screen behind the menu button (`cal:` prefix): pick a role → a link.
- An n8n webhook serves the role's `.ics` by a link with a secret key: expanded recurrences, exceptions, Zoom, description.
- `guides/calendar.md`.

**Done when:** the link subscribes in Google Calendar with the right meetings, and opened in a browser downloads the file.

## B10. Tests and documentation

- Unit tests of normalisation, the negative detector and `.ics` generation; e2e of feedback intake.
- `features/03-feedback.md` and the export section of `features/04-mentor-panel.md` updated where the implementation changed them.

**Done when:** tests are green and the documentation matches the implementation.
