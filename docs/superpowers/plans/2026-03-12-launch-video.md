# Comunia Launch Video Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 25-second Remotion video showcasing Comunia's install → dashboard → Telegram AI agent flow.

**Architecture:** Standalone Remotion project (`comunia-launch-video/`) with 4 scene components orchestrated via `TransitionSeries`. Each scene is an independent React component. Shared design tokens live in `theme.ts`. The Telegram chat scene uses reusable `ChatBubble` and `PlanCard` components.

**Tech Stack:** Remotion 4, React, TypeScript, `@remotion/transitions`

**Spec:** `docs/superpowers/specs/2026-03-12-launch-video-design.md`

---

## File Structure

```
comunia-launch-video/
├── src/
│   ├── Root.tsx                     # Composition registration (1920x1080, 30fps, 750 frames)
│   ├── LaunchVideo.tsx              # TransitionSeries orchestrating 4 scenes
│   ├── scenes/
│   │   ├── TerminalInstall.tsx      # Scene 1: CLI typing animation
│   │   ├── DashboardGlimpse.tsx     # Scene 2: Screenshot + animated stat overlays
│   │   ├── TelegramChat.tsx         # Scene 3: Chat bubbles building up
│   │   └── ClosingTag.tsx           # Scene 4: Brand end card
│   ├── components/
│   │   ├── ChatBubble.tsx           # Single chat bubble with spring enter
│   │   ├── TypingIndicator.tsx      # "Comunia is typing..." dots animation
│   │   ├── PlanCard.tsx             # Event plan suggestion card
│   │   └── StatCard.tsx             # Animated counting stat card
│   ├── styles/
│   │   └── theme.ts                 # Colors, fonts, timing constants
│   └── data/
│       └── content.ts               # All text content as constants
├── public/
│   └── dashboard-screenshot.png     # Real screenshot of localhost:3001
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

---

## Chunk 1: Project Setup & Theme

### Task 1: Scaffold Remotion project

**Files:**
- Create: `comunia-launch-video/package.json`
- Create: `comunia-launch-video/tsconfig.json`
- Create: `comunia-launch-video/remotion.config.ts`
- Create: `comunia-launch-video/src/Root.tsx`

- [ ] **Step 1: Create the Remotion project**

Run from `/Users/emilianovelazquez/comunia`:

```bash
npx create-video@latest comunia-launch-video --template blank
```

Select TypeScript when prompted. This scaffolds the project with Remotion pre-configured.

- [ ] **Step 2: Install additional dependencies**

```bash
cd comunia-launch-video
npx remotion add @remotion/transitions
```

- [ ] **Step 3: Verify the project runs**

```bash
npx remotion studio
```

Expected: Remotion Studio opens in browser at `http://localhost:3000` with the blank template.

- [ ] **Step 4: Commit**

```bash
git add comunia-launch-video/
git commit -m "feat: scaffold Remotion project for launch video"
```

### Task 2: Create theme and content constants

**Files:**
- Create: `comunia-launch-video/src/styles/theme.ts`
- Create: `comunia-launch-video/src/data/content.ts`

- [ ] **Step 1: Create theme.ts with all design tokens**

```tsx
// src/styles/theme.ts

export const colors = {
  // Warm editorial palette
  bgCream: '#faf8f5',
  bgWarm: '#f0ece4',
  textDark: '#1a1a1a',
  warmBrown: '#8b7355',
  terracotta: '#c4956a',
  softGold: '#d4a574',
  agentPurple: '#8b5cf6',
  chatBg: '#e8ddd3',
  white: '#ffffff',
  cardBorder: '#e8e0d4',

  // Terminal
  terminalBg: '#1a1a1a',
  terminalText: '#e0e0e0',
  terminalGreen: '#4a8',
  terminalDim: '#888',
} as const;

export const fonts = {
  serif: 'Georgia, serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
} as const;

// Frame timing constants (30fps)
export const FPS = 30;

// Scene durations are padded to compensate for transition overlaps
// so the final rendered video is exactly 750 frames (25s)
// Total = 192 + 130 + 372 + 93 - 15 - 10 - 12 = 750
export const scenes = {
  terminal: { duration: 192 },      // ~6.4s
  dashboard: { duration: 130 },     // ~4.3s
  chat: { duration: 372 },          // 12.4s
  closing: { duration: 93 },        // 3.1s
} as const;

export const transitions = {
  terminalToDashboard: 15, // frames
  dashboardToChat: 10,
  chatToClosing: 12,
} as const;
```

