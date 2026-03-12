# Comunia Launch Video — Design Spec

## Overview

A 25-second, fast-paced launch/demo video for **comunia.chat** built with Remotion. The video shows the "zero to value" story: install the CLI → see the dashboard → watch the AI agent match community members for dinner. Designed for landscape social media (Twitter/X, YouTube) with timing built to sync with a beat track added later.

## Format

- **Resolution:** 1920x1080 (16:9 landscape)
- **FPS:** 30
- **Duration:** 25 seconds (750 frames)
- **Output:** MP4

## Visual Style — Warm Editorial

- **Background:** Cream/warm off-whites (`#faf8f5`, `#f0ece4`)
- **Text:** Dark brown/charcoal (`#1a1a1a`)
- **Accents:** Earth tones — warm brown (`#8b7355`), terracotta (`#c4956a`), soft gold (`#d4a574`)
- **Agent accent:** Soft purple (`#8b5cf6`) for the Comunia bot messages
- **Fonts:**
  - Headings/brand: Georgia (serif)
  - UI/chat: System sans-serif (-apple-system, sans-serif)
  - Terminal: Monospace (JetBrains Mono or similar)
- **Chat background:** Telegram-style warm beige (`#e8ddd3`)
- **Vibe:** Notion/Cal.com warmth — human, editorial, not techy

## Scene Breakdown

### Scene 1 — Terminal Install (0s–6s, frames 0–180)

**Content:** Dark terminal showing `npx comunia init` CLI flow.

```
$ npx comunia init

┌ Create your community
│
◆ Community name: Southside Collective
│
◆ Platform: Telegram
│
✔ Agent configured
✔ Dashboard ready on localhost:3001
└
```

**Animation:**
- Characters type one-by-one at ~40 chars/second
- Prompts appear, answers auto-fill after brief pause
- Checkmarks pop in with a subtle scale bounce
- Final line (localhost URL) highlights/glows briefly
- Transition: zoom into the URL → dissolve into dashboard

**Technical:** `TypeWriter` component using `interpolate()` on frame count to reveal characters. Spring animation for checkmarks.

### Scene 2 — Dashboard Glimpse (6s–10s, frames 180–300)

**Content:** Real screenshot of the comunia dashboard at `http://127.0.0.1:3001` with animated stat overlays.

**Layout:** Full-width dashboard screenshot with three stat cards overlaid at the top:
- Members: 47 (counts up from 0)
- Events: 12 (counts up from 0)
- Agent Status: Live (fades in)

**Animation:**
- Screenshot slides in from right
- Stat numbers count up using `interpolate()` with easing
- Subtle slow pan across the dashboard (Ken Burns style, ~20px drift)
- At frame ~280: a Telegram notification badge pulses in the corner
- Transition: zoom into the notification → cut to chat scene

**Technical:** `StatCard` components with `Math.round(interpolate())` for counting. Screenshot as `<Img>` with `transform: scale()` for the pan effect.

### Scene 3 — Telegram Chat (10s–22s, frames 300–660) ⭐ Hero

**Content:** Simulated Telegram group chat in "Southside Collective."

**Chat flow:**

1. **Marco:** "Anyone down for dinner this week? Been wanting to try that new place on 5th"
2. **Comunia ✨:** "Hey Marco! I know a few people who'd be into that:"
   - **Sarah** — mentioned wanting to explore restaurants + loves talking about generative art
   - **Dev** — free Thursday & Friday, deep into AI research
   - **Luna** — asked about dinner plans last week, paints murals
   - [Plan Card] 📅 Thursday 8pm — The Garden Table on 5th / "Want me to check with everyone?"
3. **Marco:** "That's perfect, do it 🙌"

**Animation:**
- Chat background is Telegram-style warm beige (`#e8ddd3`)
- Chat bubbles follow Telegram conventions: other users' bubbles enter from left, sent-side from right
- Marco's first bubble slides in from left with slight bounce (spring animation)
- Brief typing indicator ("Comunia is typing...") with animated dots
- Comunia's bubble enters from left (it's a group chat, agent is another participant)
- Comunia's message builds progressively:
  - First the greeting line
  - Then each person slides in one at a time (staggered ~8 frames apart)
  - The plan card animates in last with a subtle glow/border pulse
- Marco's reply pops in quickly
- Each bubble uses `ChatBubble` component with configurable delay and enter animation

**Technical:** `<Series>` to sequence bubble appearances. Each `ChatBubble` uses `spring()` for enter animation. `PlanCard` has a border glow using animated `box-shadow`. Names use the accent palette for visual distinctiveness.

### Scene 4 — Closing Tag (22s–25s, frames 660–750)

**Content:** Clean brand end card.

```
comunia
AI community manager for Telegram & WhatsApp
npx comunia init
comunia.chat
```

**Animation:**
- Fade in from chat scene (or quick scale transition)
- Logo scales up with spring
- Tagline fades in 6 frames after logo
- Install command fades in next
- URL fades in last
- Hold for ~2 seconds

**Technical:** Staggered `opacity` interpolations on each text element.

## Project Structure

```
comunia-launch-video/
├── src/
│   ├── Root.tsx                  # Composition registration
│   ├── LaunchVideo.tsx           # Main sequence — orchestrates all scenes
│   ├── scenes/
│   │   ├── TerminalInstall.tsx   # Scene 1
│   │   ├── DashboardGlimpse.tsx  # Scene 2
│   │   ├── TelegramChat.tsx      # Scene 3
│   │   └── ClosingTag.tsx        # Scene 4
│   ├── components/
│   │   ├── ChatBubble.tsx        # Chat bubble with spring enter
│   │   ├── TypeWriter.tsx        # Character-by-character reveal
│   │   ├── StatCard.tsx          # Animated counting stat card
│   │   └── PlanCard.tsx          # Suggested plan card in chat
│   ├── styles/
│   │   └── theme.ts              # Colors, fonts, shared design tokens
│   └── assets/
│       └── dashboard-screenshot.png
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

## Dependencies

- `remotion` + `@remotion/cli` — core rendering
- `@remotion/transitions` — slide/fade between scenes
- No external fonts needed (Georgia + system fonts)

## Transitions

Using `@remotion/transitions`:
- Scene 1 → 2: `slide({ direction: "from-right" })` (15 frames)
- Scene 2 → 3: `fade()` (10 frames)
- Scene 3 → 4: `fade()` (12 frames)

## Asset Requirements

- **Dashboard screenshot:** Capture of `http://127.0.0.1:3001` at 1920x1080 (or crop to fit). This is a pre-step — take the screenshot before running `npx remotion render`. Use a placeholder solid color during development if the dashboard isn't running.
- **Audio:** Not included in Remotion build — user adds beat track in post.

## Frame Budget

| Scene | Start Frame | End Frame | Duration |
|-------|------------|-----------|----------|
| Terminal Install | 0 | 180 | 6s |
| Dashboard Glimpse | 180 | 300 | 4s |
| Telegram Chat | 300 | 660 | 12s |
| Closing Tag | 660 | 750 | 3s |
| **Total** | 0 | 750 | **25s** |

## Notes

- Video is designed so timing can be adjusted per-scene by changing frame constants — easy to sync with a specific beat track later
- All text content is defined as constants for easy copy editing
- The Telegram chat is the hero moment — it gets 48% of screen time
- Warm editorial style intentionally contrasts with the dark terminal opening for visual interest
