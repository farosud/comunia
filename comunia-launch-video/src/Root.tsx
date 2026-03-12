import { Composition } from 'remotion';
import { LaunchVideo } from './LaunchVideo';
import { scenes, transitions } from './styles/theme';

// Total = sum of scenes - sum of transitions
const TOTAL_DURATION =
  scenes.terminal.duration +
  scenes.dashboard.duration +
  scenes.chat.duration +
  scenes.closing.duration -
  transitions.terminalToDashboard -
  transitions.dashboardToChat -
  transitions.chatToClosing;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={TOTAL_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