- [ ] **Step 2: Create content.ts with all text**

```tsx
// src/data/content.ts

export const terminalLines = [
  { type: 'command' as const, text: '$ npx comunia init' },
  { type: 'output' as const, text: '' },
  { type: 'output' as const, text: '┌ Create your community' },
  { type: 'output' as const, text: '│' },
  { type: 'prompt' as const, text: '◆ Community name: ', answer: 'Southside Collective' },
  { type: 'output' as const, text: '│' },
  { type: 'prompt' as const, text: '◆ Platform: ', answer: 'Telegram' },
  { type: 'output' as const, text: '│' },
  { type: 'check' as const, text: '✔ Agent configured' },
  { type: 'check' as const, text: '✔ Dashboard ready on localhost:3001' },
  { type: 'output' as const, text: '└' },
];

export const dashboardStats = [
  { label: 'Members', value: 47 },
  { label: 'Events', value: 12 },
  { label: 'Agent Status', value: 'Live', isText: true },
];

export const chatMessages = [
  {
    sender: 'Marco',
    color: '#c4956a',
    text: 'Anyone down for dinner this week? Been wanting to try that new place on 5th',
  },
  {
    sender: 'Comunia ✨',
    color: '#8b5cf6',
    text: 'Hey Marco! I know a few people who\'d be into that:',
    people: [
      { name: 'Sarah', detail: 'mentioned wanting to explore restaurants + loves talking about generative art' },
      { name: 'Dev', detail: 'free Thursday & Friday, deep into AI research' },
      { name: 'Luna', detail: 'asked about dinner plans last week, paints murals' },
    ],
    plan: {
      emoji: '📅',
      title: 'Thursday 8pm',
      venue: 'The Garden Table on 5th',
      cta: 'Want me to check with everyone?',
    },
  },
  {
    sender: 'Marco',
    color: '#c4956a',
    text: 'That\'s perfect, do it 🙌',
  },
];

export const closingCard = {
  brand: 'comunia',
  tagline: 'AI community manager for Telegram & WhatsApp',
  install: 'npx comunia init',
  url: 'comunia.chat',
};
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.ts src/data/content.ts
git commit -m "feat: add theme tokens and content constants"
```

---

## Chunk 2: Scene 1 — Terminal Install

### Task 3: Build the Terminal Install scene

**Files:**
- Create: `comunia-launch-video/src/scenes/TerminalInstall.tsx`

- [ ] **Step 1: Create TerminalInstall.tsx**

Build a dark terminal that types out the `npx comunia init` flow. Use string slicing (not per-character opacity) for the typewriter effect, per Remotion best practices.

```tsx
// src/scenes/TerminalInstall.tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../styles/theme';
import { terminalLines } from '../data/content';

const CHARS_PER_SECOND = 40;
const PROMPT_PAUSE_FRAMES = 8;
const CHECK_BOUNCE_CONFIG = { damping: 12, stiffness: 200 };

export const TerminalInstall: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const charsPerFrame = CHARS_PER_SECOND / fps;

  // Calculate cumulative timing for each line
  let currentFrame = 0;
  const lineTimings: Array<{ startFrame: number; text: string; type: string }> = [];

  for (const line of terminalLines) {
    const fullText = line.type === 'prompt'
      ? line.text + (line as { answer: string }).answer
      : line.text;

    lineTimings.push({
      startFrame: currentFrame,
      text: fullText,
      type: line.type,
    });

    if (line.type === 'command' || line.type === 'prompt') {
      // Typing time + pause
      currentFrame += Math.ceil(fullText.length / charsPerFrame) + PROMPT_PAUSE_FRAMES;
    } else if (line.type === 'check') {
      currentFrame += 6; // Quick pop
    } else {
      currentFrame += 2; // Instant output
    }
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.terminalBg,
        padding: 80,
        justifyContent: 'center',
        fontFamily: fonts.mono,
        fontSize: 22,
        lineHeight: 2,
      }}
    >
      {lineTimings.map((line, i) => {
        const localFrame = frame - line.startFrame;
        if (localFrame < 0) return null;

        if (line.type === 'command' || line.type === 'prompt') {
          const charsVisible = Math.min(
            line.text.length,
            Math.floor(localFrame * charsPerFrame)
          );
          const visibleText = line.text.slice(0, charsVisible);
          const showCursor = charsVisible < line.text.length;

          return (
            <div key={i} style={{ color: colors.terminalText }}>
              {line.type === 'command' && (
                <span style={{ color: colors.terminalDim }}>
                  {visibleText.slice(0, 2)}
                </span>
              )}
              <span style={{ color: '#fff' }}>
                {line.type === 'command' ? visibleText.slice(2) : visibleText}
              </span>
              {showCursor && (
                <span style={{
                  opacity: interpolate(
                    frame % 16,
                    [0, 8, 16],
                    [1, 0, 1],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                  ),
                }}>
                  █
                </span>
              )}
            </div>
          );
        }

        if (line.type === 'check') {
          const scale = spring({
            frame: localFrame,
            fps,
            config: CHECK_BOUNCE_CONFIG,
          });
          return (
            <div
              key={i}
              style={{
                color: colors.terminalGreen,
                transform: `scale(${scale})`,
                transformOrigin: 'left center',
              }}
            >
              {line.text}
            </div>
          );
        }

        // Regular output (box-drawing chars) — fade in
        const opacity = interpolate(localFrame, [0, 3], [0, 1], {
          extrapolateRight: 'clamp',
        });
        return (
          <div key={i} style={{ color: colors.terminalDim, opacity }}>
            {line.text || '\u00A0'}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Verify in Remotion Studio**

Temporarily register the scene in `Root.tsx`:

```tsx
import { Composition } from 'remotion';
import { TerminalInstall } from './scenes/TerminalInstall';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="TerminalInstall"
      component={TerminalInstall}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
