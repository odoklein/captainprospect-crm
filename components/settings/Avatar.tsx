"use client";

// ============================================
// AVATAR — profile picture display + upload (crop dialog).
// Storage: lib/user-avatar.ts. The browser does the heavy lifting: it crops the
// picked image to a square, scales it to OUTPUT_PX and re-encodes it (WebP,
// JPEG fallback), so what reaches the server is a ~20–60 KB data URL.
// ============================================

import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Loader2, Minus, Move, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { myAvatarQueryKey } from "@/lib/query-keys";
import { FOCUS, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/accueil/AccueilUI";

export interface MyAvatar {
    version: string | null;
    url: string | null;
}

export interface AvatarSource {
    image: HTMLImageElement;
    objectUrl: string;
}

export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_PX = 384;
const VIEWPORT_PX = 288;
const MAX_ZOOM = 4;

// ── Data ────────────────────────────────────────────────────────────────────

/** The signed-in user's picture. Shared cache: the sidebar and the settings page read the same entry. */
export function useMyAvatar() {
    const { data: session } = useSession();
    const userId = session?.user?.id;
    return useQuery({
        queryKey: myAvatarQueryKey(userId),
        enabled: Boolean(userId),
        staleTime: 10 * 60 * 1000,
        queryFn: async (): Promise<MyAvatar> => {
            const res = await fetch("/api/users/me/avatar");
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Avatar indisponible");
            return json.data as MyAvatar;
        },
    });
}

/** Upload / remove, keeping every reader of useMyAvatar in sync. Throws with a user-facing message. */
export function useAvatarMutations() {
    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const userId = session?.user?.id;

    const send = useCallback(
        async (init: RequestInit) => {
            const res = await fetch("/api/users/me/avatar", init);
            const json = await res.json().catch(() => null);
            if (!json?.success) throw new Error(json?.error ?? "Enregistrement impossible");
            queryClient.setQueryData<MyAvatar>(myAvatarQueryKey(userId), json.data);
            return json.data as MyAvatar;
        },
        [queryClient, userId],
    );

    return {
        upload: (image: string) =>
            send({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) }),
        remove: () => send({ method: "DELETE" }),
    };
}

// ── Display ─────────────────────────────────────────────────────────────────

export function initialsOf(name: string): string {
    return name.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}

/**
 * Photo when there is one, initials otherwise (also if the image fails to load).
 * Size and radius come from className; `fallbackClassName` paints the initials surface.
 */
export function UserAvatar({
    name,
    src,
    className,
    fallbackClassName = "bg-zinc-950 text-white",
}: {
    name: string;
    src?: string | null;
    className?: string;
    fallbackClassName?: string;
}) {
    const [failed, setFailed] = useState<string | null>(null);
    const showImage = Boolean(src) && failed !== src;
    return (
        <span
            className={cn(
                "relative inline-flex items-center justify-center overflow-hidden flex-shrink-0 select-none font-black",
                !showImage && fallbackClassName,
                className,
            )}
        >
            {showImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- auth-gated API route, not a static asset
                <img src={src!} alt="" className="w-full h-full object-cover" onError={() => setFailed(src ?? null)} draggable={false} />
            ) : (
                <span aria-hidden>{initialsOf(name)}</span>
            )}
        </span>
    );
}

// ── Picking a file ──────────────────────────────────────────────────────────

/** Validates a picked file and loads it, or returns a user-facing error. */
export async function loadAvatarFile(file: File): Promise<AvatarSource | { error: string }> {
    if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
        return { error: "Format non pris en charge — choisissez un PNG, JPEG, WebP ou GIF." };
    }
    if (file.size > MAX_INPUT_BYTES) {
        return { error: "Image trop lourde (10 Mo maximum)." };
    }
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        if (image.naturalWidth < 32 || image.naturalHeight < 32) {
            URL.revokeObjectURL(objectUrl);
            return { error: "Image trop petite (32 px minimum)." };
        }
        return { image, objectUrl };
    } catch {
        URL.revokeObjectURL(objectUrl);
        return { error: "Impossible de lire cette image." };
    }
}

// ── Crop dialog ─────────────────────────────────────────────────────────────

interface Frame {
    zoom: number;
    x: number; // image top-left, relative to the viewport (≤ 0)
    y: number;
}

function clampFrame(f: Frame, base: number, w: number, h: number): Frame {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, f.zoom));
    const dw = w * base * zoom;
    const dh = h * base * zoom;
    return {
        zoom,
        x: Math.min(0, Math.max(VIEWPORT_PX - dw, f.x)),
        y: Math.min(0, Math.max(VIEWPORT_PX - dh, f.y)),
    };
}

