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
const PERSON_STAGGER = 10;
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
