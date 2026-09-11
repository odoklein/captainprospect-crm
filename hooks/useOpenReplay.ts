"use client";

import { useCallback } from "react";
import { openReplayTracker } from "@/lib/openreplay/tracker";
import * as crmEvents from "@/lib/openreplay/events";

/**
 * React hook providing convenient access to OpenReplay tracking utilities.
 */
export function useOpenReplay() {
  const trackCustomEvent = useCallback(
    (name: string, payload?: Record<string, any>) => {
      openReplayTracker.trackEvent(name, payload);
    },
    []
  );

  const trackError = useCallback(
    (error: Error | string, payload?: Record<string, any>) => {
      openReplayTracker.trackError(error, payload);
    },
    []
  );

  const setMetadata = useCallback((key: string, value: string | number | boolean) => {
    openReplayTracker.setMetadata(key, value);
  }, []);

  return {
    trackCustomEvent,
    trackError,
    setMetadata,
    getSessionURL: () => openReplayTracker.getSessionURL(),
    getSessionID: () => openReplayTracker.getSessionID(),
    ...crmEvents,
  };
}
