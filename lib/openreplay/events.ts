/**
 * High-Value CRM Business Events for OpenReplay Telemetry
 * CaptainProspect CRM execution platform
 */

import { openReplayTracker } from "./tracker";
import type { ActionResult, Channel } from "@/lib/types";

export interface LeadViewPayload {
  leadId: string | number;
  companyName?: string;
  contactName?: string;
  status?: string;
  missionId?: string | number;
  campaignId?: string | number;
}

export interface ActionLoggedPayload {
  leadId: string | number;
  channel: Channel | string;
  result: ActionResult | string;
  companyName?: string;
  durationSeconds?: number;
  hasCallbackDate?: boolean;
  callbackDate?: string;
  callNotesLength?: number;
  isMeetingBooked?: boolean;
}

export interface MeetingBookedPayload {
  leadId: string | number;
  companyName?: string;
  contactName?: string;
  scheduledAt?: string;
  clientId?: string;
  sdrId?: string;
}

export interface CallEventPayload {
  leadId?: string | number;
  phone?: string;
  provider?: "allo" | "leexi" | "manual";
  durationSeconds?: number;
  callStatus?: string;
}

export interface EmailSentPayload {
  leadId?: string | number;
  recipientEmail?: string;
  templateId?: string | number;
  templateName?: string;
  hasSubject?: boolean;
}

export interface FilterAppliedPayload {
  viewName: string;
  filterKey: string;
  filterValue: string | number | boolean;
}

/**
 * Track when an SDR or user opens and views a lead/company profile
 */
export function trackLeadView(payload: LeadViewPayload): void {
  openReplayTracker.trackEvent("CRM_LEAD_VIEWED", {
    lead_id: String(payload.leadId),
    company: payload.companyName,
    contact: payload.contactName,
    status: payload.status,
    mission_id: payload.missionId ? String(payload.missionId) : undefined,
    campaign_id: payload.campaignId ? String(payload.campaignId) : undefined,
  });
}

/**
 * Track when an action (CALL, EMAIL, LINKEDIN) is submitted by an SDR
 */
export function trackActionLogged(payload: ActionLoggedPayload): void {
  const isMeetingBooked =
    payload.isMeetingBooked ?? payload.result === "MEETING_BOOKED";

  openReplayTracker.trackEvent("CRM_ACTION_SUBMITTED", {
    lead_id: String(payload.leadId),
    channel: payload.channel,
    result: payload.result,
    company: payload.companyName,
    duration_sec: payload.durationSeconds,
    has_callback: payload.hasCallbackDate,
    is_meeting_booked: isMeetingBooked,
  });

  // Highlight key milestones as separate high-visibility events
  if (isMeetingBooked) {
    openReplayTracker.trackEvent("CRM_MEETING_BOOKED", {
      lead_id: String(payload.leadId),
      company: payload.companyName,
      callback_date: payload.callbackDate,
    });
  } else if (payload.result === "INTERESTED") {
    openReplayTracker.trackEvent("CRM_LEAD_INTERESTED", {
      lead_id: String(payload.leadId),
      company: payload.companyName,
    });
  }
}

/**
 * Track Meeting Booking confirmation
 */
export function trackMeetingBooked(payload: MeetingBookedPayload): void {
  openReplayTracker.trackEvent("CRM_MEETING_BOOKED_CONFIRMED", {
    lead_id: String(payload.leadId),
    company: payload.companyName,
    contact: payload.contactName,
    scheduled_at: payload.scheduledAt,
    client_id: payload.clientId,
  });
}

/**
 * Track VoIP Call Events (Allo, Leexi, etc.)
 */
export function trackCallEvent(
  status: "STARTED" | "ENDED" | "FAILED",
  payload: CallEventPayload
): void {
  openReplayTracker.trackEvent(`CRM_CALL_${status}`, {
    lead_id: payload.leadId ? String(payload.leadId) : undefined,
    provider: payload.provider || "allo",
    duration_sec: payload.durationSeconds,
    status: payload.callStatus,
  });
}

/**
 * Track Quick Email Outreach
 */
export function trackEmailSent(payload: EmailSentPayload): void {
  openReplayTracker.trackEvent("CRM_EMAIL_SENT", {
    lead_id: payload.leadId ? String(payload.leadId) : undefined,
    template_id: payload.templateId ? String(payload.templateId) : undefined,
    template_name: payload.templateName,
  });
}

/**
 * Track Filter / Query state changes in CRM tables
 */
export function trackFilterApplied(payload: FilterAppliedPayload): void {
  openReplayTracker.trackEvent("CRM_FILTER_APPLIED", {
    view: payload.viewName,
    key: payload.filterKey,
    value: String(payload.filterValue),
  });
}

/**
 * Track Export actions (CSV, PDF)
 */
export function trackExport(exportType: string, rowCount?: number): void {
  openReplayTracker.trackEvent("CRM_DATA_EXPORTED", {
    type: exportType,
    rows: rowCount,
  });
}
