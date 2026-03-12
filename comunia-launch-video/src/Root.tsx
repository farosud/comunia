import { Composition } from 'remotion';
import { TerminalInstall } from './scenes/TerminalInstall';
import { DashboardGlimpse } from './scenes/DashboardGlimpse';
import { TelegramChat } from './scenes/TelegramChat';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TerminalInstall"
        component={TerminalInstall}
        durationInFrames={192}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="DashboardGlimpse"
        component={DashboardGlimpse}
        durationInFrames={130}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TelegramChat"
        component={TelegramChat}
        durationInFrames={372}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
