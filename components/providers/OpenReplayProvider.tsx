"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { openReplayTracker } from "@/lib/openreplay/tracker";

/**
 * Inner component to track Next.js App Router navigations and funnel steps
 */
function RouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const queryString = searchParams?.toString();
    const fullUrl = queryString ? `${pathname}?${queryString}` : pathname;

    if (lastPathRef.current !== fullUrl) {
      lastPathRef.current = fullUrl;

      // Track page navigation in OpenReplay timeline
      openReplayTracker.trackEvent("CRM_PAGE_VIEW", {
        path: pathname,
        query: queryString || undefined,
        timestamp: new Date().toISOString(),
      });

      // Update current route in session metadata
      openReplayTracker.setMetadata("current_route", pathname);
    }
  }, [pathname, searchParams]);

  return null;
}

export default function OpenReplayProvider() {
  const { data: session, status } = useSession();
  const hasIdentifiedRef = useRef<string | null>(null);

  // 1. Initialize tracker on browser mount
  useEffect(() => {
    openReplayTracker.start();
  }, []);

  // 2. Identify user and attach role/organization metadata when authenticated
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const user = session.user;

      if (hasIdentifiedRef.current !== user.id) {
        hasIdentifiedRef.current = user.id;

        openReplayTracker.identifyUser({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          clientId: user.clientId,
          interlocuteurId: user.interlocuteurId,
        });

        openReplayTracker.setMetadata("role", user.role || "unknown");
        openReplayTracker.setMetadata("email", user.email || "unknown");
        openReplayTracker.setMetadata("name", user.name || "unknown");
        if (user.clientId) {
          openReplayTracker.setMetadata("clientId", user.clientId);
        }
      }
    }
  }, [session, status]);

  return (
    <Suspense fallback={null}>
      <RouteTracker />
    </Suspense>
  );
}
