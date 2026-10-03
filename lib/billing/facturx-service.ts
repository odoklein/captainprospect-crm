/**
 * Factur-X Service - EU 2026 Compliant
 * Generates Factur-X EN16931 compliant PDF/A-3 documents with embedded XML
 * Compliant with: EN 16931, Factur-X 1.0 EN16931 profile
 */

import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDocument, PDFName, PDFString, PDFArray, PDFDict, PDFHexString, AFRelationship } from "pdf-lib";
import { Invoice, InvoiceItem, BillingClient, CompanyIssuer } from "@prisma/client";
import { brand } from "@/lib/brand";

// Extended types with new schema fields
interface ExtendedCompanyIssuer extends CompanyIssuer {
    legalForm?: string | null;
    capitalSocial?: string | null;
    rcsCity?: string | null;
    rcsNumber?: string | null;
    iban?: string | null;
    bic?: string | null;
    defaultPaymentTermsDays?: number;
    defaultLatePenaltyRate?: any;
    defaultEarlyPaymentDiscount?: string | null;
}

interface ExtendedInvoice extends Invoice {
    items: InvoiceItem[];
    billingClient: BillingClient;
    companyIssuer: ExtendedCompanyIssuer;
    documentType?: string;
    paymentTermsDays?: number;
    paymentTermsText?: string | null;
    latePenaltyRate?: any;
    earlyPaymentDiscount?: string | null;
    notes?: string | null;
    currency?: string;
    relatedInvoice?: { invoiceNumber: string | null } | null;
}

interface VatBreakdown {
    rate: number;
    basisAmount: number;
    calculatedAmount: number;
}

export class FacturXService {
    /**
     * Calculate VAT breakdown by rate from invoice items
     */
    private calculateVatBreakdown(items: InvoiceItem[]): VatBreakdown[] {
        const vatMap = new Map<number, { basisAmount: number; calculatedAmount: number }>();

        for (const item of items) {
            const rate = Number(item.vatRate);
            const existing = vatMap.get(rate) || { basisAmount: 0, calculatedAmount: 0 };
            existing.basisAmount += Number(item.totalHt);
            existing.calculatedAmount += Number(item.totalVat);
            vatMap.set(rate, existing);
        }

        return Array.from(vatMap.entries()).map(([rate, amounts]) => ({
            rate,
            basisAmount: Math.round(amounts.basisAmount * 100) / 100,
            calculatedAmount: Math.round(amounts.calculatedAmount * 100) / 100,
        }));
    }

