import { visualCsv, visualTable, type VisualSpec } from "@/lib/assistant/visuals/spec";

export function fileSlug(title: string): string {
    return (
        title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "visuel"
    );
}

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadCsv(spec: VisualSpec) {
    download(new Blob([visualCsv(spec)], { type: "text/csv;charset=utf-8" }), `${fileSlug(spec.title)}.csv`);
}

/** Tab-separated, so a paste lands in Excel / Sheets as cells. */
export async function copyAsTable(spec: VisualSpec): Promise<boolean> {
    const { header, rows } = visualTable(spec);
    const text = [header, ...rows].map((r) => r.map((v) => (v === null ? "" : String(v))).join("\t")).join("\n");
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/** Charts drawn as one recharts SVG can be exported as an image. */
export function canExportPng(spec: VisualSpec): boolean {
    return spec.kind === "line" || spec.kind === "area" || spec.kind === "bar" || spec.kind === "donut";
}

const VAR_REF = /var\((--[\w-]+)(?:,[^)]*)?\)/g;

/**
 * Renders the chart's SVG onto a canvas under its title (2×, on the surface
 * colour) and downloads it. CSS variables are resolved to their values first:
 * a standalone SVG has no stylesheet to resolve them with.
 */
export async function exportPng(root: HTMLElement, spec: VisualSpec): Promise<boolean> {
    const svg = root.querySelector<SVGSVGElement>("svg.recharts-surface");
    if (!svg) return false;
    const styles = getComputedStyle(root);
    const resolve = (value: string) => value.replace(VAR_REF, (_m, name: string) => styles.getPropertyValue(name).trim() || "#888");

    const box = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(box.width));
    clone.setAttribute("height", String(box.height));
    for (const el of [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))]) {
        for (const attr of ["fill", "stroke", "stop-color", "style"]) {
            const v = el.getAttribute(attr);
            if (v && v.includes("var(")) el.setAttribute(attr, resolve(v));
        }
        if (el.tagName.toLowerCase() === "text") el.setAttribute("font-family", styles.fontFamily || "sans-serif");
    }

    const surface = styles.getPropertyValue("--ds-surface").trim() || "#ffffff";
    const ink = styles.getPropertyValue("--ds-ink").trim() || "#111111";
    const ink3 = styles.getPropertyValue("--ds-ink-3").trim() || "#666666";
    const scale = 2;
    const pad = 20;
    const header = spec.subtitle ? 58 : 40;
    const width = Math.max(box.width, 320) + pad * 2;
    const height = box.height + header + pad;

    const image = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
    try {
        await new Promise<void>((ok, fail) => {
            image.onload = () => ok();
            image.onerror = () => fail(new Error("svg"));
            image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;
        ctx.scale(scale, scale);
        ctx.fillStyle = surface;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = ink;
        ctx.font = `600 16px ${styles.fontFamily || "sans-serif"}`;
        ctx.fillText(spec.title, pad, pad + 8);
        if (spec.subtitle) {
            ctx.fillStyle = ink3;
            ctx.font = `12px ${styles.fontFamily || "sans-serif"}`;
            ctx.fillText(spec.subtitle, pad, pad + 28);
        }
        ctx.drawImage(image, pad, header, box.width, box.height);
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
        if (!blob) return false;
        download(blob, `${fileSlug(spec.title)}.png`);
        return true;
    } catch {
        return false;
    } finally {
        URL.revokeObjectURL(url);
    }
}
