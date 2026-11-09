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
