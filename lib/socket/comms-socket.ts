/**
 * Singleton Socket.IO client for CRM comms (VPS at 173.212.231.174, port 4000).
 * Connects over WebSocket only. URL and path come from the instance runtime config
 * (SOCKET_URL / SOCKET_PATH, or the legacy NEXT_PUBLIC_ names, read on the server at
 * request time — lib/runtime-config), so one image serves every instance.
 * When the app is served over HTTPS (e.g. Vercel), the socket URL is forced to HTTPS so the browser uses wss://
 * and does not block mixed content. For production, use a URL with valid TLS (e.g. https://suzalink.com).
 */

import { io, type Socket } from "socket.io-client";
import type {
  OnlineUsersPayload,
  TypingPayload,
  ReceiveMessagePayload,
} from "./types";
import { getRuntimeConfig } from "@/lib/runtime-config/client";

/** Use HTTPS when the page is HTTPS to avoid mixed-content blocking (HTTPS page → ws://). */
function getEffectiveUrl(url: string): string {
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    url.startsWith("http://")
  ) {
    return url.replace(/^http:\/\//, "https://");
  }
  return url;
}

export interface CommsSocketCallbacks {
  /** Called when the server sends the list of online user IDs. */
  onOnlineUsers?: (userIds: Set<string>) => void;
  /** Called when a typing event is received (userId, userName, isTyping). */
  onTyping?: (payload: TypingPayload) => void;
  /** Called when a receive-message event is received (for CRM message_created). */
  onReceiveMessage?: (payload: ReceiveMessagePayload) => void;
  /** Called on disconnect or connect_error so the hook can set isConnected false. */
  onDisconnect?: () => void;
}

let socket: Socket | null = null;

/**
 * Returns the singleton Socket instance (lazy-created). Does not connect.
 * Use connectCommsSocket() to connect and register callbacks.
 */
function getSocket(options: { url?: string; path?: string } = {}): Socket {
  // Read at connect time, not at import: the runtime config is per instance.
  const runtime = getRuntimeConfig().socket;
  const url = getEffectiveUrl(options.url ?? runtime.url);
  const path = options.path ?? runtime.path;
  if (!socket) {
    socket = io(url, {
      path,
      transports: ["websocket"],
      autoConnect: false,
      // A fresh handshake token on every (re)connect: it tells the shared socket server
      // which instance and which user this is (lib/socket/handshake). { token: null }
      // (original deployment) or any failure connects as before, with no auth payload.
      auth: (cb) => {
        fetch("/api/comms/socket-token", { credentials: "same-origin", cache: "no-store" })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { token?: string | null; instanceId?: string } | null) =>
            cb(data?.token ? { token: data.token, instanceId: data.instanceId } : {}),
          )
          .catch(() => cb({}));
      },
    });
  }
  return socket;
}

/**
 * Connect to the VPS Socket.IO server and register callbacks.
 * On successful connect, emits user-online with the given userId.
 * Call disconnectCommsSocket() on unmount or when comms is disabled.
 */
export function connectCommsSocket(
  userId: string,
  callbacks: CommsSocketCallbacks,
  options: { url?: string; path?: string } = {}
): Socket {
  const s = getSocket(options);
  s.removeAllListeners();

  const onConnect = (): void => {
    s.emit("user-online", { userId });
  };

  const onOnlineUsers = (payload: OnlineUsersPayload): void => {
    const ids = Array.isArray(payload)
      ? payload
      : (payload as { userIds?: string[] }).userIds ?? [];
    const set = new Set<string>(ids);
    callbacks.onOnlineUsers?.(set);
  };

  const onTyping = (payload: TypingPayload): void => {
    callbacks.onTyping?.(payload);
  };

  const onReceiveMessage = (payload: ReceiveMessagePayload): void => {
    callbacks.onReceiveMessage?.(payload);
  };

  const onDisconnect = (): void => {
    callbacks.onDisconnect?.();
  };

  s.on("connect", onConnect);
  s.on("online-users", onOnlineUsers);
  s.on("typing", onTyping);
  s.on("receive-message", onReceiveMessage);
  s.on("disconnect", onDisconnect);
  s.on("connect_error", onDisconnect);

  if (!s.connected) {
    s.connect();
  } else {
    onConnect();
  }

  return s;
}

/**
 * Disconnect the singleton socket and clear listeners. Call when leaving comms or unmounting.
 */
export function disconnectCommsSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Emit typing status to the server for a specific recipient.
 * Server is expected to forward to that user.
 */
export function emitTyping(
  recipientUserId: string,
  isTyping: boolean,
  options: { url?: string; path?: string } = {}
): void {
  const s = getSocket(options);
  if (s.connected) {
    s.emit("typing", {
      recipientId: recipientUserId,
      isTyping,
    });
  }
}

/**
 * Emit send-message for real-time delivery to a recipient.
 * Persistence should still be done via REST (POST /api/comms/threads/:id/messages).
 */
export function emitSendMessage(
  recipientUserId: string,
  message: string | Record<string, unknown>,
  options: { url?: string; path?: string } = {}
): void {
  const s = getSocket(options);
  if (s.connected) {
    s.emit("send-message", {
      recipientUserId,
      message: typeof message === "string" ? { content: message } : message,
    });
  }
}

/**
 * Get the current socket instance (for hook compatibility). May be null if never connected.
 */
export function getCommsSocketInstance(): Socket | null {
  return socket;
}
