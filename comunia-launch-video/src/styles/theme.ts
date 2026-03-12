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
  terminal: { duration: 192 },
  dashboard: { duration: 130 },
  chat: { duration: 372 },
  closing: { duration: 93 },
} as const;

export const transitions = {
  terminalToDashboard: 15,
  dashboardToChat: 10,
  chatToClosing: 12,
} as const;