```

Run `npx remotion studio` and scrub through. Verify:
- Characters type in sequentially
- Checkmarks bounce in
- Cursor blinks while typing
- Pacing feels fast (adjust `CHARS_PER_SECOND` if needed)

- [ ] **Step 3: Commit**

```bash
git add src/scenes/TerminalInstall.tsx src/Root.tsx
git commit -m "feat: add terminal install scene with typewriter animation"
```

---

## Chunk 3: Scene 2 — Dashboard Glimpse

### Task 4: Create StatCard component

**Files:**
- Create: `comunia-launch-video/src/components/StatCard.tsx`

- [ ] **Step 1: Create StatCard.tsx**

```tsx
// src/components/StatCard.tsx
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Easing } from 'remotion';
import { colors, fonts } from '../styles/theme';

type StatCardProps = {
  label: string;
  value: number | string;
  isText?: boolean;
  delay: number;
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, isText, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });

  const displayValue = isText
    ? value
    : Math.round(
        interpolate(frame - delay, [0, 1.5 * fps], [0, value as number], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.quad),
        })
      );

  return (
    <div
      style={{
        flex: 1,
        background: colors.white,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: 12,
        padding: '20px 24px',
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: colors.warmBrown,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          fontFamily: fonts.sans,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: isText ? colors.terminalGreen : colors.textDark,
          fontFamily: fonts.serif,
          marginTop: 4,
        }}
      >
        {displayValue}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StatCard.tsx
git commit -m "feat: add animated StatCard component"
```

### Task 5: Build the Dashboard Glimpse scene

**Files:**
- Create: `comunia-launch-video/src/scenes/DashboardGlimpse.tsx`
- Create: `comunia-launch-video/public/dashboard-screenshot.png` (placeholder)

- [ ] **Step 1: Capture or create placeholder screenshot**

If the dashboard is running at `http://127.0.0.1:3001`, take a 1920x1080 screenshot and save it to `public/dashboard-screenshot.png`.

If not running, create a placeholder: a solid `#faf8f5` image at 1920x1080. You can replace it later.

- [ ] **Step 2: Create DashboardGlimpse.tsx**

```tsx
// src/scenes/DashboardGlimpse.tsx
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors } from '../styles/theme';
import { dashboardStats } from '../data/content';
import { StatCard } from '../components/StatCard';

export const DashboardGlimpse: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Screenshot slides in from right
  const slideIn = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const translateX = interpolate(slideIn, [0, 1], [200, 0]);

  // Ken Burns pan — subtle 20px drift
  const panX = interpolate(frame, [0, 120], [0, -20], {
    extrapolateRight: 'clamp',
  });

  // Notification badge at end of scene
  const badgeFrame = frame - 100; // appears at ~3.3s into scene
  const badgeScale = badgeFrame > 0
    ? spring({ frame: badgeFrame, fps, config: { damping: 12, stiffness: 200 } })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bgCream }}>
      {/* Dashboard screenshot with pan */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          transform: `translateX(${translateX}px)`,
          opacity: slideIn,
        }}
      >
        <Img
          src={staticFile('dashboard-screenshot.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `translateX(${panX}px) scale(1.02)`,
          }}
        />
      </div>

      {/* Stat cards overlay */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 60,
          right: 60,
          display: 'flex',
          gap: 20,
        }}
      >
        {dashboardStats.map((stat, i) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.isText ? (stat.value as string) : (stat.value as number)}
            isText={stat.isText}
            delay={i * 8}
          />
        ))}
      </div>

      {/* Telegram notification badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 40,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#0088cc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${badgeScale})`,
          boxShadow: '0 4px 20px rgba(0,136,204,0.4)',
        }}
      >
        <span style={{ fontSize: 28 }}>💬</span>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Add to Root.tsx for testing**

