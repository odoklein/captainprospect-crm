import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filterRdvList } from "@/lib/utils/meetingFilters";

// ============================================
// GET /api/sdr/meetings
// Fetch meetings booked by the current SDR with filtering by Mission and List
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

        const { searchParams } = new URL(request.url);
        const missionId = searchParams.get("missionId");
        const listId = searchParams.get("listId");
        const search = searchParams.get("search")?.trim() || null;
        const startDateParam = searchParams.get("startDate")?.trim() || null;
        const endDateParam = searchParams.get("endDate")?.trim() || null;

        // Build where clause with filters (include MEETING_BOOKED and MEETING_CANCELLED)
        const where: any = {
            sdrId: session.user.id,
            result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] },
        };
        if (startDateParam || endDateParam) {
            const dateFilter: { gte?: Date; lte?: Date } = {};
            if (startDateParam) {
                const from = new Date(startDateParam);
                from.setHours(0, 0, 0, 0);
                dateFilter.gte = from;
            }
            if (endDateParam) {
                const to = new Date(endDateParam);
                to.setHours(23, 59, 59, 999);
                dateFilter.lte = to;
            }
            where.OR = [
                { callbackDate: dateFilter },
                { createdAt: dateFilter },
            ];
        }

        // Filter by Mission (via Campaign -> Mission)
        if (missionId) {
            where.campaign = {
                missionId: missionId,
            };
        }

        // Filter by List and/or search (Contact)
        const contactConditions: any[] = [];
        if (listId) {
            contactConditions.push({ company: { listId } });
        }
        if (search) {
            contactConditions.push({
                OR: [
                    { firstName: { contains: search, mode: "insensitive" as const } },
                    { lastName: { contains: search, mode: "insensitive" as const } },
                    { company: { name: { contains: search, mode: "insensitive" as const } } },
                ],
            });
        }
        if (contactConditions.length > 0) {
            where.contact = contactConditions.length === 1 ? contactConditions[0] : { AND: contactConditions };
        }

        const rawMeetings = await prisma.action.findMany({
            where,
            include: {
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        title: true,
                        email: true,
                        phone: true,
                        linkedin: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                                country: true,
                                industry: true,
                                website: true,
                                size: true,
                                list: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                campaign: {
                    select: {
                        id: true,
                        name: true,
                        mission: {
                            select: {
                                id: true,
                                name: true,
                                client: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                meetingFeedback: {
                    select: {
                        id: true,
                        outcome: true,
                        recontactRequested: true,
                        clientNote: true,
                        createdAt: true,
                        standByAt: true,
                        standByReason: true,
                    },
                },
            },
            orderBy: {
                callbackDate: "desc",
            },
        });

        // Exclude RDV cancelled with less than 10 min before scheduled time
        const meetings = filterRdvList(rawMeetings);

        const transformedMeetings = meetings.map((meeting) => ({
            id: meeting.id,
            createdAt: meeting.createdAt,
            result: meeting.result,
            note: meeting.note || undefined,
            callbackDate: meeting.callbackDate?.toISOString() ?? null,
            cancellationReason: meeting.cancellationReason ?? undefined,
            meetingType: meeting.meetingType ?? undefined,
            meetingCategory: meeting.meetingCategory ?? undefined,
            meetingAddress: meeting.meetingAddress ?? undefined,
            meetingJoinUrl: meeting.meetingJoinUrl ?? undefined,
            meetingPhone: meeting.meetingPhone ?? undefined,
            confirmationStatus: meeting.confirmationStatus,
            meetingFeedback: meeting.meetingFeedback ?? null,
            contact: meeting.contact,
            mission: meeting.campaign?.mission
                ? {
                      id: meeting.campaign.mission.id,
                      name: meeting.campaign.mission.name,
                      client: meeting.campaign.mission.client,
                  }
                : null,
            list: meeting.contact.company.list
                ? {
                      id: meeting.contact.company.list.id,
                      name: meeting.contact.company.list.name,
                  }
                : null,
        }));

        return NextResponse.json({
            success: true,
            data: transformedMeetings,
        });

    } catch (error) {
        console.error("Error fetching SDR meetings:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
