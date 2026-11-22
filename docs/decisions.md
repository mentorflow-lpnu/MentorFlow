# Decisions and open questions

← [Overview](overview.md)

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-16 | Discord instead of Telegram | the team already talks in Discord |
| 2026-11-16 | Minimal personal data; Discord roles define who is who, no registration | less personal data, less setup |
| 2026-11-16 | Feature 1 is triggered when a task moves from `In Progress` to `Ready for Review` in the Google Sheet | the sheet is the team's main task tracker |
| 2026-11-16 | A PR card has three buttons: Open task · Resend · Open PR; Resend becomes available after 12 h | PRs nobody picked up for review don't get lost |
| 2026-11-17 | The meeting schedule is configured only in Discord; Google Calendar only gets an export | every meeting must mention the right people, which a calendar can't do |
| 2026-11-17 | Two reminders, 30 and 5 min before; absence statuses are shared by both cards | — |
| 2026-11-17 | Anyone can press "I can't attend today" and Resend; an OK button under the summary instead of reactions | simple, no extra restrictions |
| 2026-11-17 | Roles mentioned on a PR card come from the PR labels | labels already mark the type of work |
| 2026-11-17 | A task without a linked PR → a "not linked" message in the review channel | the author sees right away that a link is missing |
| 2026-11-17 | The old card is deleted after Resend | one current card per PR in the channel |
| 2026-11-17 | Bot messages and the menu are in English only | — |
| 2026-11-17 | Google Forms for feedback; anonymity is optional; negative feedback is detected by rules | validation and branching without code |
| 2026-11-17 | Firebase Firestore instead of PostgreSQL | Firebase is already available and needs no deployment; the topic asks for cloud services |
| 2026-11-17 | Menu access: the mentor and the people the mentor grants access; entry through `/mentor` and a pinned panel | — |
| 2026-11-17 | Calendar export is an `.ics` subscription link that also downloads the file | the calendar pulls changes by itself |
| 2026-11-17 | Not in the first version: LLM, scheduled announcements, announcement templates, a weekly digest | focus on the core features |
| 2026-11-17 | Each developer owns a separate part; parts connect through the schemas in `docs/schema/` | parallel work without shared tasks |
| 2026-11-22 | Code is split into `services/<part>/` with ES modules bundled into n8n Code nodes | logic is unit-tested outside n8n; workflows stay thin |
| 2026-11-22 | Role IDs from the environment give the default label → role map (`dev`, `devops`, `qa`, `qc`) | PR cards mention teams before the mentor panel exists |

## Consequences of choosing Firestore

- **Queries are simpler than SQL:** no JOINs, and complex filters need indexes. Data is stored in a read-friendly shape.
- **Grafana does not read Firestore out of the box.** It needs the Firestore data source plugin, which must be checked early. Fallback: n8n → Google Sheet → Looker Studio.
- **n8n and Grafana still have to run somewhere** (Docker Compose).

## Open questions

| Question | Feature |
|---|---|
| Exact label names in the repository (`dev` or `developers`, `devops`…) | 1 |
| Final PR state emojis (currently ✅ / 🟣 / 🔁) | 1 |
| How long to keep absence statuses: delete after the meeting or keep them for statistics | 2 |
| Whether the Firestore plugin for Grafana works | 3 |
| An LLM TL;DR of PR changes — see below | 1 |

## Discussion: an LLM TL;DR of PR changes

A PR card could include a short automatic summary of the changes. The first version has none, but the question stays open.

**How it could work:**
1. The bot takes the PR diff, drops lock files and build output, and cuts it to ~12k characters.
2. The model returns 1–2 sentences on what changed and up to three points to look at.
3. Any model with an OpenAI-compatible API works, including a local one.

**To discuss:**
1. Will reviewers read the TL;DR, or are the title, description and line counts enough?
2. The diff is the team's code sent to a third party. Is that acceptable?
3. Cost and free-tier limits.
4. Quality on large PRs where part of the diff is cut.
5. Do we later want automatic review comments from our own models?

| Option | Pros | Cons |
|---|---|---|
| no LLM | no cost, no risk | no change summary |
| free cloud API (Groq, OpenRouter free) | free, fast | limits; code goes to a third party |
| paid API (OpenAI, Anthropic) | best quality | money; code goes to a third party |
| local model (LM Studio, Ollama) | code stays local | needs an always-on machine; weaker quality |
| list of changed files instead of an LLM | simple, no risk | not a summary of the change |