Add a second `<Composition>` for `DashboardGlimpse` (120 frames, 30fps, 1920x1080). Verify in Studio: screenshot slides in, stats count up, notification badge pops at the end.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/DashboardGlimpse.tsx public/
git commit -m "feat: add dashboard glimpse scene with stat overlays"
```

---

## Chunk 4: Scene 3 — Telegram Chat (Hero)

### Task 6: Create ChatBubble component

**Files:**
- Create: `comunia-launch-video/src/components/ChatBubble.tsx`

- [ ] **Step 1: Create ChatBubble.tsx**

```tsx
// src/components/ChatBubble.tsx
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../styles/theme';

type ChatBubbleProps = {
  sender: string;
  senderColor: string;
  children: React.ReactNode;
  delay: number;
};

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  sender,
  senderColor,
  children,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - delay;
  if (localFrame < 0) return null;

  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 200 },
  });

  const translateX = interpolate(enter, [0, 1], [-30, 0]);
  const translateY = interpolate(enter, [0, 1], [10, 0]);

  return (
    <div
      style={{
        marginBottom: 12,
        opacity: enter,
        transform: `translateX(${translateX}px) translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          background: colors.white,
          borderRadius: '0 12px 12px 12px',
          padding: '10px 16px',
          display: 'inline-block',
          maxWidth: '80%',
          fontFamily: fonts.sans,
          fontSize: 18,
          lineHeight: 1.5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
      >
        <div
          style={{
            color: senderColor,
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {sender}
        </div>
        {children}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ChatBubble.tsx
git commit -m "feat: add ChatBubble component with spring enter"
```

### Task 7: Create TypingIndicator component

**Files:**
- Create: `comunia-launch-video/src/components/TypingIndicator.tsx`

- [ ] **Step 1: Create TypingIndicator.tsx**

```tsx
// src/components/TypingIndicator.tsx
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../styles/theme';

type TypingIndicatorProps = {
  delay: number;
  duration: number;
};

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ delay, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - delay;
  if (localFrame < 0 || localFrame >= duration) return null;

  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 200 },
  });

  return (
    <div
      style={{
        marginBottom: 12,
        opacity: enter,
        fontFamily: fonts.sans,
        fontSize: 14,
        color: colors.warmBrown,
        fontStyle: 'italic',
      }}
    >
      Comunia is typing
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            opacity: interpolate(
              (localFrame + i * 4) % 18,
              [0, 9, 18],
              [0, 1, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
          }}
        >
          .
        </span>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TypingIndicator.tsx
git commit -m "feat: add typing indicator with animated dots"
```

### Task 8: Create PlanCard component

**Files:**
- Create: `comunia-launch-video/src/components/PlanCard.tsx`

- [ ] **Step 1: Create PlanCard.tsx**

```tsx
// src/components/PlanCard.tsx
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../styles/theme';

type PlanCardProps = {
  emoji: string;
  title: string;
  venue: string;
  cta: string;
  delay: number;
};

export const PlanCard: React.FC<PlanCardProps> = ({ emoji, title, venue, cta, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - delay;
  if (localFrame < 0) return null;

  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 200 },
  });

  const glowIntensity = interpolate(
    localFrame,
    [10, 25, 40],
    [0, 8, 4],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        marginTop: 10,
        padding: '12px 16px',
        background: colors.bgCream,
        borderRadius: 8,
        border: `1px solid ${colors.cardBorder}`,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [10, 0])}px)`,
        boxShadow: `0 0 ${glowIntensity}px rgba(139,92,246,0.3)`,
        fontFamily: fonts.sans,
      }}
    >
      <div style={{ fontSize: 12, color: colors.warmBrown }}>{emoji} Suggested plan</div>
      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600, color: colors.textDark }}>
        {title} — {venue}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, color: colors.terminalDim }}>{cta}</div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PlanCard.tsx
