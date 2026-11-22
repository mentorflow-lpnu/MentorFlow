# `pr_cards`

← [Schemas](README.md) · [feature 1](../features/01-pr-review.md)

One PR card per task. The document lives while the task is in `Ready for Review` and the PR is neither merged nor closed. Re-publishing and Resend overwrite the same document.

**Document ID:** `<owner>__<repo>__issue-<issue number>` in lower case, for example `mentorflow-lpnu__mentorflow__issue-17`. If the sheet links a PR directly — `…__pr-<number>`.

| Field | Type | Description |
|---|---|---|
| `task` | map | `{ title, url, sheet, row }` — the task from the sheet |
| `taskStatus` | string | the last task status from the sheet: `Not started`, `In Progress`, `Ready for Review`, `Done` |
| `pr` | map | `{ owner, repo, number, url, title, author }` |
| `roleIds` | array<string> | roles mentioned on the card |
| `channelId` | string | review channel |
| `messageId` | string | the current card message |
| `publishedAt` | timestamp | last publish time; the 12 h countdown starts here |
| `state` | string | `WAITING`, `APPROVED`, `CHANGES_REQUESTED`, `MERGED`, `CLOSED`, `MISSING` |
| `reaction` | string \| null | the bot's reaction on the card (✅ / 🟣 / 🔁) |
| `resendEnabled` | boolean | whether Resend is enabled |
| `resendCount` | integer | how many times the card was resent |
| `active` | boolean | `false` — the card is no longer checked |
| `updatedAt`, `checkedAt` | timestamp | last change and last check |

```json
{
  "task": { "title": "Login page", "url": "https://github.com/mentorflow-lpnu/MentorFlow/issues/17", "sheet": "Sprint 3", "row": 12 },
  "taskStatus": "Ready for Review",
  "pr": { "owner": "mentorflow-lpnu", "repo": "MentorFlow", "number": 42, "url": "https://github.com/mentorflow-lpnu/MentorFlow/pull/42", "title": "Login form", "author": "octocat" },
  "roleIds": ["<student-developer>"],
  "channelId": "<pr-review>",
  "messageId": "1574000000000000001",
  "publishedAt": "2026-11-22T10:00:00Z",
  "state": "WAITING", "reaction": null, "resendEnabled": false, "resendCount": 0, "active": true
}
```

**Written by:** PR review (`mfPrTaskEvents`, `mfPrStateCheck`, `mfPrInteractions`). **Read by:** analytics (PR dashboard).

**Queries:** `active == true` (state check). No index needed.
