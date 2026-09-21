/**
 * ============================================================
 * MESSAGING INTEGRATION — TYPE DEFINITIONS
 * ============================================================
 * Provider-neutral types for the event bus, renderers, and adapters.
 * All adapters (Slack, Discord, etc.) convert to/from these types.
 */

import type {
  MessagingProvider,
  MessagingEntityType,
  MessagingVisibility,
} from "@prisma/client";

// ============================================
// EVENT TYPES
// ============================================

/** Every CRM event the messaging bus can carry. */
export type CrmEventType =
  // RDV / meetings
  | "rdv.booked"
  | "rdv.rescheduled"
  | "rdv.cancelled"
  | "rdv.confirmation_changed"
  | "rdv.fiche_updated"
  | "rdv.feedback_submitted"
  | "rdv.no_show_reported"
  | "rdv.stand_by"
  | "rdv.reminder"
  | "call.enriched"
  | "opportunity.created"
  // Client support
  | "support.conversation_created"
  | "support.client_message"
  | "support.manager_reply"
  | "support.attachment_added"
  | "support.resolved"
  | "support.reopened"
  | "support.sla_breach"
  // Tickets
  | "ticket.created_from_support"
  | "ticket.status_changed"
  | "ticket.completed"
  // Free wins (future)
  | "sdr.daily_feedback_submitted"
  | "planning.conflict_detected"
  | "mailbox.sync_failed"
  | "invoice.overdue"
  | "prospect.decision_logged"
  | "broadcast.sent"
  | "onboarding.step_completed";

/**
 * Severity drives `minSeverity` routing:
 *   0 = info · 1 = notable · 2 = needs attention · 3 = urgent
 */
export const EVENT_SEVERITY: Record<CrmEventType, number> = {
  "rdv.booked": 1,
  "rdv.rescheduled": 2,
  "rdv.cancelled": 2,
  "rdv.confirmation_changed": 1,
  "rdv.fiche_updated": 0,
  "rdv.feedback_submitted": 1, // bumped to 3 for NEGATIVE / NO_SHOW at emit time
  "rdv.no_show_reported": 3,
  "rdv.stand_by": 1,
  "rdv.reminder": 1,
  "call.enriched": 0,
  "opportunity.created": 1,
  "support.conversation_created": 2,
  "support.client_message": 2,
  "support.manager_reply": 0,
  "support.attachment_added": 0,
  "support.resolved": 1,
  "support.reopened": 1,
  "support.sla_breach": 3,
  "ticket.created_from_support": 1,
  "ticket.status_changed": 0,
  "ticket.completed": 1,
  "sdr.daily_feedback_submitted": 0,
  "planning.conflict_detected": 2,
  "mailbox.sync_failed": 2,
  "invoice.overdue": 2,
  "prospect.decision_logged": 0,
  "broadcast.sent": 0,
  "onboarding.step_completed": 0,
};

// ============================================
// CRM EVENT (the bus payload)
// ============================================

/** Fired by business logic → enters the event bus. */
export interface CrmEvent {
  type: CrmEventType;
  entityType: MessagingEntityType;
  entityId: string;
  /** Arbitrary, render-agnostic data. Renderers pick what they need. */
  payload: Record<string, unknown>;
  /** CRM user that triggered the event (null for system events like cron). */
  actorId?: string;
  /** Override the default severity from EVENT_SEVERITY. */
  severity?: number;
  /** Scope narrowing for route resolution. */
  clientId?: string;
  missionId?: string;
}

// ============================================
// RENDERED MESSAGE (provider-neutral output)
// ============================================

export interface MessageField {
  label: string;
  value: string;
  /** Short fields render side-by-side in Slack. */
  short?: boolean;
}

export interface MessageAction {
  /** Unique action id for interactivity callbacks. */
  actionId: string;
  label: string;
  /** "button" | "select" */
  style?: "primary" | "danger" | "default";
  /** If set, the button is a link, not an interactive callback. */
  url?: string;
}

export interface MessageLink {
  label: string;
  url: string;
}

/** Provider-neutral message — adapters convert to Block Kit, embeds, etc. */
export interface RenderedMessage {
  title: string;
  severity: number;
  fields: MessageField[];
  /** Markdown-formatted context line (e.g. "Signalé par X · 14:30"). */
  context?: string;
  actions?: MessageAction[];
  links?: MessageLink[];
  /** When set, the message should be posted as a thread reply. */
  threadTs?: string;
  /** Fallback plain-text for notifications / non-rich clients. */
  fallbackText: string;
}

// ============================================
// ADAPTER INTERFACE
// ============================================

export interface PostResult {
  channelId: string;
  messageTs: string;
  threadTs?: string;
}

export interface VerifyResult {
  valid: boolean;
  workspaceId?: string;
  error?: string;
}

export interface ChannelRef {
  id: string;
  name: string;
  isPrivate: boolean;
}

export type InboundEventKind = "message" | "interaction" | "command";

export interface InboundEvent {
  kind: InboundEventKind;
  externalEventId: string;
  workspaceExternalId: string;
  channelId: string;
  userId: string;
  messageTs?: string;
  threadTs?: string;
  text?: string;
  /** Raw provider-specific payload for storage in MessagingInboundEvent. */
  raw: unknown;
}

export interface RenderedModal {
  title: string;
  blocks: unknown[];
  callbackId: string;
  privateMetadata?: string;
}

export interface MessagingAdapter {
  readonly provider: MessagingProvider;
  post(
    ch: string,
    msg: RenderedMessage,
    opts?: { threadTs?: string },
  ): Promise<PostResult>;
  edit(ch: string, ts: string, msg: RenderedMessage): Promise<void>;
  addReaction?(ch: string, ts: string, emoji: string): Promise<void>;
  openModal?(triggerId: string, modal: RenderedModal): Promise<void>;
  verifyInbound(req: Request, rawBody: string): Promise<VerifyResult>;
  parseInbound(payload: unknown): Promise<InboundEvent[]>;
  listChannels(): Promise<ChannelRef[]>;
}

// ============================================
// OUTBOX HELPERS
// ============================================

/** Build a deterministic dedupe key for an outbound message. */
export function buildDedupeKey(
  eventType: string,
  entityId: string,
  routeId: string,
): string {
  return `${eventType}:${entityId}:${routeId}`;
}

/** Build a serial key to ensure ordering within one entity. */
export function buildSerialKey(
  entityType: MessagingEntityType,
  entityId: string,
): string {
  return `${entityType}:${entityId}`;
}

// ============================================
// BACKOFF SCHEDULE
// ============================================

/**
 * Delay (in ms) before the Nth retry attempt.
 * Index 0 = first retry (after initial attempt failed).
 * After the last entry → DEAD_LETTER.
 */
export const BACKOFF_SCHEDULE_MS: readonly number[] = [
  0, // immediate retry
  30_000, // 30 s
  2 * 60_000, // 2 min
  10 * 60_000, // 10 min
  60 * 60_000, // 1 h
  6 * 60 * 60_000, // 6 h
];
