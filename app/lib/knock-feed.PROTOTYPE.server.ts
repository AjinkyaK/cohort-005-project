// ⚠️ PROTOTYPE: throwaway. Answers the wayfinder ticket
// "Prototype the in-app bell and dropdown" (issue #21).
// Lives on branch prototype/notification-bell and is never merged.
//
// Signs the Knock User Token for the signed-in person in the app layout
// loader. The browser gets the Public API Key + this token, nothing else.
import { signUserToken } from "@knocklabs/node"; // root export works in @knocklabs/node 1.41

// PROTOTYPE: the dev server doesn't load .env into process.env on its own.
try {
  process.loadEnvFile();
} catch {}

export async function getKnockFeedConfig(personId: number | null) {
  const apiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!personId || !apiKey || !feedChannelId) return null;

  const userToken = await signUserToken(String(personId), {
    signingKey: process.env.KNOCK_SIGNING_KEY,
  });
  return { apiKey, feedChannelId, userId: String(personId), userToken };
}
