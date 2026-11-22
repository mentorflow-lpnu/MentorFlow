# Running locally

← [Guides](README.md)

A local n8n on this computer plus a temporary public tunnel, so Discord and the tasks sheet can reach it. Nothing is deployed.

## Once

1. Fill in `.env` (see [development.md](development.md#environment)); the Firebase key goes in with `npm run env:firebase -- <key.json>`.
2. Set up ngrok (a free account gives one permanent domain, so the URL never changes):
   1. Sign up at https://dashboard.ngrok.com/signup.
   2. Install the client and open a new terminal:

      ```powershell
      winget install --id Ngrok.Ngrok
      ```

   3. Dashboard → **Your Authtoken** → copy, then save it in the ngrok config (not in `.env`):

      ```powershell
      ngrok config add-authtoken <token>
      ```

   4. Dashboard → **Domains** → your free static domain (`<name>.ngrok-free.app`) → put it into `.env` as `NGROK_DOMAIN=<name>.ngrok-free.app`.

Without `NGROK_DOMAIN` the script falls back to a Cloudflare quick tunnel (`winget install --id Cloudflare.cloudflared`, no account, a new URL on every start). It needs `api.trycloudflare.com` to be reachable from your network.

## Every run

```powershell
npm start -- --tunnel
```

The script checks `.env`, opens the tunnel, builds the workflows, imports and publishes them into a local n8n (data in `.n8n/`) and starts n8n with the variables from `.env`. When everything answers, it prints:

```
MentorFlow is running
  n8n editor            http://localhost:5678
  Discord endpoint URL  https://<name>.ngrok-free.app/webhook/mentorflow/discord
  Tasks sheet webhook   https://<name>.ngrok-free.app/webhook/mentorflow/tasks
```

The first time (with ngrok — only once, the domain stays the same):

1. **Discord:** [Developer Portal](https://discord.com/developers/applications) → the application → General Information → **Interactions Endpoint URL** = the Discord endpoint URL → **Save Changes**. Discord checks it right away, so the script must be running.
2. **Tasks sheet:** Extensions → Apps Script → `CONFIG.webhookUrl` = the tasks sheet webhook → save → run `install` (see [tasks-sheet.md](tasks-sheet.md)).

Stop everything with **Ctrl+C**. Logs: `logs/n8n.log`, `logs/tunnel.log`.

On the first visit `http://localhost:5678` asks to create a local n8n owner account; it only protects the editor on this computer. The workflows run without it.

Without `--tunnel` n8n runs only on `localhost`: enough to look at the workflows, but Discord buttons and the sheet can't reach it.

## Testing feature 1 — PR review

1. In the team repository: an issue, and a PR with `Closes #<issue>` in the description and a label (`dev`, `devops`, `qa`, `qc`).
2. In the sheet: a row whose Name links to the issue; set Status `In Progress`, then `Ready for Review`.
3. Expected: a PR card in the review channel with the role mention, author, `+/−` lines and Open task · Resend · Open PR.
4. Approve or merge the PR → within 10 minutes the card gets ✅ or 🟣.
5. A row linking an issue without a PR → the "no PR is linked" warning.

## Testing feature 2 — reminders

Until the mentor panel exists, a test meeting is created by a script. It mentions only `USER_ID`, so nobody else gets pinged:

```powershell
npm run test:meeting
```

The meeting starts in 35 minutes; the script prints when each reminder will arrive. A faster run, starting in 8 minutes with reminders 5 and 2 minutes before:

```powershell
npm run test:meeting -- --in 8 --reminders 5,2
```

Expected in the Meetings channel:
1. Reminder cards with Join and "I can't attend today".
2. "I can't attend today" → a status form → "Saved…"; on the second card the form opens prefilled.
3. At the start time — "Meeting started. Absent today (1)" with your status, Join and OK; OK adds "Seen by".

Remove the test meeting afterwards:

```powershell
npm run test:meeting -- --delete
```
