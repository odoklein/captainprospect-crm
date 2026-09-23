/**
 * Smart Booking Assistant Engine
 * Automates calendar pre-filling, smart clipboard parsing, quick slot generation,
 * and eliminates double-entry between client calendars and CRM calendars.
 */

export interface ParsedMeetingInfo {
    date: string | null; // ISO string
    displayDate: string | null; // Human readable French format
    meetingType: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null;
    joinUrl: string | null;
    phone: string | null;
    address: string | null;
    rawMatchedText: string;
}

export interface BookingContactDetails {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    title?: string | null;
    companyName?: string | null;
    companyEmail?: string | null;
    companyPhone?: string | null;
}

/**
 * Automatically injects contact information into known booking provider URLs
 * (Calendly, Cal.com, HubSpot Meetings, SavvyCal, TidyCal, etc.).
 * Eliminates re-typing the prospect's info in the client's booking form.
 */
export function buildIntelligentBookingUrl(
    rawUrl: string,
    contact?: BookingContactDetails,
    fallbackName?: string
): string {
    if (!rawUrl || typeof rawUrl !== "string") return "";

    try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();

        const firstName = contact?.firstName?.trim() || "";
        const lastName = contact?.lastName?.trim() || "";
        const fullName = [firstName, lastName].filter(Boolean).join(" ") || fallbackName?.trim() || "";
        const email = contact?.email?.trim() || "";
        const phone = contact?.phone?.trim() || contact?.companyPhone?.trim() || "";
        const company = contact?.companyName?.trim() || "";

        // Cal.com
        if (host === "cal.com" || host.endsWith(".cal.com")) {
            url.searchParams.set("embed", "true");
            if (fullName) url.searchParams.set("name", fullName);
            if (email) url.searchParams.set("email", email);
            if (phone) url.searchParams.set("phone", phone);
            const notes = [
                company ? `Société: ${company}` : "",
                contact?.title ? `Poste: ${contact.title}` : "",
                phone ? `Tél: ${phone}` : "",
            ].filter(Boolean).join(" | ");
            if (notes) url.searchParams.set("notes", notes);
        }

        // Calendly
        else if (host === "calendly.com" || host.endsWith(".calendly.com")) {
            url.searchParams.set(
                "embed_domain",
                typeof window !== "undefined" ? window.location.hostname : "localhost"
            );
            url.searchParams.set("embed_type", "Inline");
            url.searchParams.set("hide_gdpr_banner", "1");
            if (fullName) url.searchParams.set("name", fullName);
            if (firstName) url.searchParams.set("first_name", firstName);
            if (lastName) url.searchParams.set("last_name", lastName);
            if (email) url.searchParams.set("email", email);
            if (phone) {
                url.searchParams.set("a1", phone);
                url.searchParams.set("phone", phone);
                url.searchParams.set("primary_phone", phone);
            }
            if (company) {
                url.searchParams.set("a2", company);
            }
        }

        // HubSpot Meetings
        else if (host.endsWith("hubspot.com") && url.pathname.includes("/meetings")) {
            url.searchParams.set("embed", "true");
            if (firstName) url.searchParams.set("firstname", firstName);
            if (lastName) url.searchParams.set("lastname", lastName);
            if (email) url.searchParams.set("email", email);
            if (phone) url.searchParams.set("phone", phone);
            if (company) url.searchParams.set("company", company);
        }

        // TidyCal
        else if (host === "tidycal.com" || host.endsWith(".tidycal.com")) {
            if (fullName) url.searchParams.set("name", fullName);
            if (email) url.searchParams.set("email", email);
        }

        // SavvyCal
        else if (host === "savvycal.com" || host.endsWith(".savvycal.com")) {
            if (fullName) url.searchParams.set("name", fullName);
            if (email) url.searchParams.set("email", email);
            if (phone) url.searchParams.set("phone", phone);
        }

        return url.toString();
    } catch {
        return rawUrl;
    }
}

const MONTHS_FR: Record<string, number> = {
    janv: 0, janvier: 0,
    fevr: 1, févr: 1, fevrier: 1, février: 1,
    mars: 2,
    avr: 3, avril: 3,
    mai: 4,
    juin: 5,
    juil: 6, juillet: 6,
    aout: 7, août: 7,
    sept: 8, septembre: 8,
    oct: 9, octobre: 9,
    nov: 10, novembre: 10,
    dec: 11, déc: 11, decembre: 11, décembre: 11,
    // English fallbacks
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8,
    october: 9,
    november: 10,
    december: 11,
};

const DAYS_FR: Record<string, number> = {
    dimanche: 0, sunday: 0,
    lundi: 1, monday: 1,
    mardi: 2, tuesday: 2,
    mercredi: 3, wednesday: 3,
    jeudi: 4, thursday: 4,
    vendredi: 5, friday: 5,
    samedi: 6, saturday: 6,
};

/**
 * Intelligent NLP & Regex Parser that extracts meeting date, time, type, and join URL
 * from any arbitrary text copied from calendars, confirmation emails, or client messages.
 */
