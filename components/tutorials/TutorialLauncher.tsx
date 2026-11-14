"use client";

// « Voir le tutoriel » in the manager top bar, on every page that has a tutorial.
// Only the route registry ships with the shell; the player (and its media) load on demand.
import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { CirclePlay } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { findTutorial } from "@/lib/tutorials/match";

const loadPlayer = () => import("./TutorialPlayer");
const TutorialPlayer = dynamic(loadPlayer, { ssr: false });

export function TutorialLauncher() {
    // useSearchParams needs a Suspense boundary; the button simply appears once it resolves.
    return (
        <Suspense fallback={null}>
            <Launcher />
        </Suspense>
    );
}

function Launcher() {
    const pathname = usePathname();
    const params = useSearchParams();
    const tutorial = findTutorial(pathname, undefined, params);
    const [openId, setOpenId] = useState<string | null>(null);

    if (!tutorial) return null;
    const open = openId === tutorial.id;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpenId(tutorial.id)}
                // Start fetching the player code as soon as intent is shown.
                onPointerEnter={() => void loadPlayer()}
                onFocus={() => void loadPlayer()}
                aria-haspopup="dialog"
                aria-label={`Voir le tutoriel : ${tutorial.title}`}
                title={`Tutoriel vidéo · ${Math.round(tutorial.durationSec)} s`}
                className={cn(
                    "inline-flex items-center gap-1.5 h-7.5 px-2 sm:px-2.5 rounded-lg border border-line bg-white text-[11.5px] font-semibold text-ink-2 shadow-2xs transition-colors duration-150 hover:text-ink hover:border-line-strong hover:bg-surface-2",
                    FOCUS_RING,
                )}
            >
                <CirclePlay className="size-3.5 shrink-0 text-accent-600" aria-hidden />
                <span className="hidden sm:inline">Voir le tutoriel</span>
            </button>
            {open && <TutorialPlayer tutorial={tutorial} onClose={() => setOpenId(null)} />}
        </>
    );
}
