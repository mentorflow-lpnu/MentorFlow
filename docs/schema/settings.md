# `settings`

← [Schemas](README.md) · [feature 4](../features/04-mentor-panel.md)

> [!WARNING]
> **Draft.** Only the part read by PR review and reminders (`channels`, `pr`, `meetings`) is settled. The `feedback` section is added by the mentor panel and feedback parts.

A single document **`settings/main`** with all bot settings. Missing fields fall back to the defaults in `services/common/src/settings.js`, so the document may be empty or partial.

| Field | Type | Default | Read by |
|---|---|---|---|
| `channels.prReview` | string | `PR_REVIEW_CHANNEL_ID` | PR review |
| `channels.meetings` | string | `MEETINGS_CHANNEL_ID` | reminders |
| `channels.general` | string | — | mentor panel, feedback |
| `channels.mentorPanel` | string | — | mentor panel, feedback |
| `pr.labelRoles` | map<string, string> | `dev`, `devops`, `qa`, `qc` → `DEVELOPER_ROLE_ID`, `DEVOPS_ROLE_ID`, `STUDENT_QA_ID`, `STUDENT_QC_ID` | PR review: GitHub label → Discord role ID; label case is ignored; stored entries are added to the defaults |
| `pr.defaultRoleIds` | array<string> | `DEFAULT_PR_ROLE_ID` | PR review: roles when no label matches |
| `pr.resendAfterHours` | integer | `12` | PR review |
| `pr.emojis` | map | `{ approved: "✅", merged: "🟣", changesRequested: "🔁" }` | PR review |
| `meetings.reminders` | array<integer> | `[30, 5]` | reminders |
| `meetings.timezone` | string | `Europe/Kyiv` | reminders, calendar export |
| `feedback.*` | — | — | feedback |

```json
{
  "channels": { "prReview": "<id>", "meetings": "<id>" },
  "pr": { "labelRoles": { "dev": "<id>", "design": "<id>" }, "defaultRoleIds": ["<id>"], "resendAfterHours": 12 },
  "meetings": { "reminders": [30, 5], "timezone": "Europe/Kyiv" }
}
```

**Written by:** mentor panel (Settings). **Read by:** all parts.
