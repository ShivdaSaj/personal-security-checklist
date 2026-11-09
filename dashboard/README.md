# Defense Console

A customizable, visual dashboard for the Personal Security Checklist. It takes its ideas from
[digital-defense.io](https://digital-defense.io/) and builds its content from
`../personal-security-checklist.yml`.

## Features

- **Dashboard** with a weighted security score gauge (grades A to F), progress rings by priority, a
  coverage radar across sections, a "security matrix" heatmap with one tile per action, score
  history, and a list of the next best actions.
- **Checklist** for each section and for all sections at once. You can tick items, mark them as
  not applicable, filter by status and priority, search, sort, bulk-complete, expand items and get
  a permalink to any item.
- **Customization**:
  - Threat-model presets: Everyday, Enthusiast and High-risk.
  - Score weights for each priority.
  - Per-item priority overrides.
  - Private notes on any item.
  - Custom items and custom sections.
  - Hide sections you don't need.
  - Dark, light or system theme, plus an accent colour.
- **Data**: export and import a JSON backup, export a CSV report or a Markdown checklist, or print
  the page.
- **Search**: press `/` to search all 258 actions with the keyboard.
- **Privacy**: there are no external requests, no trackers and no accounts. All state stays in
  `localStorage`, and a strict CSP is set.

## Run locally

```bash
cd dashboard && npm install && npm run build && npx http-server dist
```

## Container

The repository root holds the `Dockerfile` and `docker-compose.yml`. The image builds the static
site with Node and serves it with unprivileged nginx on port 8080.

```bash
docker compose up -d --build   # serves on http://localhost:8088
```

When `personal-security-checklist.yml` changes, rebuild the image to pick up the new content.

### Hostinger VPS / Traefik

`deploy/docker-compose.hostinger.yml` needs no image build. A one-shot `node` container downloads
the app and checklist from GitHub (`SOURCE`), builds the site into a volume, and a read-only,
unprivileged nginx serves it behind Traefik at `personal-checklist.sajinshivdas.online`. Restart
the project to pick up new commits.

### Newsletter sign-up (footer)

The footer's subscribe form posts `{"email": "..."}` to `/api/subscribe`. In the Traefik deployment
that path is routed to the `subscribe-api` service (`server/subscribe.mjs`), which validates the
address and emails a notification to `MAIL_TO` (default `sajin@sajinshivdas.com`) over SMTP.
Nothing is stored. The API only accepts a single plain ASCII address (no display names, lists,
quotes, IP literals or line breaks), caps the body at 1 KB, ignores repeat sign-ups for 24 hours,
rate-limits each IP to 5 attempts per 15 minutes and sends at most 60 notifications an hour. A
hidden honeypot field silently drops bot submissions. The browser runs the same check before sending.

Set the mailbox credentials in the Docker project's environment (`.env`), not in the compose file:

```
SMTP_USER=newsletter@sajinshivdas.com
SMTP_PASS=<mailbox password>
```

Optional: `MAIL_TO`, `SMTP_HOST` (default `smtp.hostinger.com`), `SMTP_PORT` (default `465`),
`SMTP_FROM` (default `SMTP_USER`). Without credentials the API answers 503 and the form shows
"temporarily unavailable". The plain `Dockerfile` / `docker-compose.yml` build serves the static
site only, so there nginx answers `/api/` with the same 503.

Run the API tests with `cd server && npm ci && npm test`.
