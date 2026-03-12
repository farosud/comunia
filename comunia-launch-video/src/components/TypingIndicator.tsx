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
