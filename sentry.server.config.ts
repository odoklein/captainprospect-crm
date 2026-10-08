// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { scrubApiKeys } from "./lib/api-v1/redact";

Sentry.init({
  dsn: "https://e9e7ab45ba6bbfc9c14ca4097f11ceab@o4510960325885952.ingest.de.sentry.io/4510960330342480",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // API keys can travel in the /api/mcp URL: never let them reach Sentry.
  beforeSend: (event) => scrubApiKeys(event),
  beforeSendTransaction: (event) => scrubApiKeys(event),
  beforeBreadcrumb: (breadcrumb) => scrubApiKeys(breadcrumb),
});
