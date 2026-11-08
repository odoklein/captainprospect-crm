"use client";

import { AnimatePresence, m } from "framer-motion";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { roles } from "@/content/home";
import { ClientPortalMockup } from "@/components/mockups/ClientPortalMockup";
import { ManagerDashboardMockup } from "@/components/mockups/ManagerDashboardMockup";
import { MeetingBriefMockup } from "@/components/mockups/MeetingBriefMockup";
import { SdrQueueMockup } from "@/components/mockups/SdrQueueMockup";
import { ButtonLink, Container, Eyebrow, cx } from "@/components/ui/primitives";

type TabId = (typeof roles.tabs)[number]["id"];

function RoleMockup({ id, label }: { id: TabId; label: string }) {
  switch (id) {
    case "sdr":
      return <SdrQueueMockup label={label} variant="compact" />;
    case "manager":
      return <ManagerDashboardMockup label={label} />;
    case "bd":
      return <MeetingBriefMockup label={label} className="mx-auto max-w-[460px]" />;
    case "client":
      return <ClientPortalMockup label={label} />;
  }
}

/** 7. "Pensé pour chaque rôle": ARIA tabs (arrow keys, Home/End) switching a mockup. */
export function Roles() {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs = roles.tabs;

  const focusTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => focusTab(index + 1),
      ArrowRight: () => focusTab(index + 1),
      ArrowUp: () => focusTab(index - 1),
      ArrowLeft: () => focusTab(index - 1),
      Home: () => focusTab(0),
      End: () => focusTab(tabs.length - 1),
    };
    const run = keys[e.key];
    if (run) {
      e.preventDefault();
      run();
    }
  };

  const current = tabs[active];

  return (
    <section id="roles" aria-labelledby="roles-title" className="pb-24 sm:pb-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[380px_1fr] lg:gap-14">
          <div className="flex flex-col gap-5">
            <Eyebrow>{roles.eyebrow}</Eyebrow>
            <h2 id="roles-title" className="font-display-tight text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.02] font-light">
              {roles.title}
            </h2>
            <p className="text-[17px] leading-relaxed text-muted sm:text-lg">{roles.subtitle}</p>

            <div role="tablist" aria-label="Rôles" aria-orientation="vertical" className="mt-4 flex flex-col gap-2">
              {tabs.map((tab, i) => {
                const selected = i === active;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    role="tab"
                    type="button"
                    id={`${baseId}-tab-${tab.id}`}
                    aria-selected={selected}
                    aria-controls={`${baseId}-panel`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className={cx(
                      "relative rounded-[16px] border px-5 py-4 text-left transition-colors duration-200",
                      selected ? "border-line bg-white" : "border-transparent hover:bg-ink/[.03]",
                    )}
                  >
                    {selected ? <span aria-hidden className="absolute top-4 bottom-4 left-0 w-[3px] rounded-full bg-rose" /> : null}
                    <span className={cx("eyebrow block", selected ? "text-navy" : "text-muted")}>{tab.label}</span>
                    <span className={cx("font-display-tight mt-1 block text-xl", selected ? "text-ink" : "text-ink/75")}>
                      {tab.title}
                    </span>
                    {selected ? <span className="mt-1.5 block text-[15px] leading-relaxed text-muted">{tab.body}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <ButtonLink href={roles.action.href} arrow>
                {roles.action.label}
              </ButtonLink>
            </div>
          </div>

          <div
            role="tabpanel"
            id={`${baseId}-panel`}
            aria-labelledby={`${baseId}-tab-${current.id}`}
            className="relative grid min-h-[480px] place-items-center overflow-hidden rounded-[24px] bg-[linear-gradient(160deg,#E8EAF1_0%,#EFE7EC_100%)] p-4 sm:p-8 lg:p-12"
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={current.id}
                className="w-full"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <RoleMockup id={current.id} label={current.mockupLabel} />
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </Container>
    </section>
  );
}
