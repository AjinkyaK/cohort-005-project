import { data } from "react-router";
import type { Route } from "./+types/api.knock-token";
import { getCurrentUserId } from "~/lib/session";
import { knockConfig, knockFeedSession } from "~/lib/notifications.server";

// Re-signs the signed-in person's Knock User Token, for the feed's
// onUserTokenExpiring callback, so the bell keeps working past the 1 h expiry.
export async function loader({ request }: Route.LoaderArgs) {
  const config = knockConfig();
  if (!config) {
    throw data("Notifications are not configured.", { status: 404 });
  }

  const personId = await getCurrentUserId(request);
  const session = await knockFeedSession(personId, config);
  if (!session) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  return { userToken: session.userToken };
}
