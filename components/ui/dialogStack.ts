type Layer = {
    panel: HTMLElement;
    priority: number;
    modal: boolean;
    close: () => void;
    focus: "panel" | "first";
};

const focusableSelector = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea",
    "summary", "[tabindex]", "[contenteditable=true]",
].join(",");

const layers: Layer[] = [];
let releaseScroll: (() => void) | undefined;

function topLayer() {
    return layers.reduce<Layer | undefined>((top, layer) =>
        !top || layer.priority >= top.priority ? layer : top, undefined);
}

function focusable(panel: HTMLElement) {
    return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest("[hidden], [inert]") &&
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility === "visible");
}

function handleKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) return;
    const top = topLayer();
    if (!top) return;
    if (event.key === "Escape") {
        event.preventDefault();
        top.close();
        return;
    }
    if (event.key !== "Tab" || !top.modal) return;

    const items = focusable(top.panel);
    const first = items[0];
    const last = items.at(-1);
    const active = document.activeElement;
    if (!first) {
        if (top.panel.contains(active)) event.preventDefault();
        return;
    }
    // An editor or select may manage focus in its own portal. Only cycle
    // within the panel when the current tab stop belongs to this dialog.
    if (!top.panel.contains(active)) return;
    if ((event.shiftKey && (active === first || active === top.panel)) || (!event.shiftKey && active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
    }
}

function lockScroll() {
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const workspace = document.querySelector<HTMLElement>(".cw-app-canvas") ?? document.querySelector<HTMLElement>(".cp-main");
    const previousOverflow = workspace?.style.overflowY ?? "";
    const previousPadding = workspace?.style.paddingRight ?? "";
    if (workspace) {
        const scrollbar = workspace.offsetWidth - workspace.clientWidth;
        workspace.style.overflowY = "hidden";
        if (scrollbar > 0) workspace.style.paddingRight = `calc(${getComputedStyle(workspace).paddingRight} + ${scrollbar}px)`;
    }
    return () => {
        document.body.style.overflow = bodyOverflow;
        if (workspace) {
            workspace.style.overflowY = previousOverflow;
            workspace.style.paddingRight = previousPadding;
        }
    };
}

export function registerDialogLayer(layer: Layer) {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (layers.length === 0) document.addEventListener("keydown", handleKeydown);
    layers.push(layer);
    if (layer.modal && !releaseScroll) releaseScroll = lockScroll();
    if (topLayer() === layer) {
        const target = layer.focus === "first" ? focusable(layer.panel)[0] ?? layer.panel : layer.panel;
        target.focus({ preventScroll: true });
    }

    return () => {
        const wasTop = topLayer() === layer;
        const index = layers.indexOf(layer);
        if (index !== -1) layers.splice(index, 1);
        if (layers.length === 0) document.removeEventListener("keydown", handleKeydown);
        if (!layers.some((item) => item.modal)) {
            releaseScroll?.();
            releaseScroll = undefined;
        }
        if (!wasTop) return;
        const next = topLayer();
        queueMicrotask(() => {
            if (topLayer() !== next) return;
            const target = previousFocus?.isConnected && (!next || next.panel.contains(previousFocus))
                ? previousFocus
                : next?.panel;
            target?.focus({ preventScroll: true });
        });
    };
}
