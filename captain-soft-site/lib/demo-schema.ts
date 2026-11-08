import { z } from "zod";
import { demo } from "@/content/demo";
import { plans } from "@/content/pricing";

const e = demo.form.errors;
const teamSizes = demo.form.teamSizes.map((t) => t.value) as [string, ...string[]];
const planIds = plans.map((p) => p.id) as [string, ...string[]];

/** Shared by the browser (instant feedback) and the server action (source of truth). */
export const demoSchema = z.object({
  name: z.string().trim().min(1, e.nameRequired).max(120, e.nameTooLong),
  email: z.string().trim().min(1, e.emailRequired).pipe(z.email(e.emailInvalid)),
  company: z.string().trim().min(1, e.companyRequired).max(160, e.companyTooLong),
  teamSize: z.enum(teamSizes, e.teamSizeRequired),
  plan: z.enum(planIds).optional().catch(undefined),
});

export type DemoRequest = z.infer<typeof demoSchema>;
export type DemoField = "name" | "email" | "company" | "teamSize";
export const demoFields: DemoField[] = ["name", "email", "company", "teamSize"];
export type DemoErrors = Partial<Record<DemoField, string>>;

export function validateDemo(input: Record<string, unknown>): { data?: DemoRequest; errors: DemoErrors } {
  const result = demoSchema.safeParse(input);
  if (result.success) return { data: result.data, errors: {} };
  const errors: DemoErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as DemoField;
    if (demoFields.includes(field) && !errors[field]) errors[field] = issue.message;
  }
  return { errors };
}
