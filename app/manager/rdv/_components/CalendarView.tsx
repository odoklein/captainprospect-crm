"use client";

import { useState, useMemo } from "react";
import type { Meeting } from "../_types";
import { WeekView } from "./WeekView";
import { buildCalendarMeetings, buildCalendarDays } from "../_lib/calendar-utils";
import { contactName, meetingStatus, statusColor, meetingTypeIcon } from "../_lib/formatters";
import { ChevronLeft, ChevronRight, Check, X, Mail, Phone, Linkedin } from "lucide-react";

interface CalendarViewProps {
  meetings: Meeting[];
  openPanel: (m: Meeting) => void;
  updateMeeting: (id: string, data: Record<string, unknown>) => Promise<void>;
  updateLocalMeeting: (id: string, patch: Partial<Meeting>) => void;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function CalendarView({ meetings, openPanel, updateMeeting, updateLocalMeeting }: CalendarViewProps) {
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const calendarMeetings = useMemo(() => buildCalendarMeetings(meetings), [meetings]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarDate), [calendarDate]);

  const today = toLocalDateKey(new Date());

  return (
    <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button
          className="rdv-btn rdv-btn-ghost"
          style={{ padding: "8px 10px" }}
          onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1))}
        >
          <ChevronLeft size={16} />
        </button>
        <h2 className="rdv-serif" style={{ fontSize: 22, margin: 0, color: "var(--ink)", textTransform: "capitalize" }}>
          {calendarDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </h2>
        <button
          className="rdv-btn rdv-btn-ghost"
          style={{ padding: "8px 10px" }}
          onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1))}
        >
          <ChevronRight size={16} />
        </button>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto", background: "var(--surface2)", borderRadius: 10, padding: 2 }}>
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              className="rdv-btn"
              style={{
                padding: "6px 14px", borderRadius: 8,
                background: calendarView === v ? "var(--surface)" : "transparent",
                color: calendarView === v ? "var(--accent)" : "var(--ink3)",
                border: "none",
                boxShadow: calendarView === v ? "var(--rdv-shadow-sm)" : "none",
              }}
              onClick={() => setCalendarView(v)}
            >
              {v === "month" ? "Mois" : "Semaine"}
            </button>
          ))}
        </div>
      </div>

      {calendarView === "month" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <div key={d} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink3)", textAlign: "center", padding: 10 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {calendarDays.map(({ date, inMonth }, i) => {
              const key = toLocalDateKey(date);
              const dayMeetings = calendarMeetings.get(key) || [];
              const isToday = key === today;
              const isExpanded = expandedDay === key;
              return (
                <div
                  key={i}
                  onClick={() => dayMeetings.length > 0 && setExpandedDay(isExpanded ? null : key)}
                  style={{
                    minHeight: isExpanded ? "auto" : 90,
                    background: isExpanded ? "var(--surface2)" : "var(--surface)",
                    border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 10, padding: 10,
                    opacity: inMonth ? 1 : 0.35,
                    cursor: dayMeetings.length > 0 ? "pointer" : "default",
                    transition: "all 0.15s",
                    gridColumn: isExpanded ? "1 / -1" : undefined,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? "var(--accent)" : "var(--ink2)", marginBottom: 6 }}>
                    {date.getDate()}
                  </div>
                  {!isExpanded && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {dayMeetings.slice(0, 4).map((m) => (
                        <div key={m.id} style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(meetingStatus(m)) }} />
                      ))}
                      {dayMeetings.length > 4 && <span style={{ fontSize: 10, color: "var(--ink3)" }}>+{dayMeetings.length - 4}</span>}
                    </div>
                  )}
                  {isExpanded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      {dayMeetings.map((m) => (
                        <div
                          key={m.id}
                          className="rdv-board-card"
                          onClick={(e) => { e.stopPropagation(); openPanel(m); }}
                          style={{ display: "flex", flexDirection: "column", gap: 8 }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 4, height: 36, borderRadius: 2, background: statusColor(meetingStatus(m)), flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{m.contact ? contactName(m.contact) : (m.company ? "Société seule" : "—")}</div>
                              <div style={{ fontSize: 12, color: "var(--ink3)" }}>
                                {m.company?.name || "—"} · {m.callbackDate ? new Date(m.callbackDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                              </div>
                            </div>
                            {meetingTypeIcon(m.meetingType)}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            {m.confirmationStatus !== "CONFIRMED" && (
                              <button
                                type="button"
                                className="rdv-btn"
                                style={{ fontSize: 10, padding: "4px 8px", background: "var(--greenLight)", color: "var(--green)", border: "1px solid var(--greenLine)" }}
                                onClick={() => {
                                  updateMeeting(m.id, { confirmationStatus: "CONFIRMED" });
                                  updateLocalMeeting(m.id, {
                                    confirmationStatus: "CONFIRMED",
                                    confirmedAt: new Date().toISOString(),
                                  });
                                }}
                              >
                                <Check size={10} /> Confirmer
                              </button>
                            )}
                            {m.confirmationStatus !== "CANCELLED" && (
                              <button
                                type="button"
                                className="rdv-btn"
                                style={{ fontSize: 10, padding: "4px 8px", background: "var(--redLight)", color: "var(--red)", border: "1px solid var(--redLine)" }}
                                onClick={() => {
                                  updateMeeting(m.id, { confirmationStatus: "CANCELLED" });
                                  updateLocalMeeting(m.id, {
                                    confirmationStatus: "CANCELLED",
                                    confirmedAt: null,
                                    confirmedById: null,
                                  });
                                }}
                              >
                                <X size={10} /> Annuler
                              </button>
                            )}
                            {m.contact?.email && (
                              <a href={`mailto:${m.contact.email}`} className="rdv-btn rdv-btn-ghost" style={{ fontSize: 10, padding: "4px 8px", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                                <Mail size={10} /> Email
                              </a>
                            )}
                            {m.contact?.phone && (
                              <a href={`tel:${m.contact.phone}`} className="rdv-btn rdv-btn-ghost" style={{ fontSize: 10, padding: "4px 8px", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                                <Phone size={10} /> Appeler
                              </a>
                            )}
                            {m.contact?.linkedin && (
                              <a href={m.contact.linkedin} target="_blank" rel="noreferrer" className="rdv-btn rdv-btn-ghost" style={{ fontSize: 10, padding: "4px 8px", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                                <Linkedin size={10} /> LinkedIn
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {calendarView === "week" && (
        <WeekView calendarDate={calendarDate} calendarMeetings={calendarMeetings} openPanel={openPanel} />
      )}
    </div>
  );
}
