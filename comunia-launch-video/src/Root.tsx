import { Composition } from 'remotion';
import { TerminalInstall } from './scenes/TerminalInstall';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="TerminalInstall"
      component={TerminalInstall}
      durationInFrames={192}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
