/**
 * Sources of the « Tâches du jour » block that live in other features, kept
 * behind one module so the home aggregator stays independent of each of them.
 */

import { getPendingCompanySubmissionsCount as countPendingSubmissions } from "@/lib/prospect-submissions/service";
import { getWeeklyBilanTodos as weeklyBilanTodos } from "@/lib/reporting/weekly-bilan";
import { getBillingTodayItems as billingTodayItems, type BillingTodayItem } from "@/lib/billing/schedule-service";

export type { BillingTodayItem };

export interface WeeklyBilanTodo {
    clientId: string;
    clientName: string;
    weekStart: string;
    weekEnd: string;
    calls: number;
    meetings: number;
    overdue: boolean;
    href: string;
}

/** Billing schedule (« Échéancier »): invoices to issue and late payments. */
export async function getBillingTodayItems(today: string): Promise<BillingTodayItem[]> {
    return billingTodayItems(today);
}

/** Weekly client bilans still to publish (Friday → Monday). */
export async function getWeeklyBilanTodos(userId: string, now: Date): Promise<WeeklyBilanTodo[]> {
    return weeklyBilanTodos(userId, now);
}

/** SDR company additions waiting for a manager. */
export async function getPendingCompanySubmissionsCount(userId: string): Promise<number> {
    return countPendingSubmissions(userId);
}
