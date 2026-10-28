// Sentry instrumentation disabled for Replit compatibility — configure SENTRY_DSN and re-enable when deploying to production
export async function register() {
    // Changeable integration keys (OpenAI, Allo…) live encrypted in the database:
    // load them before the first request so integrationKey() never starts empty.
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { startIntegrationKeys } = await import("@/lib/integrations/store");
        await startIntegrationKeys();
    }
}
