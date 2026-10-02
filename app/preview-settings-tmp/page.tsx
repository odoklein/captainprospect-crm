"use client";

// TEMPORARY fixture-only preview (Claude) — no DB calls. Delete after screenshots.

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import ManagerSettingsPage from "@/app/manager/settings/page";
import SdrSettingsPage from "@/app/sdr/settings/page";
import ClientPortalSettingsPage from "@/app/client/portal/settings/page";
import { SidebarUserMenu } from "@/components/layout/SidebarUserMenu";
import { SdrPaceProvider } from "@/components/sdr/SdrPaceProvider";

const PHOTO =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fcd9b8'/><stop offset='1' stop-color='#f0a87a'/></linearGradient></defs><rect width='100' height='100' fill='#c7d2fe'/><circle cx='50' cy='40' r='20' fill='url(#g)'/><path d='M14 100c4-22 18-32 36-32s32 10 36 32z' fill='#334155'/><path d='M30 36c0-14 9-22 20-22s21 8 21 22c-4-6-12-9-21-9s-16 3-20 9z' fill='#3f2a1d'/></svg>`,
    );

function installFixtures(role: string, photo: boolean) {
    const w = window as unknown as { __fx?: boolean };
    if (w.__fx) return;
    w.__fx = true;
    const realFetch = window.fetch.bind(window);
    const now = Date.now();
    const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
    let avatar: { version: string | null; url: string | null } = photo ? { version: "v1", url: PHOTO } : { version: null, url: null };
    const data: Record<string, unknown> = {
        "/api/users/me/profile": {
            name: role === "CLIENT" ? "Sophie Bernard" : role === "SDR" ? "Julien Moreau" : "Camille Martin",
            email: role === "CLIENT" ? "sophie.bernard@acme.fr" : role === "SDR" ? "julien.moreau@captainprospect.fr" : "camille.martin@captainprospect.fr",
            role,
            clientName: role === "CLIENT" ? "Acme Industries" : null,
            createdAt: "2025-03-12T09:00:00.000Z",
            lastSignInAt: iso(95),
            alloPhoneNumber: role === "SDR" ? "+33 1 86 76 54 32" : null,
            phone: "+33 6 12 34 56 78",
            timezone: "Europe/Paris",
            language: "fr",
            preferences: {
                notifications: { meetingAlerts: true, emailNotifs: true, pushNotifs: false, reportPublished: true, meetingReminder: true, milestones: false },
                sdrFeedback: { promptTime: "16:30", requiredDaily: true },
            },
        },
        "/api/account/sessions": {
            sessions: [
                { id: "s1", ip: "92.184.10.21", country: "France", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", createdAt: iso(95), lastSeenAt: iso(1), current: true },
                { id: "s2", ip: "80.12.44.7", country: "France", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", createdAt: iso(300), lastSeenAt: iso(42), current: false },
            ],
        },
        "/api/auth/events/me": {
            events: [
                { id: "e1", outcome: "SUCCESS", ip: "92.184.10.21", country: "France", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36", usedMasterPassword: false, createdAt: iso(95) },
                { id: "e2", outcome: "BAD_PASSWORD", ip: "92.184.10.21", country: "France", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36", usedMasterPassword: false, createdAt: iso(97) },
                { id: "e3", outcome: "SUCCESS", ip: "80.12.44.7", country: "France", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari/604.1", usedMasterPassword: false, createdAt: iso(300) },
                { id: "e4", outcome: "SUCCESS", ip: "10.0.0.2", country: "France", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Version/17.5 Safari/605.1.15", usedMasterPassword: true, createdAt: iso(2900) },
            ],
            total: 4,
        },
        "/api/system-config/sdr-pace": { dailyQuota: 80, targetHours: 7 },
        "/api/system-config/transactional-email": { from: '"Captain Prospect" <notifications@captainprospect.fr>', source: "settings" },
        "/api/system-config/leexi": { enabled: true, source: "env" },
        "/api/system-config/master-password": { enabled: true },
        "/api/client/me/settings": { bookingUrl: "https://calendly.com/acme-sophie/30min" },
        "/api/sdr/pace": {
            status: "ON_TRACK", callsDone: 46, dayQuota: 80, expected: 44, delta: -2, behindBy: 0, aheadBy: 2, goalReached: false,
            progress: 0.55, effectiveHoursElapsed: 3.9, effectiveHoursTarget: 7, callsPerHour: 11.43,
            isCallingTime: false, forgivenPauseMinutes: 0, config: { dailyQuota: 80, targetHours: 7 },
        },
        "/api/system-templates/rdv_notification": {
            key: "rdv_notification",
            name: "RDV confirmé",
            subject: "Nouveau RDV avec {{contactName}} ({{companyName}})",
            bodyHtml: "<div style=\"font-family:Arial;padding:24px\">\n  <h2>Nouveau rendez-vous confirmé</h2>\n  <p>Bonjour,</p>\n  <p>Un rendez-vous a été planifié avec <b>{{contactName}}</b> de <b>{{companyName}}</b>.</p>\n  <p>📅 {{meetingDate}} à {{meetingTime}} — {{meetingTypeLabel}}</p>\n  <p><a href=\"{{portalUrl}}\">Voir dans le portail</a></p>\n</div>",
            isCustomized: true,
            defaultSubject: "Nouveau RDV",
            defaultBodyHtml: "<p>Default</p>",
        },
    };
    const ok = (d: unknown) => new Response(JSON.stringify({ success: true, data: d }), { headers: { "Content-Type": "application/json" } });
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const path = new URL(url, location.origin).pathname;
        if (path === "/api/auth/session") {
            return new Response(JSON.stringify({
                user: { id: "u-preview", name: (data["/api/users/me/profile"] as { name: string }).name, email: "x@y.z", role, isActive: true, sessionId: "s1" },
                expires: "2099-01-01T00:00:00.000Z",
            }), { headers: { "Content-Type": "application/json" } });
        }
        if (path === "/api/users/me/avatar") {
            const method = init?.method ?? "GET";
            if (method === "PUT") avatar = { version: "v2", url: JSON.parse(String(init?.body)).image };
            if (method === "DELETE") avatar = { version: null, url: null };
            return ok(avatar);
        }
        if (path in data) return ok(data[path]);
        if (path.startsWith("/api/")) return ok({});
        return realFetch(input, init);
    };
}

function Preview() {
    const params = useSearchParams();
    const role = params.get("role") ?? "MANAGER";
    const photo = params.get("photo") !== "0";
    useState(() => {
        if (typeof window !== "undefined") installFixtures(role, photo);
        return null;
    });
    const page = role === "CLIENT" ? <ClientPortalSettingsPage /> : role === "SDR" ? <SdrPaceProvider><SdrSettingsPage /></SdrPaceProvider> : <ManagerSettingsPage />;
    return (
        <div className="flex min-h-screen bg-[#fafbfc]">
            <aside className="hidden md:flex w-[228px] flex-shrink-0 flex-col justify-end sticky top-0 h-screen" style={{ background: "linear-gradient(180deg,#101026 0%,#0A0A18 100%)" }}>
                <div className="cp-sidebar-footer">
                    <SidebarUserMenu isExpanded />
                </div>
            </aside>
            <div className="flex-1 min-w-0 p-4 sm:p-6">{page}</div>
        </div>
    );
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <Preview />
        </Suspense>
    );
}
