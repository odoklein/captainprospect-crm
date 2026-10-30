// Shown on every page of a suspended instance (root layout). Fixed to the
// bottom edge so it never shifts the app's own layout. Server component.
export function SuspendedBanner({ reason }: { reason: string | null }) {
    return (
        <div
            role="alert"
            className="fixed inset-x-0 bottom-0 z-[9999] bg-ink px-4 py-2.5 text-center text-sm text-canvas"
        >
            <strong className="font-semibold">Compte suspendu : lecture seule.</strong>{" "}
            {reason ?? "Les modifications sont désactivées. Contactez-nous pour réactiver votre compte."}{" "}
            Vous pouvez toujours consulter vos données et les exporter.
        </div>
    );
}
