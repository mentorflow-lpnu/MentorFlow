# Development

← [Guides](README.md)

## Code structure

```
services/
  common/          shared clients: Firestore REST, Discord REST, GitHub GraphQL, time, settings, events
  discord-router/  the Discord interactions entry point
  pr-review/       PR review (+ apps-script/ for the tasks sheet)
  reminders/       meeting reminders
  <service>/
    src/           logic (ES modules, no external dependencies)
    test/          unit tests (node:test)
    workflows.mjs  the n8n workflows of this service
scripts/           workflow build and helper scripts
test/support/      Firestore / Discord / GitHub mock
test/e2e/          end-to-end test on a real n8n
workflows/         built workflows for import into n8n (generated, don't edit by hand)
```

A new part (for example, the mentor panel) is added as another `services/<name>/` folder with its own `workflows.mjs`; the build picks it up automatically.

## How workflows are built

- Workflows are thin: a trigger (Webhook or Schedule) → a Code node → Respond to Webhook when needed.
- All logic is in `src/*.js`. The build inlines a module with all its relative imports into the Code node. Only relative imports and `node:crypto` are allowed.
- External APIs are called from the Code node through `this.helpers.httpRequest` (`ctx.http` in the code); environment variables through `$env` (`ctx.env`).
- Equal top-level names in different modules of one workflow are not allowed: the build fails on them.

## Commands

| Command | What it does |
|---|---|
| `npm test` | unit tests of all services |
| `npm run e2e` | a real n8n with all workflows against the mocked Firestore, Discord and GitHub |
| `npm run build` | builds `workflows/*.json` from `services/*/workflows.mjs` |
| `npm start [-- --tunnel]` | local n8n with `.env` and all workflows; see [local-run.md](local-run.md) |
| `npm run test:meeting` | a test meeting in Firestore for checking reminders |
| `npm run env:firebase -- <key.json>` | writes `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` (base64) into `.env` |

`npm run e2e` needs n8n 2.x and Node 24. Their paths are set with `N8N_BIN` and `N8N_NODE`.

## Environment

Copy `.env.example` to `.env`. What each part needs:

| Variable | Needed by |
|---|---|
| `DISCORD_BOT_TOKEN`, `DISCORD_BOT_ID` | posting and editing messages, editing deferred replies |
| `DISCORD_BOT_PUBLIC_KEY` | the router's signature check |
| `PR_REVIEW_CHANNEL_ID`, `MEETINGS_CHANNEL_ID` | where cards go, until `settings/main` sets them |
| `DEVELOPER_ROLE_ID`, `DEVOPS_ROLE_ID`, `STUDENT_QA_ID`, `STUDENT_QC_ID` | default label → role map for PR cards |
| `DEFAULT_PR_ROLE_ID` | the role mentioned when no label matches |
| `GITHUB_TOKEN` | PR lookup; fine-grained, read-only Pull requests, Issues, Metadata |
| `MF_TASKS_SECRET` | the tasks sheet event check; the same value goes into the Apps Script `CONFIG` |
| `MF_INTERNAL_URL`, `MF_INTERNAL_SECRET` | router → feature workflow calls |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT` | Firestore in the cloud |
| `NGROK_DOMAIN` | the static ngrok domain for `npm start -- --tunnel` |
| `FIRESTORE_URL`, `FIRESTORE_TOKEN` | the Firestore emulator only (`http://localhost:8080/v1`, `owner`); empty for the cloud |

`USER_ID`, `MENTOR_ROLE_ID`, `EVERYONE_ID` and `STUDENTS_ID` are not read by the current code; they are reserved for the mentor panel.

### Firebase key

Firebase Console → Project settings → Service accounts → **Generate new private key** downloads a JSON file. Then:

```bash
npm run env:firebase -- "C:/Users/<you>/Downloads/<project>-xxxx.json"
```

The script checks the file, writes both variables into `.env` and prints nothing secret. Delete the downloaded file afterwards.

## n8n settings

n8n doesn't read `.env` by itself: the variables must be in the environment of the n8n process (for example `node --env-file=.env <n8n>` or `env_file` in Docker Compose). Besides `.env`, the Code nodes need:

- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — access to `$env`;
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto` — Discord and Google signatures.

## Workflows

| ID | What it does | Trigger |
|---|---|---|
| `mfDiscordRouter` | Discord interactions entry point | Webhook `mentorflow/discord` |
| `mfPrTaskEvents` | tasks sheet event → PR card | Webhook `mentorflow/tasks` |
| `mfPrStateCheck` | card state, reactions, Resend after 12 h | every 10 min (+ Webhook `mentorflow/pr/check` for tests) |
| `mfPrInteractions` | the Resend button | Webhook `mentorflow/internal/pr` |
| `mfReminderTick` | reminders 30 and 5 min before, meeting start | every minute (+ Webhook `mentorflow/reminders/tick` for tests) |
| `mfReminderInteractions` | "I can't attend today", the status form, OK | Webhook `mentorflow/internal/mt` |

The test webhooks require the `X-MentorFlow-Secret` header; a custom `now` is accepted only with `MF_ALLOW_NOW=true`.

## Importing into n8n

For every file in `workflows/`:

```bash
n8n import:workflow --input=workflows/mfDiscordRouter.json
n8n publish:workflow --id=mfDiscordRouter
```
