/**
 * RDV (meeting) messaging renderers.
 */

import type { RenderedMessage } from "@/lib/integrations/messaging/types";
import { esc, truncate, fmtDateParis, deepLink, severityColor } from "./common";

/**
 * Renders a manual report of a no-show meeting.
 */
export function renderNoShowReport(data: {
  clientName: string;
  contactName: string;
  companyName: string;
  missionName?: string | null;
  meetingDate?: string | null;
  sdrName?: string | null;
  reportedBy: string;
  note?: string | null;
}): RenderedMessage {
  const {
    clientName,
    contactName,
    companyName,
    missionName,
    meetingDate,
    sdrName,
    reportedBy,
    note,
  } = data;

  const title = `👻 RDV absent signalé manuellement — ${clientName}`;
  const formattedDate = fmtDateParis(meetingDate) || "Date inconnue";
  const url = deepLink("manager/rdv-absences");
  const truncatedNote = note ? truncate(esc(note), 300) : null;

  const fields = [
    {
      type: "mrkdwn",
      text: `*Contact:*\n${esc(contactName)} (${esc(companyName)})`,
    },
    {
      type: "mrkdwn",
      text: `*Date:*\n${formattedDate}`,
    },
  ];

  if (missionName) {
    fields.push({
      type: "mrkdwn",
      text: `*Mission:*\n${esc(missionName)}`,
    });
  }

  if (sdrName) {
    fields.push({
      type: "mrkdwn",
      text: `*SDR:*\n${esc(sdrName)}`,
    });
  }

  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${esc(title)}*`,
      },
    },
    {
      type: "section",
      fields,
    },
  ];

  if (truncatedNote) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Note:*\n> ${truncatedNote}`,
      },
    });
  }

  blocks.push(
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Signalé par ${esc(reportedBy)} · remonté au dashboard télépro`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Voir les signalements",
          },
          url: url || "",
          action_id: "open_reports",
        },
      ],
    }
  );

  return {
    fallbackText: `${title}\nContact: ${contactName} (${companyName})\nDate: ${formattedDate}`,
    severity: 3,
    title,
    color: severityColor(3),
    blocks,
  };
}

/**
 * Stub for RDV root renderer.
 */
export function renderRdvRoot(data: unknown): RenderedMessage {
  // Full implementation in P1
  throw new Error("Not implemented: rdv root renderers ship in P1");
}
