/**
 * OpenReplay Client Tracker Service
 * Configured for self-hosted instance at openreplay.suzaliconseil.com
 * Supports Next.js App Router (React 19), SSR safeguards, network sanitization,
 * and bidirectional Sentry error correlation.
 */

import * as Sentry from "@sentry/nextjs";

// Global OpenReplay window interface definition
declare global {
  interface Window {
    OpenReplay?: any;
    _openReplayLoaded?: boolean;
    _openReplaySessionId?: string | null;
  }
}

export interface OpenReplayUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  clientId?: string | null;
  interlocuteurId?: string | null;
}

export interface OpenReplayConfig {
  projectKey: string;
  ingestPoint?: string;
  obscureTextNumbers?: boolean;
  obscureTextEmails?: boolean;
  defaultInputMode?: number; // 0 = plain, 1 = obscure, 2 = hidden
  capturePerformance?: boolean;
}

// Default config targeting self-hosted openreplay.suzaliconseil.com
const DEFAULT_INGEST_POINT = "https://openreplay.suzaliconseil.com/ingest";

class OpenReplayClient {
  private isInitialized = false;
  private isStarted = false;
  private projectKey: string | null = null;
  private ingestPoint: string = DEFAULT_INGEST_POINT;
  private pendingUser: OpenReplayUser | null = null;
  private pendingMetadata: Record<string, string> = {};

  constructor() {
    if (typeof window !== "undefined") {
      this.projectKey = process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY || null;
      this.ingestPoint =
        process.env.NEXT_PUBLIC_OPENREPLAY_INGEST_POINT || DEFAULT_INGEST_POINT;
    }
  }

  /**
   * Initializes and starts the OpenReplay tracker in the client browser.
   */
  public start(customConfig?: Partial<OpenReplayConfig>): void {
    if (typeof window === "undefined") return;

    const enabled = process.env.NEXT_PUBLIC_OPENREPLAY_ENABLED !== "false";
    if (!enabled) {
      console.log("[OpenReplay] Tracking is disabled via NEXT_PUBLIC_OPENREPLAY_ENABLED=false");
      return;
    }

    const key = customConfig?.projectKey || this.projectKey;
    if (!key) {
      console.warn(
        "[OpenReplay] No projectKey found. Please set NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY in your .env file."
      );
      return;
    }

    if (this.isStarted) return;

    try {
      const ingestPoint = customConfig?.ingestPoint || this.ingestPoint;

      const initOpts: Record<string, any> = {
        projectKey: key,
        ingestPoint: ingestPoint,
        obscureTextNumbers: customConfig?.obscureTextNumbers ?? false,
        obscureTextEmails: customConfig?.obscureTextEmails ?? false,
        defaultInputMode: customConfig?.defaultInputMode ?? 0,
        network: {
          sessionTokenHeader: true,
          failuresOnly: false,
          sanitizer: this.networkSanitizer,
        },
        ...customConfig,
      };

      const startOpts = {
        userID: this.pendingUser?.id || "",
      };

      // Load OpenReplay using the robust buffered loader snippet
      this.injectSnippet(initOpts, startOpts, ingestPoint);

      this.isInitialized = true;
      this.isStarted = true;

      // Flush any user or metadata queued before start
      if (this.pendingUser) {
        this.identifyUser(this.pendingUser);
      }

      Object.entries(this.pendingMetadata).forEach(([k, v]) => {
        this.setMetadata(k, v);
      });

      // Poll briefly to retrieve session info once script finishes booting, and link with Sentry
      this.syncWithSentry();

      console.log(`[OpenReplay] Tracker initialized (Ingest: ${ingestPoint})`);
    } catch (err) {
      console.error("[OpenReplay] Failed to start OpenReplay tracker:", err);
    }
  }

