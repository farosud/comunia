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
