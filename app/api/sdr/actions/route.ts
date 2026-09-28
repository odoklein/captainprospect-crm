import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import type { ActionResult, Channel } from "@/lib/types";

// ============================================
// GET /api/sdr/actions
// Returns the current SDR/BD's actions (calls and other actions) for "my activity" and history.
// Query: period=today|all, limit (default 50), dateFrom, dateTo, missionId, result, channel
// ============================================

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        const role = session.user.role as string;
        if (role !== "SDR" && role !== "BUSINESS_DEVELOPER" && role !== "BOOKER") {
            return NextResponse.json(
                { success: false, error: "Réservé aux SDR/BD" },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get("period") || "today"; // today | all
        const limit = Math.min(parseInt(searchParams.get("limit") || "50") || 50, 500);
        const dateFrom = searchParams.get("dateFrom");
        const dateTo = searchParams.get("dateTo");
        const missionId = searchParams.get("missionId");
        const result = searchParams.get("result");
        const channel = searchParams.get("channel");
        const sdrId = session.user.id;
        const isBooker = role === "BOOKER";

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        type Where = {
            sdrId?: string;
            createdAt?: { gte?: Date; lte?: Date };
            campaign?: { missionId?: string };
            result?: string;
            channel?: string;
        };
        const where: Where = {};
        // Booker sees ALL actions; SDR/BD sees only their own
        if (!isBooker) {
            where.sdrId = sdrId;
        }
        if (period === "today") {
            where.createdAt = { ...where.createdAt, gte: today };
        }
        if (dateFrom) {
            const from = new Date(dateFrom);
            if (!isNaN(from.getTime())) {
                where.createdAt = { ...where.createdAt, gte: from };
            }
        }
        if (dateTo) {
            const to = new Date(dateTo);
            if (!isNaN(to.getTime())) {
                to.setHours(23, 59, 59, 999);
                where.createdAt = { ...where.createdAt, lte: to };
            }
        }
        if (missionId) {
            where.campaign = { missionId };
        }
        if (result) {
            where.result = result;
        }
        if (channel) {
            where.channel = channel;
        }
        const actions = await prisma.action.findMany({
            where: where as any,
            orderBy: { createdAt: "desc" },
            take: limit,
            include: {
                sdr: {
                    select: { id: true, name: true },
                },
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        title: true,
                        phone: true,
                        company: { select: { id: true, name: true, phone: true } },
                    },
                },
                company: {
                    select: { id: true, name: true, phone: true },
                },
                campaign: {
                    select: {
                        name: true,
                        missionId: true,
                        mission: { select: { id: true, name: true } },
                    },
                },
            },
        });

        const items = actions.map((a) => {
            const contactName = a.contact
                ? `${(a.contact.firstName || "").trim()} ${(a.contact.lastName || "").trim()}`.trim() || a.contact.company?.name
                : null;
            const companyName = a.contact?.company?.name ?? a.company?.name ?? null;
            const phone = a.contact?.phone ?? a.contact?.company?.phone ?? a.company?.phone ?? null;
            const label = ACTION_RESULT_LABELS[(a.result as ActionResult)] ?? a.result;
            const companyIdResolved = a.companyId ?? a.contact?.company?.id ?? null;

            return {
                id: a.id,
                contactId: a.contactId,
                companyId: companyIdResolved,
                result: a.result,
                resultLabel: label,
                channel: a.channel as Channel,
                campaignName: a.campaign?.name,
                missionId: a.campaign?.mission?.id,
                missionName: a.campaign?.mission?.name,
                contactName: contactName || undefined,
                companyName: companyName || undefined,
                phone: phone || undefined,
                note: a.note ?? undefined,
                createdAt: a.createdAt.toISOString(),
                callbackDate: a.callbackDate?.toISOString() ?? null,
                duration: a.duration ?? null,
            };
        });

        return NextResponse.json({
            success: true,
            data: items,
        });
    } catch (error) {
        console.error("[GET /api/sdr/actions] Error:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
