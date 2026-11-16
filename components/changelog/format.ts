// Dates of « Nouveautés », in French, Paris time (the agencies' time zone by default).

const TZ = "Europe/Paris";
const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const dayShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const ymd = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

export const formatDay = (iso: string) => dayShort.format(new Date(iso));

/** « mardi 18 novembre, 21:00 → 22:00 », or across days « … → mercredi 19 novembre, 02:00 ». */
export function formatWindow(startsAt: string | null, endsAt: string | null): string | null {
    if (!startsAt && !endsAt) return null;
    if (startsAt && !endsAt) return `à partir du ${day.format(new Date(startsAt))}, ${time.format(new Date(startsAt))}`;
    if (!startsAt && endsAt) return `jusqu'au ${day.format(new Date(endsAt))}, ${time.format(new Date(endsAt))}`;
    const s = new Date(startsAt!), e = new Date(endsAt!);
    const sameDay = ymd.format(s) === ymd.format(e);
    return sameDay
        ? `${day.format(s)}, ${time.format(s)} → ${time.format(e)}`
        : `${day.format(s)}, ${time.format(s)} → ${day.format(e)}, ${time.format(e)}`;
}
