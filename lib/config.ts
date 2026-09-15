// ============================================
// Suzalink CRM CONFIGURATION
// ============================================
// Centralized configuration to replace hardcoded values
// Environment-aware settings
// ============================================

export const config = {
  // ============================================
  // QUEUE CONFIGURATION
  // ============================================
  queue: {
    // Cooldown periods by channel (in hours)
    cooldown: {
      CALL: parseInt(process.env.COOLDOWN_CALL || "24"),
      EMAIL: parseInt(process.env.COOLDOWN_EMAIL || "72"),
      LINKEDIN: parseInt(process.env.COOLDOWN_LINKEDIN || "168"), // 7 days
    },
    // Maximum retry attempts for NO_RESPONSE
    maxRetries: parseInt(process.env.MAX_RETRIES || "3"),
    // Priority weights (lower = higher priority)
    priorityWeights: {
      CALLBACK: 1,
      FOLLOW_UP: 2,
      NEW: 3,
      RETRY: 4,
    },
  },

  // ============================================
  // API CONFIGURATION
  // ============================================
  api: {
    // Default pagination
    defaultPageSize: 20,
    maxPageSize: 100,
    // Rate limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || "100"),
    },
    // Request timeout
    timeout: parseInt(process.env.API_TIMEOUT || "30000"), // 30s
  },

  // ============================================
  // CACHE CONFIGURATION
  // ============================================
  cache: {
    // Redis connection (if available)
    redis: {
      url: process.env.REDIS_URL,
      enabled: !!process.env.REDIS_URL,
    },
    // TTL (time to live) in seconds
    ttl: {
      stats: 60, // 1 minute
      missions: 300, // 5 minutes
      users: 600, // 10 minutes
    },
  },

  // ============================================
  // VALIDATION RULES
  // ============================================
  validation: {
    // Note length limits
    note: {
      min: 0,
      max: 500,
    },
    // Action duration limits (in seconds)
    duration: {
      min: 1,
      max: 7200, // 2 hours
    },
    // Password requirements
    password: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecial: false,
    },
  },

  // ============================================
  // NOTIFICATION CONFIGURATION
  // ============================================
  notifications: {
    email: {
      enabled: !!process.env.SENDGRID_API_KEY,
      from: process.env.EMAIL_FROM || "noreply@suzalink.com",
    },
    slack: {
      enabled: !!process.env.SLACK_WEBHOOK_URL,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      // Incoming webhook pointed at the #clients-live channel. Falls back to
      // the generic webhook above when not set. See lib/slack/clientsLive.ts.
      clientsLiveWebhookUrl:
        process.env.SLACK_CLIENTS_LIVE_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL,
    },
  },

  // ============================================
  // SECURITY CONFIGURATION
  // ============================================
  security: {
    // Session configuration
    session: {
      maxAge: 8 * 60 * 60, // 8 hours
      updateAge: 24 * 60 * 60, // 24 hours
    },
    // Login attempt limits
    loginAttempts: {
      maxAttempts: 5,
      lockoutDuration: 15 * 60, // 15 minutes
    },
    // CORS settings
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || [
        "http://localhost:3000",
      ],
      credentials: true,
    },
  },

  // ============================================
  // INTEGRATIONS
  // ============================================
  integrations: {
    apollo: {
      enabled: process.env.APOLLO_ENABLED === "true",
      apiKey: process.env.APOLLO_API_KEY || "",
    },
  },

  // ============================================
  // FEATURE FLAGS
  // ============================================
  features: {
    // Enable/disable features
    realtime: process.env.FEATURE_REALTIME === "true",
    analytics: process.env.FEATURE_ANALYTICS !== "false", // default true
    notifications: process.env.FEATURE_NOTIFICATIONS === "true",
    csvImport: process.env.FEATURE_CSV_IMPORT !== "false", // default true
    auditLog: process.env.FEATURE_AUDIT_LOG === "true",
  },

  // ============================================
  // LOGGING CONFIGURATION
  // ============================================
  logging: {
    level: process.env.LOG_LEVEL || "info",
    pretty: process.env.NODE_ENV !== "production",
    // Log to file in production
    file: process.env.LOG_FILE,
  },

  // ============================================
  // ENVIRONMENT
  // ============================================
  env: {
    isDevelopment: process.env.NODE_ENV === "development",
    isProduction: process.env.NODE_ENV === "production",
    isTest: process.env.NODE_ENV === "test",
  },
} as const;

// ============================================
// VALIDATION
// ============================================
// Validate critical configuration on startup
export function validateConfig() {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required");
  }

  if (!process.env.NEXTAUTH_SECRET) {
    errors.push("NEXTAUTH_SECRET is required");
  }

  if (config.queue.cooldown.CALL < 1) {
    errors.push("COOLDOWN_CALL must be at least 1 hour");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join("\n")}`);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getCooldownMs(channel: "CALL" | "EMAIL" | "LINKEDIN"): number {
  return config.queue.cooldown[channel] * 60 * 60 * 1000;
}

export function getCooldownDate(channel: "CALL" | "EMAIL" | "LINKEDIN"): Date {
  return new Date(Date.now() - getCooldownMs(channel));
}

export function isFeatureEnabled(
  feature: keyof typeof config.features,
): boolean {
  return config.features[feature];
}