  /**
   * Inject the OpenReplay script and initialize the buffering queue.
   */
  private injectSnippet(
    initOpts: Record<string, any>,
    startOpts: Record<string, any>,
    ingestPoint: string
  ): void {
    if (window.OpenReplay && window._openReplayLoaded) {
      return;
    }

    // Determine script source: prefer self-hosted static if available, fallback to static.openreplay.com
    const selfHostedDomain = ingestPoint.replace(/\/ingest\/?$/, "");
    const scriptSrc = `${selfHostedDomain}/static/openreplay.js`;
    const fallbackSrc = "https://static.openreplay.com/latest/openreplay.js";

    // Setup command queue buffering so trackEvent/setUserID work synchronously
    (function (A: string, s: any, a: any, y: any, e: any, r: any) {
      r = (window as any).OpenReplay = [e, r, y, [s - 1, e]];
      r.setUserID = function (id: string) {
        r.push([2, id]);
      };
      r.setUserAnonymousID = function (id: string) {
        r.push([3, id]);
      };
      r.setMetadata = function (k: string, v: string) {
        r.push([4, k, v]);
      };
      r.event = function (k: string, p: any, i: any) {
        r.push([5, k, p, i]);
      };
      r.issue = function (k: string, p: any) {
        r.push([6, k, p]);
      };
      r.handleError = function (err: any) {
        r.push([7, err]);
      };

      const script = document.createElement("script");
      script.src = A;
      script.async = true;
      script.onerror = () => {
        // If self-hosted /static/openreplay.js is not served, fallback to official CDN
        if (script.src !== fallbackSrc) {
          console.warn("[OpenReplay] Self-hosted static script unavailable, falling back to CDN...");
          const fallbackScript = document.createElement("script");
          fallbackScript.src = fallbackSrc;
          fallbackScript.async = true;
          document.head.appendChild(fallbackScript);
        }
      };
      script.onload = () => {
        window._openReplayLoaded = true;
      };
      document.head.appendChild(script);
    })(scriptSrc, 1, 0, initOpts, startOpts, null);
  }

  /**
   * Sanitizes network headers and payloads to prevent leaking sensitive credentials.
   */
  private networkSanitizer = (data: any) => {
    if (!data) return data;

    const SENSITIVE_HEADERS = [
      "authorization",
      "cookie",
      "set-cookie",
      "x-api-key",
      "x-auth-token",
    ];

    const SENSITIVE_KEYS = [
      "password",
      "masterpassword",
      "masterpasswordhash",
      "token",
      "secret",
      "creditcard",
      "cvv",
      "refreshtoken",
    ];

    // Sanitize Request Headers
    if (data.request && data.request.headers) {
      Object.keys(data.request.headers).forEach((header) => {
        if (SENSITIVE_HEADERS.includes(header.toLowerCase())) {
          data.request.headers[header] = "[REDACTED]";
        }
      });
    }

    // Sanitize Response Headers
    if (data.response && data.response.headers) {
      Object.keys(data.response.headers).forEach((header) => {
        if (SENSITIVE_HEADERS.includes(header.toLowerCase())) {
          data.response.headers[header] = "[REDACTED]";
        }
      });
    }

    // Sanitize Request Body
    if (data.request && typeof data.request.body === "string") {
      try {
        const bodyObj = JSON.parse(data.request.body);
        let modified = false;
        Object.keys(bodyObj).forEach((k) => {
          if (SENSITIVE_KEYS.some((sk) => k.toLowerCase().includes(sk))) {
            bodyObj[k] = "[REDACTED]";
            modified = true;
          }
        });
        if (modified) {
          data.request.body = JSON.stringify(bodyObj);
        }
      } catch {
        // Not a JSON body, leave untouched or redact if query params match
      }
    }

    return data;
  };