export function parseMeetingText(rawText: string): ParsedMeetingInfo {
    const text = (rawText || "").trim();
    if (!text) {
        return {
            date: null,
            displayDate: null,
            meetingType: null,
            joinUrl: null,
            phone: null,
            address: null,
            rawMatchedText: "",
        };
    }

    let detectedDate: Date | null = null;
    let detectedType: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null = null;
    let detectedJoinUrl: string | null = null;
    let detectedPhone: string | null = null;

    // 1. Detect Join URLs (Google Meet, Zoom, Teams, Webex)
    const joinUrlRegex = /https?:\/\/(meet\.google\.com\/[a-z0-9\-]+|[\w\-]+\.zoom\.us\/j\/[0-9]+(\?[^\s]*)?|teams\.microsoft\.com\/[^\s]+|[\w\-]+\.webex\.com\/[^\s]+)/i;
    const urlMatch = text.match(joinUrlRegex);
    if (urlMatch) {
        detectedJoinUrl = urlMatch[0];
        detectedType = "VISIO";
    }

    // 2. Detect meeting type keywords
    if (!detectedType) {
        if (/visio|meet(ing)?|zoom|teams|webex|cam(era)?|vidéo|video/i.test(text)) {
            detectedType = "VISIO";
        } else if (/téléphon(e|ique)|call|appel|tel/i.test(text)) {
            detectedType = "TELEPHONIQUE";
        } else if (/physique|présentiel|locaux|bureau|adresse|sur place/i.test(text)) {
            detectedType = "PHYSIQUE";
        }
    }

    // 3. Detect phone numbers (FR format: 06 12 34 56 78, +33 6 ...)
    const phoneRegex = /(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/;
    const phoneMatch = text.match(phoneRegex);
    if (phoneMatch) {
        detectedPhone = phoneMatch[0].replace(/[\s.-]/g, "");
    }

    // 4. Time extraction helper (e.g. 14h30, 14h, 14:30, 2:30pm)
    let hours = 10;
    let minutes = 0;
    let hasExplicitTime = false;

    const timeRegex = /(?:à|a|at)?\s*(\d{1,2})(?:[h:](\d{2})|\s*(am|pm))\b/i;
    const timeMatch = text.match(timeRegex);
    if (timeMatch) {
        hasExplicitTime = true;
        let h = parseInt(timeMatch[1], 10);
        const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const meridian = timeMatch[3]?.toLowerCase();

        if (meridian === "pm" && h < 12) h += 12;
        if (meridian === "am" && h === 12) h = 0;

        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            hours = h;
            minutes = m;
        }
    }

    const now = new Date();

    // 5. Detect ISO date directly (e.g., 2026-09-24T14:30:00)
    const isoRegex = /\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/;
    const isoMatch = text.match(isoRegex);
    if (isoMatch) {
        const y = parseInt(isoMatch[1], 10);
        const mo = parseInt(isoMatch[2], 10) - 1;
        const d = parseInt(isoMatch[3], 10);
        const h = isoMatch[4] ? parseInt(isoMatch[4], 10) : hours;
        const mi = isoMatch[5] ? parseInt(isoMatch[5], 10) : minutes;
        detectedDate = new Date(y, mo, d, h, mi);
    }

    // 6. Detect French numeric date: DD/MM/YYYY or DD-MM-YYYY
    if (!detectedDate) {
        const numericDateRegex = /\b(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?\b/;
        const numMatch = text.match(numericDateRegex);
        if (numMatch) {
            const d = parseInt(numMatch[1], 10);
            const mo = parseInt(numMatch[2], 10) - 1;
            let y = numMatch[3] ? parseInt(numMatch[3], 10) : now.getFullYear();
            if (y < 100) y += 2000;
            if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) {
                detectedDate = new Date(y, mo, d, hours, minutes);
            }
        }
    }

    // 7. Detect relative dates: aujourd'hui, demain, après-demain
    if (!detectedDate) {
        if (/aujourd['’]hui|today/i.test(text)) {
            detectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
        } else if (/demain|tomorrow/i.test(text)) {
            const tm = new Date(now);
            tm.setDate(tm.getDate() + 1);
            detectedDate = new Date(tm.getFullYear(), tm.getMonth(), tm.getDate(), hours, minutes);
        } else if (/apr[eè]s[- ]demain/i.test(text)) {
            const tm = new Date(now);
            tm.setDate(tm.getDate() + 2);
            detectedDate = new Date(tm.getFullYear(), tm.getMonth(), tm.getDate(), hours, minutes);
        }
    }

    // 8. Detect textual month dates: e.g. "jeudi 25 septembre", "14 octobre 2026"
    if (!detectedDate) {
        const textDateRegex = /(?:(\d{1,2})\s+)?([a-zéûè]+)(?:\s+(\d{1,2}))?(?:\s+(\d{4}))?/i;
        const words = text.toLowerCase().split(/[,\s]+/);

        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const cleanWord = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Check if word is a month name
            if (cleanWord in MONTHS_FR || w in MONTHS_FR) {
                const monthIndex = MONTHS_FR[cleanWord] ?? MONTHS_FR[w];
                let day = 1;
                let year = now.getFullYear();

                // Look behind for day
                if (i > 0 && /^\d{1,2}$/.test(words[i - 1])) {
                    day = parseInt(words[i - 1], 10);
                } else if (i < words.length - 1 && /^\d{1,2}$/.test(words[i + 1])) {
                    day = parseInt(words[i + 1], 10);
                }

                // Look ahead for year
                if (i < words.length - 2 && /^\d{4}$/.test(words[i + 2])) {
                    year = parseInt(words[i + 2], 10);
                } else if (i < words.length - 1 && /^\d{4}$/.test(words[i + 1])) {
                    year = parseInt(words[i + 1], 10);
                }

                if (day >= 1 && day <= 31) {
                    detectedDate = new Date(year, monthIndex, day, hours, minutes);
                    break;
                }
            }
        }
    }

    // 9. Detect day of week: e.g. "jeudi à 15h"
    if (!detectedDate) {
        for (const [dayName, dayIndex] of Object.entries(DAYS_FR)) {
            const reg = new RegExp(`\\b${dayName}\\b`, "i");
            if (reg.test(text)) {
                const currentDay = now.getDay();
                let diff = dayIndex - currentDay;
                if (diff <= 0) diff += 7; // Next occurrence of that day
                const target = new Date(now);
                target.setDate(target.getDate() + diff);
                detectedDate = new Date(target.getFullYear(), target.getMonth(), target.getDate(), hours, minutes);
                break;
            }
        }
    }

    let displayDate: string | null = null;
    let isoDate: string | null = null;

    if (detectedDate && !isNaN(detectedDate.getTime())) {
        isoDate = detectedDate.toISOString();
        displayDate = detectedDate.toLocaleString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return {
        date: isoDate,
        displayDate,
        meetingType: detectedType,
        joinUrl: detectedJoinUrl,
        phone: detectedPhone,
        address: null,
        rawMatchedText: text.slice(0, 140),
    };
}

/**
 * Returns 4 immediate, realistic smart slot suggestions for rapid 1-click booking
 * based on current business hours (excluding weekends).
 */
export function getSmartQuickSlots(): Array<{
    label: string;
    sublabel: string;
    isoDate: string;
    tag: string;
}> {
    const slots: Array<{ label: string; sublabel: string; isoDate: string; tag: string }> = [];
    const now = new Date();

    const getNextBusinessDay = (date: Date, daysAhead: number): Date => {
        const d = new Date(date);
        let added = 0;
        while (added < daysAhead) {
            d.setDate(d.getDate() + 1);
            const dayOfWeek = d.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                added++;
            }
        }
        return d;
    };

    // Slot 1: Tomorrow morning (10:00)
    const day1 = getNextBusinessDay(now, 1);
    day1.setHours(10, 0, 0, 0);
    const day1Label = day1.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    slots.push({
        tag: "Demain matin",
        label: `${day1Label} à 10h00`,
        sublabel: "Créneau standard",
        isoDate: day1.toISOString(),
    });

    // Slot 2: Tomorrow afternoon (14:30)
    const day1Aft = new Date(day1);
    day1Aft.setHours(14, 30, 0, 0);
    slots.push({
        tag: "Demain aprèm",
        label: `${day1Label} à 14h30`,
        sublabel: "Après-midi",
        isoDate: day1Aft.toISOString(),
    });

    // Slot 3: Day after tomorrow (11:00)
    const day2 = getNextBusinessDay(now, 2);
    day2.setHours(11, 0, 0, 0);
    const day2Label = day2.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    slots.push({
        tag: "+2 jours",
        label: `${day2Label} à 11h00`,
        sublabel: "Matin",
        isoDate: day2.toISOString(),
    });

    // Slot 4: Next week beginning (14:00)
    const day3 = getNextBusinessDay(now, 3);
    day3.setHours(14, 0, 0, 0);
    const day3Label = day3.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    slots.push({
        tag: "+3 jours",
        label: `${day3Label} à 14h00`,
        sublabel: "Après-midi",
        isoDate: day3.toISOString(),
    });

    return slots;
}

/**
 * Builds a direct 1-click Google Calendar creation link pre-filled with:
 * Title, Start & End times, Attendee Guest, Description, and Meeting join links.
 */
export function buildGoogleCalendarUrl(params: {
    title: string;
    startIso: string;
    durationMinutes?: number;
    description?: string;
    attendeeEmail?: string;
    location?: string;
}): string {
    const start = new Date(params.startIso);
    const duration = params.durationMinutes ?? 30;
    const end = new Date(start.getTime() + duration * 60000);

    const formatGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.set("action", "TEMPLATE");
    url.searchParams.set("text", params.title);
    url.searchParams.set("dates", `${formatGCalDate(start)}/${formatGCalDate(end)}`);
    if (params.description) url.searchParams.set("details", params.description);
    if (params.location) url.searchParams.set("location", params.location);
    if (params.attendeeEmail) url.searchParams.set("add", params.attendeeEmail);

    return url.toString();
}