function encode(canvas: HTMLCanvasElement): string {
    const webp = canvas.toDataURL("image/webp", 0.86);
    // Browsers without a WebP encoder silently hand back a PNG — use JPEG instead.
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * Square crop with drag-to-move and zoom. The round guide shows how the photo
 * reads in the sidebar; the full square is what's kept (cards use a rounded square).
 */
export function AvatarCropDialog({
    source,
    onCancel,
    onSaved,
}: {
    source: AvatarSource | null;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [saving, setSaving] = useState(false);
    return (
        <Modal
            isOpen={Boolean(source)}
            onClose={() => !saving && onCancel()}
            title="Recadrer votre photo"
            description="Faites glisser l'image pour la centrer, puis ajustez le zoom."
            size="sm"
            className="rounded-3xl"
            contentClassName="p-6"
        >
            {source && (
                // Keyed by image: a new pick starts from a fresh, centred frame.
                <CropBody
                    key={source.objectUrl}
                    source={source}
                    saving={saving}
                    setSaving={setSaving}
                    onCancel={onCancel}
                    onSaved={onSaved}
                />
            )}
        </Modal>
    );
}

function CropBody({
    source,
    saving,
    setSaving,
    onCancel,
    onSaved,
}: {
    source: AvatarSource;
    saving: boolean;
    setSaving: (v: boolean) => void;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const { upload } = useAvatarMutations();
    const w = source.image.naturalWidth;
    const h = source.image.naturalHeight;
    const base = VIEWPORT_PX / Math.min(w, h);
    const [frame, setFrame] = useState<Frame>(() =>
        clampFrame({ zoom: 1, x: (VIEWPORT_PX - w * base) / 2, y: (VIEWPORT_PX - h * base) / 2 }, base, w, h),
    );
    const [error, setError] = useState<string | null>(null);
    const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

    const zoomTo = (zoom: number) =>
        setFrame((f) => {
            // Keep the viewport centre fixed while zooming.
            const c = VIEWPORT_PX / 2;
            const ratio = Math.min(MAX_ZOOM, Math.max(1, zoom)) / f.zoom;
            return clampFrame({ zoom, x: c - (c - f.x) * ratio, y: c - (c - f.y) * ratio }, base, w, h);
        });

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { px: e.clientX, py: e.clientY, x: frame.x, y: frame.y };
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d) return;
        setFrame((f) => clampFrame({ ...f, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, base, w, h));
    };
    const onPointerUp = () => {
        drag.current = null;
    };
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 32 : 8;
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
        };
        if (moves[e.key]) {
            e.preventDefault();
            const [dx, dy] = moves[e.key];
            setFrame((f) => clampFrame({ ...f, x: f.x + dx, y: f.y + dy }, base, w, h));
        } else if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoomTo(frame.zoom + 0.2);
        } else if (e.key === "-") {
            e.preventDefault();
            zoomTo(frame.zoom - 0.2);
        }
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const canvas = document.createElement("canvas");
            canvas.width = OUTPUT_PX;
            canvas.height = OUTPUT_PX;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Votre navigateur ne permet pas de recadrer l'image.");
            const scale = base * frame.zoom;
            ctx.fillStyle = "#ffffff"; // transparent PNGs: white, not black, once in JPEG
            ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(source.image, -frame.x / scale, -frame.y / scale, VIEWPORT_PX / scale, VIEWPORT_PX / scale, 0, 0, OUTPUT_PX, OUTPUT_PX);
            await upload(encode(canvas));
            onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div
                role="application"
                aria-label="Zone de recadrage — flèches pour déplacer, + et − pour zoomer"
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onKeyDown}
                className={cn(
                    "relative mx-auto overflow-hidden rounded-3xl bg-slate-100 cursor-grab active:cursor-grabbing touch-none",
                    FOCUS,
                )}
                style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img
                    src={source.objectUrl}
                    alt=""
                    draggable={false}
                    className="absolute top-0 left-0 max-w-none pointer-events-none select-none"
                    style={{
                        width: w * base * frame.zoom,
                        height: h * base * frame.zoom,
                        transform: `translate(${frame.x}px, ${frame.y}px)`,
                    }}
                />
                {/* Round guide: dims what the sidebar's circle hides. */}
                <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(9,9,11,0.38)] ring-2 ring-white/80" />
                <span className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-zinc-950/70 text-[10px] font-bold text-white whitespace-nowrap">
                    <Move className="w-3 h-3" aria-hidden /> Glisser pour déplacer
                </span>
            </div>

            <div className="flex items-center gap-3">
                <button type="button" onClick={() => zoomTo(frame.zoom - 0.25)} className={cn(SECONDARY_BUTTON, "w-9 px-0")} aria-label="Dézoomer">
                    <Minus className="w-3.5 h-3.5" aria-hidden />
                </button>
                <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={frame.zoom}
                    onChange={(e) => zoomTo(Number(e.target.value))}
                    aria-label="Zoom"
                    className="flex-1 accent-emerald-600 cursor-pointer"
                />
                <button type="button" onClick={() => zoomTo(frame.zoom + 0.25)} className={cn(SECONDARY_BUTTON, "w-9 px-0")} aria-label="Zoomer">
                    <Plus className="w-3.5 h-3.5" aria-hidden />
                </button>
            </div>

            {error && (
                <p role="alert" className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY_BUTTON}>
                    Annuler
                </button>
                <button type="button" onClick={save} disabled={saving} className={PRIMARY_BUTTON}>
                    {saving ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden /> : <ImageUp className="w-4 h-4 text-emerald-400" aria-hidden />}
                    {saving ? "Enregistrement…" : "Enregistrer la photo"}
                </button>
            </div>
        </div>
    );
}

// ── Picker: hidden input + drop + crop dialog, in one hook ──────────────────

/**
 * `open()` shows the file chooser, `pick(file)` takes a dropped file; both lead
 * to the crop dialog. Render `element` once wherever the hook is used.
 */
export function useAvatarPicker({ onSaved, onError }: { onSaved?: () => void; onError: (message: string) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [source, setSource] = useState<AvatarSource | null>(null);

    const close = useCallback(() => {
        setSource((s) => {
            if (s) URL.revokeObjectURL(s.objectUrl);
            return null;
        });
    }, []);

    const pick = useCallback(
        async (file: File | null | undefined) => {
            if (!file) return;
            const loaded = await loadAvatarFile(file);
            if ("error" in loaded) onError(loaded.error);
            else setSource(loaded);
        },
        [onError],
    );

    const element = (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={AVATAR_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                    void pick(e.target.files?.[0]);
                    e.target.value = ""; // picking the same file again must still fire
                }}
            />
            <AvatarCropDialog
                source={source}
                onCancel={close}
                onSaved={() => {
                    close();
                    onSaved?.();
                }}
            />
        </>
    );

    return { open: () => inputRef.current?.click(), pick, element };
}
