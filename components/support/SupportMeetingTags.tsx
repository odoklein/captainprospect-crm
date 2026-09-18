"use client";

import { useEffect, useState } from "react";
import { Calendar, X } from "lucide-react";
import { SUP_LIGHT } from "./supportStyles";
import { supportApi, type UpcomingMeetingDTO } from "@/lib/support/api";

const T = SUP_LIGHT;

interface SupportMeetingTagsProps {
    attachedRefs: string[];
    onAddRef: (label: string) => void;
    onRemoveRef: (label: string) => void;
}

export function SupportMeetingTags({
    attachedRefs,
    onAddRef,
    onRemoveRef,
}: SupportMeetingTagsProps) {
    const [meetings, setMeetings] = useState<UpcomingMeetingDTO[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let active = true;
        supportApi.getUpcomingMeetings().then((list) => {
            if (!active) return;
            setMeetings(list);
            setLoaded(true);
        });
        return () => {
            active = false;
        };
    }, []);

    if (!loaded || meetings.length === 0) return null;

    return (
        <div
            style={{
                display: "flex",
                gap: 6,
                marginBottom: 8,
                flexWrap: "wrap",
                animation: "cpSupSlideDown 0.2s ease both",
            }}
        >
            {meetings.map((m) => {
                const isAttached = attachedRefs.includes(m.label);
                return (
                    <button
                        key={m.id}
                        type="button"
                        onClick={() => (isAttached ? onRemoveRef(m.label) : onAddRef(m.label))}
                        style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: isAttached ? T.brandStrong : T.brandSofter,
                            border: `1px solid ${isAttached ? T.brandStrong : "rgba(99,102,241,0.22)"}`,
                            color: isAttached ? "#FFFFFF" : T.brandStrong,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            transition: "all 150ms ease",
                        }}
                    >
                        <Calendar className="w-3 h-3" />
                        <span>{m.label}</span>
                        {isAttached && <X className="w-3 h-3" />}
                    </button>
                );
            })}
        </div>
    );
}
