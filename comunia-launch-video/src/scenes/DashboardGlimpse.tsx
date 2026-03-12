import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors } from '../styles/theme';

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
  const badgeFrame = frame - 100;
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