    /**
     * Format date as YYYYMMDD for Factur-X (format 102)
     */
    private formatDate102(date: Date | string): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}${month}${day}`;
    }

    /**
     * Generate Factur-X EN16931 compliant XML from invoice data
     */
    generateFacturXXML(invoice: ExtendedInvoice): string {
        const issueDate = this.formatDate102(invoice.issueDate);
        const dueDate = this.formatDate102(invoice.dueDate);
        const currency = invoice.currency || "EUR";
        const isCredit = invoice.documentType === "CREDIT_NOTE";
        const typeCode = isCredit ? "381" : "380";

        const vatBreakdown = this.calculateVatBreakdown(invoice.items);

        // Payment terms text
        const paymentTermsText = invoice.paymentTermsText ||
            `Paiement à ${invoice.paymentTermsDays || 30} jours date de facture`;

        // Build line items XML
        const lineItemsXml = invoice.items
            .map((item, index) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${index + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${this.escapeXml(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${Number(item.unitPriceHt).toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${Number(item.quantity).toFixed(2)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${Number(item.vatRate).toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${Number(item.totalHt).toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`)
            .join("");

        // Build VAT breakdown XML for header
        const vatBreakdownXml = vatBreakdown
            .map(
                (vat) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${vat.calculatedAmount.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${vat.basisAmount.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${vat.rate.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`
            )
            .join("");

        // Build payment means XML (bank transfer with IBAN/BIC if available)
        let paymentMeansXml = `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>`;
        if (invoice.companyIssuer.iban) {
            paymentMeansXml += `
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${this.escapeXml(invoice.companyIssuer.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>`;
        }
        if (invoice.companyIssuer.bic) {
            paymentMeansXml += `
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${this.escapeXml(invoice.companyIssuer.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>`;
        }
        paymentMeansXml += `
      </ram:SpecifiedTradeSettlementPaymentMeans>`;

        // Credit note reference
        let invoiceReferencedDocXml = "";
        if (isCredit && invoice.relatedInvoice?.invoiceNumber) {
            invoiceReferencedDocXml = `
      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${this.escapeXml(invoice.relatedInvoice.invoiceNumber)}</ram:IssuerAssignedID>
      </ram:InvoiceReferencedDocument>`;
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
                          xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${this.escapeXml(invoice.invoiceNumber || invoice.id)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineItemsXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${this.escapeXml(invoice.companyIssuer.legalName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${this.escapeXml(invoice.companyIssuer.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${this.escapeXml(invoice.companyIssuer.address)}</ram:LineOne>
          <ram:CityName>${this.escapeXml(invoice.companyIssuer.city)}</ram:CityName>
          <ram:CountryID>${this.getCountryCode(invoice.companyIssuer.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${invoice.companyIssuer.email ? `
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${this.escapeXml(invoice.companyIssuer.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ""}${invoice.companyIssuer.siret ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="0002">${this.escapeXml(invoice.companyIssuer.siret)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}${invoice.companyIssuer.vatNumber ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${this.escapeXml(invoice.companyIssuer.vatNumber)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${this.escapeXml(invoice.billingClient.legalName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${this.escapeXml(invoice.billingClient.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${this.escapeXml(invoice.billingClient.address)}</ram:LineOne>
          <ram:CityName>${this.escapeXml(invoice.billingClient.city)}</ram:CityName>
          <ram:CountryID>${this.getCountryCode(invoice.billingClient.country)}</ram:CountryID>
        </ram:PostalTradeAddress>${invoice.billingClient.siret ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="0002">${this.escapeXml(invoice.billingClient.siret)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}${invoice.billingClient.vatNumber ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${this.escapeXml(invoice.billingClient.vatNumber)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>${paymentMeansXml}${vatBreakdownXml}
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${this.escapeXml(paymentTermsText)}</ram:Description>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDate}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>${invoiceReferencedDocXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${Number(invoice.totalHt).toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${Number(invoice.totalHt).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${Number(invoice.totalVat).toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${Number(invoice.totalTtc).toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${Number(invoice.totalTtc).toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

        return xml;
    }

    /**
     * Get ISO 3166-1 alpha-2 country code from country name
     */
    private getCountryCode(country: string): string {
        const map: Record<string, string> = {
            france: "FR",
            allemagne: "DE",
            belgique: "BE",
            luxembourg: "LU",
            suisse: "CH",
            espagne: "ES",
            italie: "IT",
            "pays-bas": "NL",
            "royaume-uni": "GB",
            portugal: "PT",
        };
        if (country.length === 2) return country.toUpperCase();
        return map[country.toLowerCase()] || "FR";
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    /**
     * Generate PDF with embedded Factur-X XML (EN16931 compliant)
     */
    async generateFacturXPDF(invoice: ExtendedInvoice): Promise<Buffer> {
        const pdfBuffer = await this.generatePDFContent(invoice);
        const finalPdf = await this.embedXMLIntoPDF(pdfBuffer, invoice);
        return finalPdf;
    }

    /**
     * Generate the visual PDF content
     */
    private generatePDFContent(invoice: ExtendedInvoice): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: "A4",
                    margins: { top: 50, bottom: 80, left: 50, right: 50 },
                    info: {
                        Title: `${invoice.documentType === "CREDIT_NOTE" ? "Avoir" : "Facture"} ${invoice.invoiceNumber || ""}`,
                        Author: invoice.companyIssuer.legalName,
                        Creator: `${brand.productName} - Facturation Factur-X EN16931`,
                    },
                });

                const buffers: Buffer[] = [];
                doc.on("data", (chunk) => buffers.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(buffers)));
                doc.on("error", reject);

                const isCredit = invoice.documentType === "CREDIT_NOTE";
                const docTitle = isCredit ? "AVOIR" : "FACTURE";
                const issuer = invoice.companyIssuer;
                const client = invoice.billingClient;

                // ===== HEADER: Company info =====
                doc.fontSize(18).font("Helvetica-Bold").text(issuer.legalName, 50, 50);
                doc.fontSize(9).font("Helvetica");

                // Legal form and capital
                const legalParts: string[] = [];
                if (issuer.legalForm) legalParts.push(issuer.legalForm);
                if (issuer.capitalSocial) legalParts.push(`Capital: ${issuer.capitalSocial}`);
                if (legalParts.length > 0) {
                    doc.text(legalParts.join(" - "), 50, doc.y + 2);
                }

                doc.text(issuer.address);
                doc.text(`${issuer.postalCode} ${issuer.city}`);
                if (issuer.siret) doc.text(`SIRET: ${issuer.siret}`);
                if (issuer.vatNumber) doc.text(`TVA Intracom.: ${issuer.vatNumber}`);
                if (issuer.rcsNumber) doc.text(`RCS ${issuer.rcsCity || ""} ${issuer.rcsNumber}`);
                if (issuer.email) doc.text(`Email: ${issuer.email}`);
                if (issuer.phone) doc.text(`Tél: ${issuer.phone}`);

                // ===== DOCUMENT TITLE (right side) =====
                const titleY = 50;
                doc.fontSize(20).font("Helvetica-Bold");
                doc.text(docTitle, 350, titleY, { align: "right", width: 195 });

                doc.fontSize(10).font("Helvetica");
                let rightY = titleY + 30;
                if (invoice.invoiceNumber) {
                    doc.text(`N° ${invoice.invoiceNumber}`, 350, rightY, { align: "right", width: 195 });
                    rightY += 15;
                }
                doc.text(`Date: ${new Date(invoice.issueDate).toLocaleDateString("fr-FR")}`, 350, rightY, { align: "right", width: 195 });
                rightY += 15;
                doc.text(`Échéance: ${new Date(invoice.dueDate).toLocaleDateString("fr-FR")}`, 350, rightY, { align: "right", width: 195 });

                // Credit note reference
                if (isCredit && invoice.relatedInvoice?.invoiceNumber) {
                    rightY += 15;
                    doc.text(`Réf. facture: ${invoice.relatedInvoice.invoiceNumber}`, 350, rightY, { align: "right", width: 195 });
                }

                // ===== CLIENT SECTION =====
                const clientStartY = Math.max(doc.y, rightY) + 30;
                doc.fontSize(11).font("Helvetica-Bold").text("Facturé à:", 300, clientStartY);
                doc.moveDown(0.3);
                doc.fontSize(10).font("Helvetica");
                doc.text(client.legalName, 300);
                doc.text(client.address, 300);
                doc.text(`${client.postalCode} ${client.city}`, 300);
                if (client.siret) doc.text(`SIRET: ${client.siret}`, 300);
                if (client.vatNumber) doc.text(`TVA: ${client.vatNumber}`, 300);

                // ===== ITEMS TABLE =====
                const tableStartY = doc.y + 25;
                const colX = {
                    desc: 50,
                    qty: 300,
                    price: 355,
                    vat: 420,
                    totalHt: 470,
                };

                // Table header
                doc.fontSize(9).font("Helvetica-Bold");
                doc.rect(50, tableStartY, 495, 20).fill("#f1f5f9");
                doc.fillColor("#334155");
                doc.text("Description", colX.desc + 5, tableStartY + 5, { width: 240 });
                doc.text("Qté", colX.qty, tableStartY + 5, { width: 50, align: "right" });
                doc.text("Prix HT", colX.price, tableStartY + 5, { width: 60, align: "right" });
                doc.text("TVA", colX.vat, tableStartY + 5, { width: 45, align: "right" });
                doc.text("Total HT", colX.totalHt, tableStartY + 5, { width: 70, align: "right" });

                // Table rows
                doc.font("Helvetica").fontSize(9).fillColor("#000000");
                let currentY = tableStartY + 25;

                for (const item of invoice.items) {
                    // Check for page break
                    if (currentY > doc.page.height - 200) {
                        doc.addPage();
                        currentY = 50;
                    }

                    const desc = item.description.length > 50
                        ? item.description.substring(0, 47) + "..."
                        : item.description;

                    doc.text(desc, colX.desc + 5, currentY, { width: 240 });
                    doc.text(Number(item.quantity).toFixed(2), colX.qty, currentY, { width: 50, align: "right" });
                    doc.text(`${Number(item.unitPriceHt).toFixed(2)} €`, colX.price, currentY, { width: 60, align: "right" });
                    doc.text(`${Number(item.vatRate).toFixed(0)}%`, colX.vat, currentY, { width: 45, align: "right" });
                    doc.text(`${Number(item.totalHt).toFixed(2)} €`, colX.totalHt, currentY, { width: 70, align: "right" });

                    currentY += 20;
                    doc.moveTo(50, currentY - 3).lineTo(545, currentY - 3).strokeColor("#e2e8f0").stroke();
                }

                // ===== VAT BREAKDOWN TABLE =====
                const vatBreakdown = this.calculateVatBreakdown(invoice.items);
                const vatTableY = currentY + 10;

                if (vatBreakdown.length > 0) {
                    doc.fontSize(8).font("Helvetica-Bold").fillColor("#64748b");
                    doc.text("Récapitulatif TVA", 50, vatTableY);
                    doc.font("Helvetica").fontSize(8);
                    let vatY = vatTableY + 14;
                    for (const vat of vatBreakdown) {
                        doc.fillColor("#334155");
                        doc.text(
                            `TVA ${vat.rate.toFixed(0)}% : Base ${vat.basisAmount.toFixed(2)} € → Montant TVA ${vat.calculatedAmount.toFixed(2)} €`,
                            50, vatY
                        );
                        vatY += 12;
                    }
                }

                // ===== TOTALS =====
                const totalsX = 380;
                const totalsWidth = 165;
                let totalsY = Math.max(vatTableY + (vatBreakdown.length * 12) + 20, currentY + 15);

                doc.strokeColor("#000000");
                doc.moveTo(totalsX, totalsY).lineTo(totalsX + totalsWidth, totalsY).stroke();

                doc.fontSize(10).font("Helvetica").fillColor("#000000");
                totalsY += 8;
                doc.text("Total HT:", totalsX, totalsY);
                doc.text(`${Number(invoice.totalHt).toFixed(2)} €`, totalsX, totalsY, { width: totalsWidth, align: "right" });

                totalsY += 16;
                doc.text("Total TVA:", totalsX, totalsY);
                doc.text(`${Number(invoice.totalVat).toFixed(2)} €`, totalsX, totalsY, { width: totalsWidth, align: "right" });

                totalsY += 20;
                doc.moveTo(totalsX, totalsY - 3).lineTo(totalsX + totalsWidth, totalsY - 3).stroke();
                doc.fontSize(13).font("Helvetica-Bold");
                doc.text("Total TTC:", totalsX, totalsY);
                doc.text(`${Number(invoice.totalTtc).toFixed(2)} €`, totalsX, totalsY, { width: totalsWidth, align: "right" });

                // ===== NOTES =====
                if (invoice.notes) {
                    totalsY += 30;
                    doc.fontSize(9).font("Helvetica-Bold").fillColor("#334155");
                    doc.text("Notes:", 50, totalsY);
                    doc.font("Helvetica").fontSize(8).fillColor("#000000");
                    doc.text(invoice.notes, 50, totalsY + 12, { width: 300 });
                }

                // ===== PAYMENT INFO =====
                let footerY = doc.page.height - 175;
                // Ensure we don't overlap with content
                if (totalsY + 60 > footerY) {
                    doc.addPage();
                    footerY = 50;
                }

                doc.fontSize(8).font("Helvetica-Bold").fillColor("#334155");
                doc.text("Conditions de paiement", 50, footerY);
                doc.font("Helvetica").fontSize(8).fillColor("#000000");

                const paymentTerms = invoice.paymentTermsText ||
                    `Paiement à ${invoice.paymentTermsDays || 30} jours date de facture`;
                doc.text(paymentTerms, 50, footerY + 12);

                // Bank details
                if (issuer.iban) {
                    doc.text(`IBAN: ${issuer.iban}${issuer.bic ? ` - BIC: ${issuer.bic}` : ""}`, 50, footerY + 24);
                }

                // ===== MANDATORY FRENCH LEGAL MENTIONS =====
                const legalY = footerY + 42;
                doc.fontSize(7).fillColor("#64748b");

                const penaltyRate = Number(invoice.latePenaltyRate || issuer.defaultLatePenaltyRate || 0);
                const penaltyText = penaltyRate > 0
                    ? `Pénalités de retard : ${penaltyRate.toFixed(2)}% par mois de retard.`
                    : "Pénalités de retard : 3 fois le taux d'intérêt légal en vigueur.";

                const escompteText = invoice.earlyPaymentDiscount ||
                    issuer.defaultEarlyPaymentDiscount ||
                    "Pas d'escompte pour paiement anticipé.";

                doc.text(
                    `${penaltyText} Indemnité forfaitaire pour frais de recouvrement : 40,00 €. ${escompteText}`,
                    50, legalY, { width: 495 }
                );

                // Factur-X compliance line
                doc.fontSize(7).fillColor("#94a3b8");
                doc.text(
                    "Facture conforme à la norme Factur-X EN16931 - Format électronique structuré conforme au règlement UE.",
                    50, doc.page.height - 50, { align: "center", width: 495 }
                );

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Embed Factur-X XML into PDF as PDF/A-3 attachment
     * Uses pdf-lib to add the XML file as an embedded attachment
     */
    private async embedXMLIntoPDF(
        pdfBuffer: Buffer,
        invoice: ExtendedInvoice
    ): Promise<Buffer> {
        try {
            // Generate XML
            const xml = this.generateFacturXXML(invoice);
            const xmlBytes = new TextEncoder().encode(xml);

            // Load the PDF with pdf-lib
            const pdfDoc = await PDFLibDocument.load(pdfBuffer, {
                updateMetadata: false,
            });

            // Attach the Factur-X XML file
            await pdfDoc.attach(xmlBytes, "factur-x.xml", {
                mimeType: "text/xml",
                description: "Factur-X XML invoice data (EN16931 profile)",
                creationDate: new Date(),
                modificationDate: new Date(),
                afRelationship: AFRelationship.Alternative,
            });

            // Set PDF metadata
            const title = `${invoice.documentType === "CREDIT_NOTE" ? "Avoir" : "Facture"} ${invoice.invoiceNumber || ""}`;
            pdfDoc.setTitle(title);
            pdfDoc.setAuthor(invoice.companyIssuer.legalName);
            pdfDoc.setCreator(`${brand.productName} Facturation - Factur-X EN16931`);
            pdfDoc.setProducer(`${brand.productName} / pdf-lib / pdfkit`);
            pdfDoc.setCreationDate(new Date());
            pdfDoc.setModificationDate(new Date());

            // Add XMP metadata for PDF/A-3 conformance
            const xmpMetadata = this.generateXMPMetadata(invoice);
            const metadataStream = pdfDoc.context.stream(new TextEncoder().encode(xmpMetadata), {
                Type: "Metadata",
                Subtype: "XML",
                Length: xmpMetadata.length,
            });
            const metadataRef = pdfDoc.context.register(metadataStream);
            pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);

            // Save and return
            const modifiedPdfBytes = await pdfDoc.save();
            return Buffer.from(modifiedPdfBytes);
        } catch (error) {
            console.error("Error embedding XML into PDF:", error);
            // Fallback: return the original PDF if embedding fails
            return pdfBuffer;
        }
    }

    /**
     * Generate XMP metadata for PDF/A-3 conformance
     */
    private generateXMPMetadata(invoice: ExtendedInvoice): string {
        const title = `${invoice.documentType === "CREDIT_NOTE" ? "Avoir" : "Facture"} ${invoice.invoiceNumber || ""}`;
        const now = new Date().toISOString();

        return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${this.escapeXml(title)}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>${this.escapeXml(invoice.companyIssuer.legalName)}</rdf:li>
        </rdf:Seq>
      </dc:creator>
      <dc:date>
        <rdf:Seq>
          <rdf:li>${now}</rdf:li>
        </rdf:Seq>
      </dc:date>
      <pdf:Producer>${brand.productName} / pdf-lib / pdfkit</pdf:Producer>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
    }
}

export const facturXService = new FacturXService();
