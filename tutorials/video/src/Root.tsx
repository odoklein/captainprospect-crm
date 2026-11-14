import { Composition, Folder } from "remotion";
import { TUTORIAL_IDS } from "./manifest.generated";
import { FPS, HEIGHT, WIDTH } from "./timeline";
import { Tutorial, calculateMetadata } from "./Tutorial";

// One template, one composition per captured page. The list comes from the captures
// (capture/capture.ts writes manifest.generated.ts), so the registrations are generated
// on purpose rather than authored one by one.
export const RemotionRoot: React.FC = () => {
    return (
        <Folder name="Manager">
            {TUTORIAL_IDS.map((id) => (
                <Composition
                    key={id}
                    id={id}
                    component={Tutorial}
                    durationInFrames={300}
                    fps={FPS}
                    width={WIDTH}
                    height={HEIGHT}
                    defaultProps={{ id, capture: null }}
                    calculateMetadata={calculateMetadata}
                />
            ))}
        </Folder>
    );
};
