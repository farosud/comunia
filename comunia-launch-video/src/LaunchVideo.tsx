import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { fade } from '@remotion/transitions/fade';
import { scenes, transitions } from './styles/theme';
import { TerminalInstall } from './scenes/TerminalInstall';
import { DashboardGlimpse } from './scenes/DashboardGlimpse';
import { TelegramChat } from './scenes/TelegramChat';
import { ClosingTag } from './scenes/ClosingTag';

export const LaunchVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={scenes.terminal.duration}>
        <TerminalInstall />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: 'from-right' })}
        timing={linearTiming({ durationInFrames: transitions.terminalToDashboard })}
      />

      <TransitionSeries.Sequence durationInFrames={scenes.dashboard.duration}>
        <DashboardGlimpse />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: transitions.dashboardToChat })}
      />

      <TransitionSeries.Sequence durationInFrames={scenes.chat.duration}>
        <TelegramChat />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: transitions.chatToClosing })}
      />

      <TransitionSeries.Sequence durationInFrames={scenes.closing.duration}>
        <ClosingTag />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
