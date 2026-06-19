import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { calculateContactCompleteness } from '@/lib/scoring';
import { z } from 'zod';

// ============================================
// SCHEMAS — all fields optional; empty string treated as null (partial updates, no "fill all" requirement)
// ============================================

// Empty string → null so "clear field" works; undefined means "omit / leave unchanged"
const emptyStringToNull = (v: unknown): unknown => (v === "" ? null : v);

const updateContactSchema = z.object({
    firstName: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
    lastName: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
    title: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
    email: z.preprocess(emptyStringToNull, z.string().email().optional().nullable()),
    phone: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
    additionalPhones: z.array(z.string()).optional().nullable(),
    additionalEmails: z.preprocess(
        (arr) => (Array.isArray(arr) ? arr.filter((s) => typeof s === "string" && s.trim() !== "") : arr),
        z.array(z.string().email()).optional().nullable()
    ),
    linkedin: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
});

// ============================================
// HELPER: Update company completeness
// ============================================

async function updateCompanyCompleteness(companyId: string) {
    const contacts = await prisma.contact.findMany({
        where: { companyId },
        select: { status: true },
    });

    let companyStatus: 'INCOMPLETE' | 'PARTIAL' | 'ACTIONABLE' = 'INCOMPLETE';

    if (contacts.some((c) => c.status === 'ACTIONABLE')) {
        companyStatus = 'ACTIONABLE';
    } else if (contacts.some((c) => c.status === 'PARTIAL')) {
        companyStatus = 'PARTIAL';
    }

    await prisma.company.update({
        where: { id: companyId },
        data: { status: companyStatus },
    });
}

// ============================================
// GET /api/contacts/[id] - Get single contact
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;

    const contact = await prisma.contact.findUnique({
        where: { id },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    industry: true,
                    phone: true,
                    customData: true,
                    list: {
                        select: {
                            id: true,
                            name: true,
                            mission: {
                                select: {
                                    id: true,
                                    name: true,
                                    client: {
                                        select: { id: true, name: true },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            _count: {
                select: { actions: true, opportunities: true },
            },
        },
    });

    if (!contact) {
        return errorResponse('Contact non trouvé', 404);
    }

    return successResponse(contact);
});

// ============================================
// PUT /api/contacts/[id] - Update contact
// ============================================

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateContactSchema);

    const contact = await prisma.contact.findUnique({
        where: { id },
    });

    if (!contact) {
        return errorResponse('Contact non trouvé', 404);
    }

    // Merge data for status calculation
    const mergedData = {
        firstName: data.firstName ?? contact.firstName,
        lastName: data.lastName ?? contact.lastName,
        email: data.email ?? contact.email,
        phone: data.phone ?? contact.phone,
        linkedin: data.linkedin ?? contact.linkedin,
        title: data.title ?? contact.title,
    };

    const status = calculateContactCompleteness(mergedData);

    const updated = await prisma.contact.update({
        where: { id },
        data: {
            ...mergedData,
            status,
            ...(data.additionalPhones !== undefined && { additionalPhones: data.additionalPhones }),
            ...(data.additionalEmails !== undefined && { additionalEmails: data.additionalEmails }),
        },
        include: {
            company: {
                select: { id: true, name: true },
            },
        },
    });

    // Update company completeness
    await updateCompanyCompleteness(contact.companyId);

    return successResponse(updated);
});

// ============================================
// DELETE /api/contacts/[id] - Delete contact
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR'], request);
    const { id } = await params;

    const contact = await prisma.contact.findUnique({
        where: { id },
    });

    if (!contact) {
        return errorResponse('Contact non trouvé', 404);
    }

    await prisma.contact.delete({
        where: { id },
    });

    // Update company completeness
    await updateCompanyCompleteness(contact.companyId);

    return successResponse({ message: 'Contact supprimé' });
});
