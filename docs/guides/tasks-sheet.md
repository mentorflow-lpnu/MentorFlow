# Tasks sheet and the Ready for Review trigger

← [Guides](README.md) · [feature 1](../features/01-pr-review.md) · code: `services/pr-review/apps-script/tasks-trigger.gs`

## The sheet

| Column | Contents |
|---|---|
| Name | the task title as a link to the GitHub issue (insert a link with `Ctrl+K`, or `=HYPERLINK("url"; "title")`) |
| Story points | not used by the bot |
| Duration | not used by the bot |
| Status | a dropdown: `Not started`, `In Progress`, `Ready for Review`, `Done` |

The header names of the title and Status columns are set in `CONFIG.columns` of the script (Ukrainian and English names are accepted). Column order doesn't matter.

## Installing the script

1. The sheet → **Extensions → Apps Script**.
2. Paste the contents of `services/pr-review/apps-script/tasks-trigger.gs`.
3. Fill in `CONFIG`:
   - `webhookUrl` — `https://<public n8n address>/webhook/mentorflow/tasks`;
   - `secret` — the value of `MF_TASKS_SECRET` from `.env`.
4. Select the `install` function → **Run** → grant the permissions. This creates the edit trigger.
5. Check: select the Status cell of a task row → the `testSelectedRow` function → **Run**. An execution of `mfPrTaskEvents` appears in n8n.

## What the script sends

After every Status change:

```json
{ "secret": "...", "spreadsheet": "Tasks", "sheet": "Sprint 3", "row": 12,
  "title": "Login page", "taskUrl": "https://github.com/org/repo/issues/17",
  "status": "Ready for Review", "previousStatus": "In Progress" }
```

- `In Progress → Ready for Review` → the bot looks up the PR and posts a card.
- Any other change only updates the status of an already published card: once it leaves `Ready for Review`, the card is no longer resent.
- `previousStatus` is known only for a single-cell edit (for example, in the dropdown). Pasting several rows at once doesn't publish cards.

## Linking a PR to a task

Put `Closes #17` (or `Fixes`, `Resolves`) into the PR description, or pick the PR in the issue's Development field. The bot takes the newest open non-draft PR. If none is found, a "no PR is linked" warning goes to the review channel.
