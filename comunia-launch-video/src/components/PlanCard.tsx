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
