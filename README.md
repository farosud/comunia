# comunia

**Open-source AI community manager — events, profiling, learning.**

<!-- Badges -->
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)
<!-- ![CI](https://github.com/farosud/comunia/actions/workflows/ci.yml/badge.svg) -->
<!-- ![npm](https://img.shields.io/npm/v/comunia) -->

---

Comunia is an AI agent that manages real communities on Telegram and WhatsApp. It plans events, learns member preferences through passive profiling, researches venues, sends targeted invitations, collects feedback, and gets smarter over time — all with human-in-the-loop admin approval.

Think of it as a tireless community organizer that never sleeps, never forgets a preference, and always follows up.

## Quick Start

```bash
npx comunia init    # Interactive setup wizard — creates .env, agent files, detects groups
docker compose up   # Or: npm run dev
```

No cloning needed — the setup wizard walks you through LLM provider selection, bot token configuration, community settings, and group detection. You will be up and running in under five minutes.

## Features

- **Telegram + WhatsApp support** — First-class Telegram bridge (grammy) and WhatsApp Cloud API. Run one or both simultaneously.
- **AI-powered event planning** — The agent proposes events scored on member interest, recency, logistics, and weather. Top-scoring ideas get promoted automatically.
- **Passive member profiling** — Builds rich profiles from group conversations without surveys. Tracks interests, availability patterns, food preferences, location, and engagement history.
- **Admin approval workflow** — Events follow a `draft -> approved -> announced -> confirmed -> completed` pipeline. Nothing goes out without human sign-off.
- **Live reasoning terminal** — Watch the agent think in real time. Every decision is logged with full chain-of-thought reasoning.
- **Import historical data** — Ingest WhatsApp exports, Telegram JSON exports, or CSV files to bootstrap profiles and context from day one.
- **Research jobs** — Automated cron jobs for venue search, event ideation, subgroup analysis, re-engagement campaigns, and weekly digests.
- **Smart DM targeting** — Selects the right members for each event based on interest scores, availability, and engagement history. Sends personalized invitations.
- **Self-reflection and learning** — Nightly reflection job reviews what worked and what didn't, updating community-level and agent-level memory.
- **Customizable personality** — Edit markdown files to shape the agent's voice, instructions, and accumulated knowledge.

## Architecture

Comunia is a single-process monolith designed for simplicity and easy self-hosting.

```
Telegram / WhatsApp
        |
    [ Bridges ]  ──>  Normalize to unified message format
        |
    [ Router ]   ──>  Classify intent, dispatch to agent or event manager
        |
    [ Agent ]    ──>  LLM-powered core with tools (create event, RSVP, research, DM)
        |
    [ SQLite ]   ──>  Members, events, RSVPs, messages, profiles, memory
        |
    [ Scheduler ]──>  Cron jobs: reminders, digests, research, reflection
        |
    [ Dashboard ]──>  Admin UI for approvals, member profiles, event management
```

**Stack:**
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ / TypeScript |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Telegram | grammy |
| WhatsApp | WhatsApp Cloud API (official) |
| LLM | Claude (Anthropic) or OpenAI — switchable via config |
| Dashboard | Hono + htmx + vanilla JS |
| Scheduling | node-cron |
| CLI | @clack/prompts |

## Project Structure

```
comunia/
├── bin/cli.ts                      # CLI entry point (init, import)
├── src/
│   ├── index.ts                    # Application bootstrap
│   ├── config.ts                   # Environment & configuration
│   ├── health.ts                   # Health monitoring
│   ├── reasoning.ts                # Live reasoning stream
│   ├── agent/
│   │   ├── core.ts                 # Agent loop & tool dispatch
│   │   ├── prompts.ts              # System prompt builder
│   │   ├── scoring.ts              # Event scoring engine
│   │   ├── tools.ts                # Tool definitions (create event, RSVP, research...)
│   │   └── providers/              # LLM provider abstraction
│   │       ├── types.ts            # Provider interface
│   │       ├── claude.ts           # Anthropic Claude provider
│   │       └── openai.ts           # OpenAI provider
│   ├── bridges/
│   │   ├── types.ts                # Unified message types
│   │   ├── telegram.ts             # Telegram bridge (grammy)
│   │   └── whatsapp-cloud.ts       # WhatsApp Cloud API bridge
│   ├── db/
│   │   ├── schema.ts               # Drizzle schema (members, events, RSVPs, messages...)
│   │   ├── index.ts                # Database connection & queries
│   │   └── migrations/             # SQL migrations
│   ├── events/
│   │   ├── manager.ts              # Event lifecycle & approval flow
│   │   └── targeting.ts            # Smart DM targeting
│   ├── memory/
│   │   ├── user-memory.ts          # Per-member profile memory
│   │   └── agent-memory.ts         # Community-level agent memory
│   ├── router/
│   │   └── index.ts                # Intent classification & message routing
│   ├── scheduler/
│   │   ├── index.ts                # Cron registration
│   │   └── jobs/                   # Individual cron jobs
│   │       ├── reminders.ts        # Event reminders (48h, 2h before)
│   │       ├── feedback.ts         # Post-event feedback collection
│   │       ├── digest.ts           # Weekly community digest
│   │       ├── reflection.ts       # Nightly self-reflection
│   │       ├── venue-research.ts   # Venue discovery
│   │       ├── event-ideation.ts   # AI event idea generation
│   │       ├── subgroup-analysis.ts# Interest-based subgroup detection
│   │       ├── profile-enrichment.ts# Profile enrichment from messages
│   │       └── reengagement.ts     # Dormant member re-engagement
│   ├── import/
│   │   ├── index.ts                # Import orchestration
│   │   ├── scanner.ts              # File discovery
│   │   ├── analyzer.ts             # AI-powered profile extraction
│   │   ├── seeder.ts               # Database seeding from imports
│   │   ├── watcher.ts              # Hot-folder watcher
│   │   └── parsers/                # Format-specific parsers
│   │       ├── whatsapp.ts         # WhatsApp export parser
│   │       ├── telegram.ts         # Telegram JSON export parser
│   │       ├── csv.ts              # CSV member/event parser
│   │       └── plaintext.ts        # Generic plaintext parser
│   ├── dashboard/
│   │   ├── server.ts               # Hono HTTP server
│   │   ├── api.ts                  # REST API routes
│   │   └── public/                 # Frontend assets
│   │       ├── index.html          # Dashboard SPA
│   │       ├── app.js              # htmx + vanilla JS
│   │       └── style.css           # Styles
│   └── __tests__/                  # Vitest test suite
├── agent/                          # Personality files (mounted in Docker)
│   ├── soul.md                     # Agent personality & voice
│   ├── agent.md                    # Operational instructions
│   └── memory.md                   # Accumulated community knowledge
├── import/                         # Hot-folder for data imports
│   ├── inbox/                      # Drop files here
│   └── processed/                  # Processed files move here
├── data/                           # SQLite database (auto-created)
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts
├── tsconfig.json
└── package.json
```

## Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Or run `npx comunia init` to generate it interactively.

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | `claude` or `openai` | `claude` |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `OPENAI_API_KEY` | OpenAI API key (if using OpenAI) | — |
| `TELEGRAM_ENABLED` | Enable Telegram bridge | `true` |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | — |
| `TELEGRAM_GROUP_CHAT_ID` | Target group chat ID | — |
| `WHATSAPP_ENABLED` | Enable WhatsApp bridge | `false` |
| `WHATSAPP_PROVIDER` | `cloud_api` | `cloud_api` |
| `COMMUNITY_NAME` | Your community's name | `My Community` |
| `COMMUNITY_LANGUAGE` | Language code (e.g. `es-AR`, `en-US`) | `es-AR` |
| `COMMUNITY_TYPE` | `local`, `distributed`, or `hybrid` | `local` |
| `COMMUNITY_LOCATION` | City/region for local communities | — |
| `ADMIN_USER_IDS` | Comma-separated admin user IDs | — |
| `DASHBOARD_PORT` | Dashboard HTTP port | `3000` |
| `DASHBOARD_SECRET` | Dashboard auth secret | — |

See [`.env.example`](.env.example) for the full list including scheduler cron expressions and rate limits.

## Customization

Comunia's personality and behavior are controlled by three markdown files in the `agent/` directory:

### `agent/soul.md`
Defines *who* the agent is — its personality, tone, and voice. This is the character sheet. Make it warm and natural, or professional and concise. It is included at the top of every LLM prompt.

### `agent/agent.md`
Defines *what* the agent does — operational rules, event planning guidelines, approval policies, and behavioral constraints. This is the instruction manual.

### `agent/memory.md`
Accumulates *what the agent has learned* — community preferences, successful event patterns, venue notes, and member insights. Updated automatically by the nightly reflection job, but you can also edit it manually.

These files are mounted as a Docker volume, so changes take effect without rebuilding.

## Dashboard

<!-- Screenshots: add images to docs/screenshots/ and reference them here -->
<!-- ![Dashboard](docs/screenshots/dashboard.png) -->

The admin dashboard runs on `http://localhost:3000` and provides:

- **Event management** — View, approve, reject, and edit events across all lifecycle stages
- **Member profiles** — Browse AI-generated profiles with interests, engagement scores, and activity history
- **Approval queue** — One-click approve/reject for draft events
- **Message log** — Recent group and DM messages with reasoning traces
- **Agent memory** — View and edit the agent's accumulated knowledge
- **Health status** — System health, LLM usage, and bridge connectivity

Built with htmx for a fast, no-build frontend experience.

## Import Data

Bootstrap your community from existing chat history. Supported formats:

| Format | File Type | What It Imports |
|--------|-----------|-----------------|
| WhatsApp export | `.txt` | Messages, member names, timestamps |
| Telegram export | `.json` | Messages, usernames, reply threads |
| CSV | `.csv` | Members, events, or custom data |
| Plaintext | `.txt` | Generic message logs |

### How to Import

**Option 1: Hot folder** — Drop files into `import/inbox/`. The watcher picks them up automatically, parses them, runs AI analysis to extract profiles, and seeds the database.

**Option 2: CLI** — Run the import command directly:

```bash
npx comunia import path/to/export.txt
```

**Option 3: Bulk** — Place multiple files in the inbox before starting. They will all be processed on boot.

The AI analyzer extracts member interests, activity patterns, relationships, and preferences from raw chat history — so the agent starts with context instead of a blank slate.

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start with tsx watch (auto-reload)
npm test             # Run test suite (vitest)
npm run test:watch   # Run tests in watch mode
npm run build        # TypeScript build to dist/
npm run db:generate  # Generate new migration from schema changes
npm run db:migrate   # Apply pending migrations
```

### Running Tests

```bash
npx vitest run              # All tests
npx vitest run scoring      # Run specific test file
npx vitest --reporter=verbose  # Detailed output
```

## Docker

```bash
# Build and run
docker compose up

# Rebuild after code changes
docker compose up --build

# Run in background
docker compose up -d
```

The Docker setup:
- Builds from Node.js 20
- Exposes the dashboard on port 3000 (localhost only)
- Persists data via volumes: `./data` (SQLite), `./agent` (personality files), `./import` (hot folder)
- Restarts automatically unless stopped

## Contributing

Contributions are welcome. Here is how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/)
6. Open a pull request

### Guidelines

- Write tests for new features and bug fixes
- Keep the single-process monolith architecture — avoid adding external service dependencies
- Use the existing patterns: Drizzle for DB, Hono for HTTP, grammy for Telegram
- Personality and behavior changes go in `agent/*.md`, not in code
- TypeScript strict mode is on — no `any` unless absolutely necessary

## License

[MIT](LICENSE)

---

Built with care for community builders everywhere.
