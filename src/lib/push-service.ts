import { getAdminMessaging } from "./firebase-admin";

export interface PushPayload {
  title: string;
  body:  string;
  link?: string;
}

export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;
  const messaging = getAdminMessaging();

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    await messaging.sendEachForMulticast({
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
  }
}
