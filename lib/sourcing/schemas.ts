import { z } from "zod";

// ============================================
// SOURCING — request schemas shared by the API routes.
// ============================================

export const activitySchema = z.object({
    label: z.string().trim().min(1).max(80),
    naf: z.string().regex(/^\d{2}\.\d{2}[A-Z]$/).optional(),
});

export const querySchema = z.object({
    activities: z.array(activitySchema).min(1, "Ajoutez au moins une activité").max(10),
    // 101 départements = "toute la France" picked département by département.
    locations: z.array(z.string().trim().min(1).max(80)).min(1, "Ajoutez au moins une localisation").max(150),
    perSearch: z.number().int().min(5).max(200).default(50),
    activeOnly: z.boolean().default(true),
    headcount: z.array(z.string().regex(/^\d{2}$/)).max(12).optional(),
});

const contactSchema = z.object({
    firstName: z.string().max(120).optional(),
    lastName: z.string().max(120).optional(),
    title: z.string().max(200).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
    linkedin: z.string().max(300).optional(),
});

export const leadSchema = z.object({
    id: z.string().max(300),
    sources: z.array(z.enum(["gmaps", "annuaire", "apollo"])).min(1),
    name: z.string().trim().min(1).max(300),
    industry: z.string().max(200).optional(),
    naf: z.string().max(10).optional(),
    website: z.string().max(300).optional(),
    phone: z.string().max(40).optional(),
    address: z.string().max(400).optional(),
    postalCode: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(60).optional(),
    siren: z.string().max(20).optional(),
    headcount: z.string().max(40).optional(),
    rating: z.number().optional(),
    reviews: z.number().optional(),
    mapsUrl: z.string().max(1000).optional(),
    linkedin: z.string().max(300).optional(),
    closed: z.boolean().optional(),
    contacts: z.array(contactSchema).max(20).default([]),
});
