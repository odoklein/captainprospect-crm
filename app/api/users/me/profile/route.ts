import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const notificationsSchema = z.object({
    emailNotifs: z.boolean().optional(),
    pushNotifs: z.boolean().optional(),
    callbackReminders: z.boolean().optional(),
    meetingAlerts: z.boolean().optional(),
    dailyDigest: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    // Client portal toggles (were stripped by this schema, so they never saved)
    reportPublished: z.boolean().optional(),
    meetingReminder: z.boolean().optional(),
    milestones: z.boolean().optional(),
});

const appearanceSchema = z.object({
    darkMode: z.boolean().optional(),
    compactMode: z.boolean().optional(),
    animationsEnabled: z.boolean().optional(),
});

const workingHoursSchema = z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    pauseStart: z.string().optional(),
    pauseEnd: z.string().optional(),
});

const preferencesSchema = z.object({
    notifications: notificationsSchema.optional(),
    appearance: appearanceSchema.optional(),
    workingHours: workingHoursSchema.optional(),
    sdrFeedback: z
        .object({
            promptTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
            requiredDaily: z.boolean().optional(),
        })
        .optional(),
});

const putProfileSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().max(50).optional().nullable(),
    timezone: z.string().max(100).optional(),
    language: z.string().max(10).optional(),
    preferences: preferencesSchema.optional(),
});

type PreferencesJson = {
    notifications?: Record<string, boolean>;
    appearance?: Record<string, boolean>;
    workingHours?: Record<string, string>;
    sdrFeedback?: {
        promptTime?: string;
        requiredDaily?: boolean;
    };
};

// ============================================
// GET /api/users/me/profile
// ============================================

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                name: true,
                email: true,
                role: true,
                phone: true,
                alloPhoneNumber: true,
                timezone: true,
                preferences: true,
                createdAt: true,
                lastSignInAt: true,
                client: { select: { name: true } },
            },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: "Utilisateur non trouvé" }, { status: 404 });
        }

        const prefs = (user.preferences as PreferencesJson) || {};
        return NextResponse.json({
            success: true,
            data: {
                name: user.name,
                email: user.email,
                role: user.role,
                clientName: user.client?.name ?? null,
                createdAt: user.createdAt,
                lastSignInAt: user.lastSignInAt,
                alloPhoneNumber: user.alloPhoneNumber,
                phone: user.phone ?? "",
                timezone: user.timezone ?? "Europe/Paris",
                language: (prefs as { language?: string }).language ?? "fr",
                preferences: {
                    notifications: {
                        emailNotifs: true,
                        pushNotifs: true,
                        callbackReminders: true,
                        meetingAlerts: true,
                        dailyDigest: false,
                        soundEnabled: true,
                        ...prefs.notifications,
                    },
                    appearance: {
                        darkMode: false,
                        compactMode: false,
                        animationsEnabled: true,
                        ...prefs.appearance,
                    },
                    workingHours: {
                        start: "09:00",
                        end: "18:00",
                        pauseStart: "12:00",
                        pauseEnd: "13:00",
                        ...prefs.workingHours,
                    },
                    sdrFeedback: {
                        promptTime: "15:45",
                        requiredDaily: true,
                        ...prefs.sdrFeedback,
                    },
                },
            },
        });
    } catch (error) {
        console.error("Error getting profile:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}

// ============================================
// PUT /api/users/me/profile
// ============================================

export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }

        const body = await request.json();
        const parsed = putProfileSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: "Données invalides", details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { name, phone, timezone, language, preferences: newPrefs } = parsed.data;

        const current = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { preferences: true },
        });
        const currentPrefs = (current?.preferences as PreferencesJson) || {};

        const updateData: {
            name?: string;
            phone?: string | null;
            timezone?: string;
            preferences?: PreferencesJson;
        } = {};

        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone || null;
        if (timezone !== undefined) updateData.timezone = timezone;

        if (newPrefs) {
            updateData.preferences = {
                ...currentPrefs,
                notifications:
                    newPrefs.notifications !== undefined
                        ? { ...currentPrefs.notifications, ...newPrefs.notifications }
                        : currentPrefs.notifications,
                appearance:
                    newPrefs.appearance !== undefined
                        ? { ...currentPrefs.appearance, ...newPrefs.appearance }
                        : currentPrefs.appearance,
                workingHours:
                    newPrefs.workingHours !== undefined
                        ? { ...currentPrefs.workingHours, ...newPrefs.workingHours }
                        : currentPrefs.workingHours,
                sdrFeedback:
                    newPrefs.sdrFeedback !== undefined
                        ? { ...currentPrefs.sdrFeedback, ...newPrefs.sdrFeedback }
                        : currentPrefs.sdrFeedback,
            };
            if (language !== undefined) {
                (updateData.preferences as Record<string, unknown>).language = language;
            }
        }

        await prisma.user.update({
            where: { id: session.user.id },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            message: "Profil mis à jour",
        });
    } catch (error) {
        console.error("Error updating profile:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
