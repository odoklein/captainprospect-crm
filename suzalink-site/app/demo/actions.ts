"use server";

import { validateDemo, type DemoErrors } from "@/lib/demo-schema";

export type DemoState = {
  status: "idle" | "success" | "error";
  errors: DemoErrors;
  values: Record<string, string>;
};

/**
 * Receives the demo request. Validation runs again here: the browser check is only a convenience.
 *
 * TODO : brancher l'envoi (CRM, email ou webhook), par exemple :
 *   await fetch(process.env.DEMO_WEBHOOK_URL!, { method: "POST", body: JSON.stringify(data) })
 */
export async function submitDemo(_prev: DemoState, formData: FormData): Promise<DemoState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    teamSize: String(formData.get("teamSize") ?? ""),
    plan: String(formData.get("plan") ?? ""),
  };

  // Honeypot: real people never fill this hidden field.
  if (String(formData.get("website") ?? "") !== "") {
    return { status: "success", errors: {}, values: {} };
  }

  const { data, errors } = validateDemo({ ...values, plan: values.plan || undefined });
  if (!data) return { status: "error", errors, values };

  const webhook = process.env.DEMO_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, source: "site", receivedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Webhook answered ${res.status}`);
    } catch (err) {
      console.error("[demo] delivery failed", err);
      return { status: "error", errors: {}, values };
    }
  } else {
    console.info("[demo] new request (no DEMO_WEBHOOK_URL set)", { company: data.company, teamSize: data.teamSize });
  }

  return { status: "success", errors: {}, values: {} };
}
