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
