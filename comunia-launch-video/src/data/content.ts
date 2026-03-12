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
