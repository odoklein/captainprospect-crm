// ============================================
// EMAIL TEMPLATE DETAIL API ROUTES
// GET /api/email/templates/[id] - Get template
// PATCH /api/email/templates/[id] - Update template
// DELETE /api/email/templates/[id] - Delete template
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
// GET - Get template
// ============================================

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { id } = await params;

        const template = await prisma.emailTemplate.findUnique({
            where: { id },
            include: TEMPLATE_INCLUDE,
        });

        if (!template) {
            return NextResponse.json(
                { success: false, error: 'Template non trouvé' },
                { status: 404 }
            );
        }

        // Check access
        if (template.createdById !== session.user.id && !template.isShared) {
            return NextResponse.json(
                { success: false, error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            success: true,
            data: template,
        });
    } catch (error) {
        console.error('GET /api/email/templates/[id] error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// ============================================
// PATCH - Update template
// ============================================

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { id } = await params;
        const body = await req.json();

        // Check ownership
        const template = await prisma.emailTemplate.findUnique({
            where: { id },
            select: { createdById: true, subject: true, bodyHtml: true },
        });

        if (!template) {
            return NextResponse.json(
                { success: false, error: 'Template non trouvé' },
                { status: 404 }
            );
        }

        if (template.createdById !== session.user.id && session.user.role !== 'MANAGER') {
            return NextResponse.json(
                { success: false, error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        if (body.name !== undefined && !String(body.name).trim()) {
            return NextResponse.json({ success: false, error: 'Le nom est requis' }, { status: 400 });
        }
        if (body.subject !== undefined && !String(body.subject).trim()) {
            return NextResponse.json({ success: false, error: 'Le sujet est requis' }, { status: 400 });
        }

        // Build update data
        const updateData: Record<string, unknown> = {};
        
        if (body.name !== undefined) updateData.name = body.name.trim();
        if (body.subject !== undefined) updateData.subject = body.subject.trim();
        if (body.bodyHtml !== undefined) updateData.bodyHtml = body.bodyHtml;
        if (body.bodyText !== undefined) updateData.bodyText = body.bodyText;
        if (body.category !== undefined) updateData.category = normalizeTemplateCategory(body.category);
        if (body.isShared !== undefined) updateData.isShared = body.isShared;
        if (body.subject !== undefined || body.bodyHtml !== undefined) {
            updateData.variables = extractVariables(
                `${body.subject ?? template.subject} ${body.bodyHtml ?? template.bodyHtml}`,
            );
        }

        const updated = await prisma.emailTemplate.update({
            where: { id },
            data: updateData,
            include: TEMPLATE_INCLUDE,
        });

        return NextResponse.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        console.error('PATCH /api/email/templates/[id] error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// ============================================
// DELETE - Delete template
// ============================================

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { id } = await params;

        // Check ownership
        const template = await prisma.emailTemplate.findUnique({
            where: { id },
            select: { createdById: true },
        });

        if (!template) {
            return NextResponse.json(
                { success: false, error: 'Template non trouvé' },
                { status: 404 }
            );
        }

        if (template.createdById !== session.user.id && session.user.role !== 'MANAGER') {
            return NextResponse.json(
                { success: false, error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        await prisma.emailTemplate.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE /api/email/templates/[id] error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
