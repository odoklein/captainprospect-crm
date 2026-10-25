// ============================================
// EMAIL TEMPLATES API ROUTES
// GET /api/email/templates - List templates (+ mission assignments)
//     ?withMissions=1 also returns `missions`: the missions a template can be
//     assigned to (light rows for the library filters and the editor).
// POST /api/email/templates - Create template (optionally assign missionIds)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractVariables } from '@/lib/email/services/template-variables';
import { normalizeTemplateCategory } from '@/components/email/templates/template-categories';

const TEMPLATE_INCLUDE = {
    createdBy: { select: { id: true, name: true } },
    missionTemplates: {
        select: {
            missionId: true,
            mission: { select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } } },
        },
    },
} as const;

// ============================================
// GET - List templates
// ============================================

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const category = searchParams.get('category');
        const search = searchParams.get('search');
        const withMissions = searchParams.get('withMissions') === '1';

        const and: Record<string, unknown>[] = [
            { OR: [{ createdById: session.user.id }, { isShared: true }] },
        ];

        if (category) {
            // Legacy rows use several spellings: match every alias of the canonical value.
            const canonical = normalizeTemplateCategory(category);
            const all = await prisma.emailTemplate.findMany({ distinct: ['category'], select: { category: true } });
            const spellings = all.map((t) => t.category).filter((c) => normalizeTemplateCategory(c) === canonical);
            and.push({ category: { in: spellings.length ? spellings : [canonical] } });
        }

        if (search) {
            and.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { subject: { contains: search, mode: 'insensitive' } },
                ],
            });
        }

        const [templates, missions] = await Promise.all([
            prisma.emailTemplate.findMany({
                where: { AND: and },
                orderBy: { updatedAt: 'desc' },
                include: TEMPLATE_INCLUDE,
            }),
            withMissions
                ? prisma.mission.findMany({
                    where: { status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
                    select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } },
                    orderBy: [{ status: 'asc' }, { name: 'asc' }],
                    take: 500,
                })
                : Promise.resolve(null),
        ]);

        return NextResponse.json({
            success: true,
            data: templates,
            ...(missions ? { missions } : {}),
        });
    } catch (error) {
        console.error('GET /api/email/templates error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// ============================================
// POST - Create template
// ============================================

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }
        if (session.user.role === 'CLIENT') {
            return NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
        }

        const body = await req.json();
        const { name, subject, bodyHtml, bodyText, category, isShared, missionIds } = body;

        if (!name?.trim()) {
            return NextResponse.json(
                { success: false, error: 'Le nom est requis' },
                { status: 400 }
            );
        }

        if (!subject?.trim()) {
            return NextResponse.json(
                { success: false, error: 'Le sujet est requis' },
                { status: 400 }
            );
        }

        const html: string = bodyHtml || '';
        const assign: string[] = Array.isArray(missionIds)
            ? Array.from(new Set(missionIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)))
            : [];

        const template = await prisma.$transaction(async (tx) => {
            const created = await tx.emailTemplate.create({
                data: {
                    name: name.trim(),
                    subject: subject.trim(),
                    bodyHtml: html,
                    bodyText: bodyText || '',
                    category: normalizeTemplateCategory(category),
                    // Templates are a team library: shared unless explicitly private.
                    isShared: isShared !== false,
                    variables: extractVariables(`${subject} ${html}`),
                    createdById: session.user.id,
                },
            });

            for (const missionId of assign) {
                const max = await tx.missionEmailTemplate.findFirst({
                    where: { missionId },
                    orderBy: { order: 'desc' },
                    select: { order: true },
                });
                await tx.missionEmailTemplate.create({
                    data: { missionId, templateId: created.id, order: (max?.order ?? 0) + 1 },
                });
            }

            return tx.emailTemplate.findUniqueOrThrow({ where: { id: created.id }, include: TEMPLATE_INCLUDE });
        });

        return NextResponse.json({
            success: true,
            data: template,
        });
    } catch (error) {
        console.error('POST /api/email/templates error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
