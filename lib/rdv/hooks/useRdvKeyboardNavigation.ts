"use client";

import { useEffect } from "react";

interface UseRdvKeyboardNavigationParams<T extends { id: string }> {
  panelOpen: boolean;
  selectedMeetingId: string | null;
  meetings: T[];
  closePanel: () => void;
  openPanel: (meeting: T, allMeetings: T[]) => void;
}

export function useRdvKeyboardNavigation<T extends { id: string }>({
  panelOpen,
  selectedMeetingId,
  meetings,
  closePanel,
  openPanel,
}: UseRdvKeyboardNavigationParams<T>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panelOpen) {
        closePanel();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel, panelOpen]);

  useEffect(() => {
    if (!panelOpen || !selectedMeetingId) return;

    const onNavigate = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const currentIndex = meetings.findIndex((meeting) => meeting.id === selectedMeetingId);
      if (currentIndex === -1) return;

      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(meetings.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);

      if (nextIndex === currentIndex) return;

      event.preventDefault();
      openPanel(meetings[nextIndex], meetings);
    };

    window.addEventListener("keydown", onNavigate);
    return () => window.removeEventListener("keydown", onNavigate);
  }, [meetings, openPanel, panelOpen, selectedMeetingId]);
}
