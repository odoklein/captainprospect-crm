import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token;
        const path = req.nextUrl.pathname;
        const apiKey = req.headers.get("x-api-key");

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
        "/api/((?!auth/|webhooks/).*)",
    ],
};