git commit -m "feat: add PlanCard component with glow animation"
```

### Task 9: Build the Telegram Chat scene

**Files:**
- Create: `comunia-launch-video/src/scenes/TelegramChat.tsx`

- [ ] **Step 1: Create TelegramChat.tsx**

This is the hero scene. Chat bubbles appear sequentially with the typing indicator before the agent's response.

```tsx
// src/scenes/TelegramChat.tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../styles/theme';
import { chatMessages } from '../data/content';
import { ChatBubble } from '../components/ChatBubble';
import { TypingIndicator } from '../components/TypingIndicator';
import { PlanCard } from '../components/PlanCard';

// Timing (in frames at 30fps)
const MARCO_MSG1_DELAY = 10;
const TYPING_DELAY = 50;
const TYPING_DURATION = 30;
const AGENT_MSG_DELAY = 80;
const PERSON_STAGGER = 10; // frames between each person appearing
const PLAN_CARD_DELAY = AGENT_MSG_DELAY + 60;
const MARCO_MSG2_DELAY = PLAN_CARD_DELAY + 40;

export const TelegramChat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const marco1 = chatMessages[0];
  const agent = chatMessages[1];
  const marco2 = chatMessages[2];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.chatBg,
        padding: '60px 200px',
        justifyContent: 'center',
      }}
    >
      {/* Group name header */}
      <div
        style={{
          textAlign: 'center',
          color: colors.warmBrown,
          fontSize: 14,
          fontFamily: fonts.sans,
          marginBottom: 24,
          letterSpacing: 0.5,
        }}
      >
        Southside Collective
      </div>

      {/* Marco's first message */}
      <ChatBubble
        sender={marco1.sender}
        senderColor={marco1.color}
        delay={MARCO_MSG1_DELAY}
      >
        <div style={{ color: colors.textDark }}>{marco1.text}</div>
      </ChatBubble>

      {/* Typing indicator */}
      <TypingIndicator delay={TYPING_DELAY} duration={TYPING_DURATION} />

      {/* Agent's message */}
      <ChatBubble
        sender={agent.sender}
        senderColor={agent.color}
        delay={AGENT_MSG_DELAY}
      >
        <div style={{ color: colors.textDark }}>{agent.text}</div>

        {/* People list — staggered */}
        <div style={{ marginTop: 8 }}>
          {agent.people!.map((person, i) => {
            const personDelay = AGENT_MSG_DELAY + 15 + i * PERSON_STAGGER;
            const localFrame = frame - personDelay;
            if (localFrame < 0) return null;

            const enter = spring({
              frame: localFrame,
              fps,
              config: { damping: 200 },
            });

            return (
              <div
                key={person.name}
                style={{
                  padding: '4px 0',
                  opacity: enter,
                  transform: `translateX(${interpolate(enter, [0, 1], [-15, 0])}px)`,
                  fontSize: 17,
                  color: colors.textDark,
                }}
              >
                <strong>{person.name}</strong>
                <span style={{ color: colors.warmBrown }}> — {person.detail}</span>
              </div>
            );
          })}
        </div>

        {/* Plan card — uses absolute frame delay since useCurrentFrame()
             returns the scene-level frame, not relative to ChatBubble */}
        <PlanCard
          emoji={agent.plan!.emoji}
          title={agent.plan!.title}
          venue={agent.plan!.venue}
          cta={agent.plan!.cta}
          delay={PLAN_CARD_DELAY}
        />
      </ChatBubble>

      {/* Marco's reply */}
      <ChatBubble
        sender={marco2.sender}
        senderColor={marco2.color}
        delay={MARCO_MSG2_DELAY}
      >
        <div style={{ color: colors.textDark }}>{marco2.text}</div>
      </ChatBubble>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Test in Studio**

Add `<Composition>` for `TelegramChat` (360 frames). Verify:
- Marco's message appears first
- Typing dots animate
- Agent message builds progressively (greeting → people one by one → plan card)
- Marco's reply pops in at the end
- Plan card has subtle purple glow

- [ ] **Step 3: Commit**

```bash
git add src/scenes/TelegramChat.tsx
git commit -m "feat: add Telegram chat hero scene with staggered bubbles"
```

---

