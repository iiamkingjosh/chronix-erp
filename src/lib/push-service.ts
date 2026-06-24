import { getAdminMessaging } from "./firebase-admin";

export interface PushPayload {
  title: string;
  body:  string;
  link?: string;
}

export interface PushResult {
  successCount: number;
  failureCount: number;
  /** Distinct FCM error codes seen, e.g. "messaging/invalid-argument",
   * "messaging/registration-token-not-registered". Empty if none failed. */
  errorCodes:   string[];
}

/** sendEachForMulticast() does NOT throw for invalid/expired individual
 * tokens - it resolves with a per-token success/failure breakdown. This
 * return value lets callers actually detect that, instead of assuming
 * success because nothing threw (confirmed empirically: a malformed token
 * resolves with failureCount:1, no exception). Existing callers that
 * still just `await` this and ignore the result are unaffected - this is
 * purely additive, no change to when/whether it throws (still only for
 * genuine request-level errors - auth, malformed payload, etc). */
export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { successCount: 0, failureCount: 0, errorCodes: [] };
  if (!tokens.length) return result;
  const messaging = getAdminMessaging();

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data:         { link: payload.link ?? "/dashboard" },
      webpush: {
        notification: {
          title: payload.title,
          body:  payload.body,
          icon:  "/chronix-icon.png",
          badge: "/chronix-icon.png",
          requireInteraction: true,
        },
        fcmOptions: { link: payload.link ?? "/dashboard" },
      },
    });
    result.successCount += res.successCount;
    result.failureCount += res.failureCount;
    for (const r of res.responses) {
      if (!r.success && r.error && !result.errorCodes.includes(r.error.code)) {
        result.errorCodes.push(r.error.code);
      }
    }
  }
  return result;
}
