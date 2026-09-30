import { NextRequest, NextResponse } from "next/server";
import {
    errorResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

// ============================================
// GET /api/billing/export - Export invoices as CSV
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const format = searchParams.get("format") || "csv";

    const where: any = {
        status: { notIn: [InvoiceStatus.DRAFT] },
    };

    if (startDate) {
        where.issueDate = { ...where.issueDate, gte: new Date(startDate) };
    }
    if (endDate) {
        where.issueDate = { ...where.issueDate, lte: new Date(endDate) };
    }

    const invoices = await prisma.invoice.findMany({
        where,
        include: {
            billingClient: true,
            items: true,
        },
        orderBy: { issueDate: "asc" },
    });

    // CSV header
    const headers = [
        "Numéro",
        "Type",
        "Statut",
        "Date émission",
        "Date échéance",
        "Client",
        "SIRET Client",
        "TVA Client",
        "Total HT",
        "Total TVA",
        "Total TTC",
        "Devise",
        "Conditions paiement",
    ];

    const rows = invoices.map((inv) => [
        inv.invoiceNumber || "",
        inv.documentType === "CREDIT_NOTE" ? "Avoir" : "Facture",
        inv.status,
        new Date(inv.issueDate).toLocaleDateString("fr-FR"),
        new Date(inv.dueDate).toLocaleDateString("fr-FR"),
        inv.billingClient.legalName,
        inv.billingClient.siret || "",
        inv.billingClient.vatNumber || "",
        Number(inv.totalHt).toFixed(2),
        Number(inv.totalVat).toFixed(2),
        Number(inv.totalTtc).toFixed(2),
        (inv as any).currency || "EUR",
        (inv as any).paymentTermsText || `${(inv as any).paymentTermsDays || 30} jours`,
    ]);

    // Build CSV content
    const csvContent = [
        headers.join(";"),
        ...rows.map((row) =>
            row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
        ),
    ].join("\n");

    // Add BOM for Excel UTF-8 compatibility
    const bom = "\uFEFF";
    const csvBuffer = Buffer.from(bom + csvContent, "utf-8");

    const filename = `export-facturation-${new Date().toISOString().split("T")[0]}.csv`;

    audit(request, session, {
        action: AUDIT_ACTIONS.EXPORT,
        entityType: "Invoice",
        summary: `Export facturation CSV — ${invoices.length} facture(s)`,
        metadata: { rowCount: invoices.length, format, startDate, endDate, filename },
    });

    return new NextResponse(csvBuffer, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
});