## Chunk 5: Scene 4 — Closing Tag + Final Assembly

### Task 10: Build the Closing Tag scene

**Files:**
- Create: `comunia-launch-video/src/scenes/ClosingTag.tsx`

- [ ] **Step 1: Create ClosingTag.tsx**

```tsx
// src/scenes/ClosingTag.tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../styles/theme';
import { closingCard } from '../data/content';

export const ClosingTag: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 200 } });

  const taglineOpacity = interpolate(frame, [6, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const installOpacity = interpolate(frame, [14, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const urlOpacity = interpolate(frame, [22, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bgCream,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: fonts.serif,
            fontSize: 64,
            fontWeight: 700,
            color: colors.textDark,
            letterSpacing: -2,
            transform: `scale(${logoScale})`,
          }}
        >
          {closingCard.brand}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 20,
            color: colors.warmBrown,
            marginTop: 12,
            letterSpacing: 1,
            opacity: taglineOpacity,
          }}
        >
          {closingCard.tagline}
        </div>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 18,
            color: colors.terracotta,
            marginTop: 24,
            opacity: installOpacity,
          }}
        >
          {closingCard.install}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 15,
            color: colors.terminalDim,
            marginTop: 10,
            opacity: urlOpacity,
          }}
        >
          {closingCard.url}
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/scenes/ClosingTag.tsx
git commit -m "feat: add closing brand card scene"
```

### Task 11: Create the main LaunchVideo composition with transitions

**Files:**
- Create: `comunia-launch-video/src/LaunchVideo.tsx`
- Modify: `comunia-launch-video/src/Root.tsx`

- [ ] **Step 1: Create LaunchVideo.tsx**

```tsx
// src/LaunchVideo.tsx
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { fade } from '@remotion/transitions/fade';
import { scenes, transitions } from './styles/theme';
import { TerminalInstall } from './scenes/TerminalInstall';
import { DashboardGlimpse } from './scenes/DashboardGlimpse';
import { TelegramChat } from './scenes/TelegramChat';
import { ClosingTag } from './scenes/ClosingTag';

export const LaunchVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={scenes.terminal.duration}>
        <TerminalInstall />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: 'from-right' })}
        timing={linearTiming({ durationInFrames: transitions.terminalToDashboard })}
      />

      <TransitionSeries.Sequence durationInFrames={scenes.dashboard.duration}>
        <DashboardGlimpse />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: transitions.dashboardToChat })}
      />

      <TransitionSeries.Sequence durationInFrames={scenes.chat.duration}>
        <TelegramChat />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: transitions.chatToClosing })}
      />

      <TransitionSeries.Sequence durationInFrames={scenes.closing.duration}>
        <ClosingTag />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
```

- [ ] **Step 2: Update Root.tsx with final composition**

```tsx
// src/Root.tsx
import { Composition } from 'remotion';
import { LaunchVideo } from './LaunchVideo';
import { scenes, transitions } from './styles/theme';

// Total = sum of scenes - sum of transitions
const TOTAL_DURATION =
  scenes.terminal.duration +
  scenes.dashboard.duration +
  scenes.chat.duration +
  scenes.closing.duration -
  transitions.terminalToDashboard -
  transitions.dashboardToChat -
  transitions.chatToClosing;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={TOTAL_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
```

- [ ] **Step 3: Test full video in Studio**

```bash
npx remotion studio
```

Verify:
- All 4 scenes play in sequence
- Transitions are smooth (slide for terminal→dashboard, fade for others)
- Total duration is ~25 seconds
- Pacing feels fast and energetic
- No visual glitches at transition boundaries

- [ ] **Step 4: Commit**

```bash
git add src/LaunchVideo.tsx src/Root.tsx
git commit -m "feat: assemble full launch video with transitions"
```

### Task 12: Render final video

- [ ] **Step 1: Render to MP4**

```bash
npx remotion render LaunchVideo out/comunia-launch-video.mp4
```

Expected: renders all frames and outputs MP4 to `out/comunia-launch-video.mp4`.

- [ ] **Step 2: Watch the output**

Open `out/comunia-launch-video.mp4` and verify the full video plays correctly at 25 seconds (750 frames at 30fps).

- [ ] **Step 3: Final commit**

Add `out/`, `node_modules/`, and `.remotion/` to `.gitignore`:

```bash
printf "out/\nnode_modules/\n.remotion/\n" >> .gitignore
git add .gitignore
git commit -m "feat: add gitignore for render output and build artifacts"
```
