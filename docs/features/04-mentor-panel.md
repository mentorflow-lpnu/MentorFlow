# Feature 4. Mentor panel

← [Overview](../overview.md) · [Tasks](../tasks/README.md)

> [!NOTE]
> The mentor configures the bot directly in Discord, without code or spreadsheets: meetings, templates, announcements, feature settings and access. Any role's schedule can be subscribed to in Google Calendar or another calendar.

## Access and entry

**Access.** The mentor (`mentor` role) and the people the mentor granted access in **Access**. The bot checks access on every action. Others get "No access" in a message only they see.

**Two entry points:**
- the `/mentor` slash command in any channel; only the caller sees the menu (an ephemeral message);
- a pinned message with an "Open panel" button in the private `mentor-panel` channel.

## How the menu works

In Telegram a bot has its own chat with a menu. In Discord a bot lives on a server, so the menu is built from what Discord offers bots:

| Discord element | Use |
|---|---|
| `/mentor` slash command | menu entry; appears in the command list as soon as you type `/` |
| ephemeral message | only the mentor sees the menu |
| buttons | menu items, Back, Save, Cancel |
| select menus | roles, people, channels, weekdays — picked from a Discord list |
| modals | text input: title, description, link, time; up to 5 fields per modal |

**Navigation.** Every screen is the same menu message edited in place. Back returns to the previous screen, so the chat stays clean.

```
/mentor
├── 📅 Meetings
│   ├── Upcoming — meetings in the next 7 days
│   ├── New → Weekly / Every N weeks / One-time
│   ├── Edit → pick a meeting → this meeting or the whole series
│   └── Cancel → pick a meeting → this meeting or the whole series
├── 🧩 Templates — list, New, Edit, Delete
├── 📣 Announcement — channel → whom to mention → text → preview → Send
├── 🗓 Calendar export — pick a role → .ics subscription link
├── ⚙️ Settings
│   ├── Channels — PR review, Meetings, General, mentor-panel
│   ├── PR — tasks sheet, label → role, default role, 12 h, emojis
│   ├── Meetings — default reminders (30, 5), time zone
│   └── Feedback — form and dashboard links, negative thresholds, sprint end date
└── 🔑 Access — Add (pick a person), Remove
```

## Meetings

> [!IMPORTANT]
> The schedule is configured **only in Discord**. Every meeting must mention the right people on the right day, which Google Calendar can't do. The calendar only receives an export.

**Meeting types:**

| Type | Example | What the mentor sets |
|---|---|---|
| **Weekly** — frequent | dailies Mon–Fri | per day: whether there is a meeting, time, participants, link |
| **Every N weeks** — rare | a demo every 2 or 4 weeks | weekday, time, N, date of the first meeting |
| **One-time** | a separate meeting on any day | date, time |

**Meeting fields:**
- required: days or date, start time, participants, Zoom link, reminders (30 and 5 min by default);
- optional: title, description, template, reminder channel (Meetings by default), series end date.

**Participants** are roles and/or people. They are picked from a list, typed with `@` or as comma-separated names, and the bot turns everything into mentions. Anything not found or ambiguous is shown to the mentor before saving. Details are in [feature 2](02-meeting-reminders.md).

**Management:**
- Upcoming — meetings in the next 7 days;
- Edit — one meeting (move it, change the link) or the whole series;
- Cancel — one meeting (a holiday, illness) or the whole series. On cancel the bot posts "Today's meeting is cancelled" to Meetings.

**Example: Weekly**
1. `/mentor` → **Meetings** → **New** → **Weekly**.
2. Modal: title, description, Zoom link, template.
3. Weekday select: Mon–Fri (several allowed).
4. For each day:
   - modal: time;
   - selects: roles and people;
   - a "Same as previous day" button.
5. Week summary → **Save**. The meeting appears in **Upcoming**, and the bot reminds about it as in [feature 2](02-meeting-reminders.md).

> [!NOTE]
> A Discord modal has at most 5 fields, so a week is configured step by step, day by day.

## Templates

A template is a preset for creating a meeting.

| Field | Example |
|---|---|
| template name | Daily |
| meeting title | General Meeting |
| description / agenda | 1. What I did yesterday 2. What I'm doing today 3. Blockers |
| default participants | `@mentor`, `@student-developer` |
| default link | a permanent Zoom link |
| reminders | 30 and 5 min |

Actions: New, Edit, Delete, view. Starter templates: Daily, Demo, Retro, Planning.

## Announcements

1. **Announcement** → channel (General by default).
2. Whom to mention: roles, people, `@everyone` / `@here`. For `@everyone` the bot asks for an extra confirmation.
3. Text.
4. Preview → **Send**. The mentioned people get a notification, and the announcement is saved to `announcements`.

## Settings

| Section | Settings |
|---|---|
| Channels | PR review channel, Meetings, General, `mentor-panel` |
| PR ([feature 1](01-pr-review.md)) | tasks sheet link; label → role; default role; 12 h before Resend; state emojis |
| Meetings ([feature 2](02-meeting-reminders.md)) | default reminders (30 and 5 min); time zone (Europe/Kyiv) |
| Feedback ([feature 3](03-feedback.md)) | form and dashboard links; negative-feedback thresholds; sprint end date |

Everything is stored in `settings`, and a change applies immediately, without code changes.

## Access

A list of people with menu access, Add (pick a person), Remove. Stored in `access`.

## Calendar export

The Calendar export button in the menu sends an action with the `cal:` prefix.

1. Pick a role → the bot gives a permanent link to that role's schedule: `…/calendar/student-developer.ics?key=…`.
2. The link is added to Google Calendar as "From URL" (the same in Outlook and Apple Calendar), and the calendar pulls changes by itself. This is the Google Calendar sync from the project topic.
3. Opened in a browser, the same link downloads an `.ics` file that can be imported or forwarded.
4. `key` is a secret so the schedule isn't public.
5. Events contain the title, time, Zoom link, description and participants as text.

> [!NOTE]
> Google Calendar refreshes URL calendars with a delay of up to several hours. Reminders don't depend on it — the bot posts them.

## Components

| Component | What it does |
|---|---|
| `/mentor` registration | a script that registers the slash command |
| pinned panel | a message with an "Open panel" button in `mentor-panel` |
| n8n: menu | screens, navigation, access check |
| n8n: meeting wizards | create, edit, cancel for all three types |
| n8n: Templates, Announcement, Settings, Access | the corresponding screens |
| n8n: calendar | the role picker + a webhook serving `.ics` |
| Firestore | `meetings`, `meeting_exceptions`, `templates`, `announcements`, `settings`, `access` |

## Not in the first version

- Scheduled announcements.
- Announcement templates.
- A weekly digest for the mentor.
- Ideas for later: a holiday pause, system status, an action log, a test message to the mentor.
