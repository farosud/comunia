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
