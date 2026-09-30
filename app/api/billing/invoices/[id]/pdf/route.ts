import { NextRequest, NextResponse } from "next/server";
import {
    errorResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { invoiceService } from "@/lib/billing/invoice-service";
import { storageService } from "@/lib/storage/storage-service";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

// ============================================
// GET /api/billing/invoices/[id]/pdf - Download PDF
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;

    const invoice = await invoiceService.getInvoice(id);

    if (!invoice) {
        return errorResponse("Facture non trouvée", 404);
    }

    if (!invoice.facturxPdfUrl) {
        return errorResponse("PDF non disponible. La facture doit être validée.", 400);
    }

    // Extract storage key from URL (full path after /uploads/ or after bucket)
    // Local: /uploads/invoices/{userId}/{timestamp}/{uuid}.pdf
    // S3: https://bucket.s3.../invoices/{userId}/{timestamp}/{uuid}.pdf
    const url = invoice.facturxPdfUrl;
    const key = url.includes("/uploads/")
        ? url.split("/uploads/")[1] ?? url
        : url.split("/").slice(-4).join("/"); // S3: take last 4 segments (invoices/userId/timestamp/file.pdf)

    try {
        // Download PDF from storage
        const pdfBuffer = await storageService.download(key);

        audit(request, session, {
            action: AUDIT_ACTIONS.EXPORT,
            entityType: "Invoice",
            entityId: id,
            summary: `Téléchargement PDF facture ${invoice.invoiceNumber || id}`,
            metadata: { invoiceNumber: invoice.invoiceNumber, format: "pdf" },
        });

        // Return PDF as response (Uint8Array is valid BodyInit; Buffer is not in DOM types)
        return new NextResponse(new Uint8Array(pdfBuffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="facture-${invoice.invoiceNumber || id}.pdf"`,
            },
        });
    } catch (error) {
        console.error("Error downloading PDF:", error);
        return errorResponse("Erreur lors du téléchargement du PDF", 500);
    }
});
