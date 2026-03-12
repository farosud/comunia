import { Composition } from 'remotion';

// Temporary placeholder — will be replaced with LaunchVideo composition
const Placeholder: React.FC = () => (
  <div style={{ width: '100%', height: '100%', backgroundColor: '#faf8f5' }} />
);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LaunchVideo"
      component={Placeholder}
      durationInFrames={750}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
