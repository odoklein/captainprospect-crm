import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { getEdgeLicenseState, isWriteMethod } from "@/lib/license/edge-state";
import { blockingFeature } from "@/lib/license/gates";

export default withAuth(
    async function middleware(req) {
        const token = req.nextauth.token;
        const path = req.nextUrl.pathname;
        const apiKey = req.headers.get("x-api-key");

        // 0. License pushed by the control plane (cached a few seconds, fails open).
        if (path.startsWith("/api/")) {
            const license = await getEdgeLicenseState(req.nextUrl.origin);
            // Suspended: read-only. Reads, login and the public routes outside the
            // matcher stay available, so the agency can still sign in and export its data.
            if (license.suspended && isWriteMethod(req.method)) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "instance_suspended",
                        message: license.reason ?? "Compte suspendu : les modifications sont désactivées. Contactez-nous pour le réactiver.",
                    },
                    { status: 403 },
                );
            }
            // A feature the pack does not include.
            const off = blockingFeature(path, req.method, license.features);
            if (off) {
                return NextResponse.json(
                    { success: false, error: "feature_not_included", feature: off, message: "Cette fonctionnalité n'est pas incluse dans votre offre." },
                    { status: 403 },
                );
            }
        }

        // 1. Autoriser l'accès si une API Key est présente
        // On laisse la route API finale valider si la clé est correcte dans Supabase
        if (apiKey) {
            return NextResponse.next();
        }

        // 2. Vérification du compte actif pour les sessions normales
        if (token?.isActive === false) {
            return NextResponse.redirect(new URL("/blocked", req.url));
        }

        // 3. Protection des routes par rôle (Sessions uniquement)
        if (path.startsWith("/sdr") && 
            token?.role !== "SDR" && 
            token?.role !== "BUSINESS_DEVELOPER" && 
            token?.role !== "BOOKER") {
            return NextResponse.redirect(new URL("/unauthorized", req.url));
        }

        if (path.startsWith("/manager") && token?.role !== "MANAGER") {
            return NextResponse.redirect(new URL("/unauthorized", req.url));
        }

        if (path.startsWith("/client") && token?.role !== "CLIENT") {
            return NextResponse.redirect(new URL("/unauthorized", req.url));
        }

        if (path.startsWith("/developer") && token?.role !== "DEVELOPER") {
            return NextResponse.redirect(new URL("/unauthorized", req.url));
        }

        if (path.startsWith("/bd") && token?.role !== "BUSINESS_DEVELOPER") {
            return NextResponse.redirect(new URL("/unauthorized", req.url));
        }

        if (path.startsWith("/commercial") && token?.role !== "COMMERCIAL") {
            return NextResponse.redirect(new URL("/unauthorized", req.url));
        }

        return NextResponse.next();
    },
    {
        callbacks: {
            // Autorise l'accès si un token de session existe OU si une API Key est fournie
            authorized: ({ token, req }) => {
                const apiKey = req.headers.get("x-api-key");
                return !!token || !!apiKey;
            },
        },
    }
);

export const config = {
    matcher: [
        "/sdr/:path*",
        "/manager/:path*",
        "/client/:path*",
        "/developer/:path*",
        "/bd/:path*",
        "/commercial/:path*",
        "/dashboard",
        // All /api routes except /api/auth/* (NextAuth handles its own routes)
        // and /api/webhooks/* (provider callbacks, each route verifies its own signature)
        // and /api/v1/* + /api/mcp (public API: Bearer API key, authenticated by the route itself)
        // and /api/brand/assets/* + /api/public-config (public brand files and config, on the login page too)
        // and /api/instance/* (control-plane provisioning: HMAC-signed, verified by lib/instance/auth)
        // and /api/license-state (suspension probe the middleware itself calls)
        "/api/((?!auth/|webhooks/|v1/|mcp|brand/assets/|public-config|license-state|instance/).*)",
    ],
};
