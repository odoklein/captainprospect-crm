"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

// Two looks, chosen on TabsList and inherited by its triggers:
//   default   — pill track, same as the Accueil SegmentedControl
//   underline — text tabs over a hairline, with an indicator that slides to the active tab

type TabsVariant = "default" | "underline";

const TabsVariantContext = React.createContext<TabsVariant>("default");

const tabsListVariants = cva("inline-flex w-fit items-center", {
    variants: {
        variant: {
            default: "h-9 gap-1 rounded-control border border-line bg-surface-3 p-1 text-ink-2",
            underline: "relative h-10 gap-5 border-b border-line text-ink-3",
        },
    },
    defaultVariants: { variant: "default" },
});

const tabsTriggerVariants = cva(
    [
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        FOCUS_RING,
    ],
    {
        variants: {
            variant: {
                default: [
                    "h-full flex-1 rounded-lg px-3 text-xs font-bold text-ink-2 transition-[background-color,color,box-shadow] duration-150 ease-snappy hover:text-ink",
                    "focus-visible:ring-offset-surface-3",
                    "data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_color-mix(in_oklab,var(--ds-shadow-color)_8%,transparent),0_0_0_1px_color-mix(in_oklab,var(--ds-shadow-color)_4%,transparent)]",
                ],
                underline: [
                    "relative h-full rounded-md px-0.5 text-sm font-semibold text-ink-3 transition-colors duration-150 ease-snappy hover:text-ink",
                    "data-[state=active]:text-ink",
                ],
            },
        },
        defaultVariants: { variant: "default" },
    },
);

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
    return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />;
}

/** Moves the underline indicator to the active trigger. Writes styles directly: no re-render per change. */
function useUnderlineIndicator(enabled: boolean) {
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const indicatorRef = React.useRef<HTMLSpanElement | null>(null);

    React.useLayoutEffect(() => {
        const list = listRef.current;
        const indicator = indicatorRef.current;
        if (!enabled || !list || !indicator) return;

        const place = () => {
            const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
            if (!active) {
                indicator.style.opacity = "0";
                return;
            }
            indicator.style.width = `${active.offsetWidth}px`;
            indicator.style.transform = `translateX(${active.offsetLeft}px)`;
            indicator.style.opacity = "1";
        };

        place();
        // First placement without a slide; later moves animate.
        requestAnimationFrame(() => indicator.setAttribute("data-ready", ""));

        const mutations = new MutationObserver(place);
        mutations.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"], childList: true });
        const resize = new ResizeObserver(place);
        resize.observe(list);
        return () => {
            mutations.disconnect();
            resize.disconnect();
        };
    }, [enabled]);

    return { listRef, indicatorRef };
}

function TabsList({
    className,
    variant = "default",
    children,
    ref,
    ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
    const resolved: TabsVariant = variant ?? "default";
    const { listRef, indicatorRef } = useUnderlineIndicator(resolved === "underline");

    const setRefs = React.useCallback(
        (node: HTMLDivElement | null) => {
            listRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
        },
        [ref, listRef],
    );

    return (
        <TabsVariantContext.Provider value={resolved}>
            <TabsPrimitive.List
                ref={setRefs}
                data-slot="tabs-list"
                data-variant={resolved}
                className={cn(tabsListVariants({ variant: resolved }), className)}
                {...props}
            >
                {children}
                {resolved === "underline" && (
                    <span
                        ref={indicatorRef}
                        aria-hidden
                        data-slot="tabs-indicator"
                        className="pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-primary opacity-0 data-[ready]:motion-safe:transition-[transform,width] data-[ready]:motion-safe:duration-200 data-[ready]:motion-safe:ease-snappy"
                    />
                )}
            </TabsPrimitive.List>
        </TabsVariantContext.Provider>
    );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
    const variant = React.useContext(TabsVariantContext);
    return (
        <TabsPrimitive.Trigger
            data-slot="tabs-trigger"
            className={cn(tabsTriggerVariants({ variant }), className)}
            {...props}
        />
    );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