  /**
   * Identifies the currently authenticated user in the OpenReplay session.
   */
  public identifyUser(user: OpenReplayUser): void {
    if (!user || !user.id) return;
    this.pendingUser = user;

    if (typeof window === "undefined" || !window.OpenReplay) return;

    try {
      if (typeof window.OpenReplay.setUserID === "function") {
        window.OpenReplay.setUserID(user.id);
      }

      // Attach CRM user metadata
      if (user.role) this.setMetadata("role", user.role);
      if (user.email) this.setMetadata("email", user.email);
      if (user.name) this.setMetadata("name", user.name);
      if (user.clientId) this.setMetadata("clientId", user.clientId);
      if (user.interlocuteurId) this.setMetadata("interlocuteurId", user.interlocuteurId);
      this.setMetadata("environment", process.env.NODE_ENV || "production");
    } catch (err) {
      console.warn("[OpenReplay] Error identifying user:", err);
    }
  }

  /**
   * Sets custom session metadata. Note: keys must be declared in OpenReplay project settings.
   */
  public setMetadata(key: string, value: string | number | boolean | null | undefined): void {
    if (value === null || value === undefined) return;
    const strVal = String(value);
    this.pendingMetadata[key] = strVal;

    if (typeof window !== "undefined" && window.OpenReplay?.setMetadata) {
      try {
        window.OpenReplay.setMetadata(key, strVal);
      } catch (err) {
        console.warn(`[OpenReplay] Error setting metadata for ${key}:`, err);
      }
    }
  }

  /**
   * Records a custom CRM event (e.g. MEETING_BOOKED, LEAD_QUALIFIED, CALL_COMPLETED).
   */
  public trackEvent(name: string, payload?: Record<string, any>): void {
    if (typeof window === "undefined" || !window.OpenReplay?.event) return;

    try {
      window.OpenReplay.event(name, payload || {});
    } catch (err) {
      console.warn(`[OpenReplay] Error tracking event ${name}:`, err);
    }
  }

  /**
   * Reports an error or exception to OpenReplay.
   */
  public trackError(error: Error | string, payload?: Record<string, any>): void {
    if (typeof window === "undefined" || !window.OpenReplay) return;

    try {
      if (typeof window.OpenReplay.handleError === "function") {
        window.OpenReplay.handleError(error);
      }
      this.trackEvent("ERROR_OCCURRED", {
        message: typeof error === "string" ? error : error.message,
        stack: error instanceof Error ? error.stack : undefined,
        ...payload,
      });
    } catch {
      // ignore
    }
  }

  /**
   * Returns the OpenReplay session URL if available.
   */
  public getSessionURL(): string | null {
    if (typeof window === "undefined" || !window.OpenReplay) return null;
    try {
      if (typeof window.OpenReplay.getSessionURL === "function") {
        return window.OpenReplay.getSessionURL();
      }
    } catch {
      // not available yet
    }
    return null;
  }

  /**
   * Returns the OpenReplay session ID if available.
   */
  public getSessionID(): string | null {
    if (typeof window === "undefined" || !window.OpenReplay) return null;
    try {
      if (typeof window.OpenReplay.getSessionToken === "function") {
        return window.OpenReplay.getSessionToken();
      }
      if (typeof window.OpenReplay.getSessionID === "function") {
        return window.OpenReplay.getSessionID();
      }
    } catch {
      // not available yet
    }
    return null;
  }

  /**
   * Connects the active OpenReplay session with Sentry tags and contexts.
   */
  private syncWithSentry(): void {
    let attempts = 0;
    const maxAttempts = 10;

    const interval = setInterval(() => {
      attempts++;
      const sessionId = this.getSessionID();
      const sessionUrl = this.getSessionURL();

      if (sessionId || sessionUrl || attempts >= maxAttempts) {
        clearInterval(interval);

        if (sessionId) {
          window._openReplaySessionId = sessionId;
          Sentry.setTag("openReplaySession.id", sessionId);
        }

        if (sessionUrl) {
          Sentry.setContext("openreplay", {
            sessionUrl: sessionUrl,
            sessionId: sessionId || "unknown",
          });
        }
      }
    }, 1500);
  }
}

// Singleton tracker instance
export const openReplayTracker = new OpenReplayClient();
