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
      currentFrame += Math.ceil(fullText.length / charsPerFrame) + PROMPT_PAUSE_FRAMES;
    } else if (line.type === 'check') {
      currentFrame += 6;
    } else {
      currentFrame += 2;
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
