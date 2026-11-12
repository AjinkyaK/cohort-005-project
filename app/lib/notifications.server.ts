import { Knock, signUserToken } from "@knocklabs/node";
import {
  defaultTransport,
  type Email,
  type MailTransport,
} from "~/lib/mailer.server";
import type { PurchaseKind } from "~/lib/refunds.server";

// ─── Notifications ───
// Cadence tells the person each event concerns, as soon as the change is saved.
// Each Notification goes out on one or more Channels:
//
// - the in-app feed: a Knock workflow trigger, recipients identified inline
// - email: Cadence's own sendEmail (Knock never sends email)
//
// Route actions call notify<Event>() once, after the change has committed.
// Channels run side by side and fail on their own: a failure is logged and
// never thrown, so a failed Notification never undoes what caused it.

// ─── Configuration ───

export type KnockConfig = {
  apiKey: string;
  publicApiKey: string;
  signingKey: string;
  feedChannelId: string;
};

/** All four Knock settings, or null if any is missing (a partial config is off). */
export function knockConfig(
  env: Record<string, string | undefined> = process.env
): KnockConfig | null {
  const apiKey = env.KNOCK_API_KEY;
  const publicApiKey = env.KNOCK_PUBLIC_API_KEY;
  const signingKey = env.KNOCK_SIGNING_KEY;
  const feedChannelId = env.KNOCK_FEED_CHANNEL_ID;

  if (!apiKey || !publicApiKey || !signingKey || !feedChannelId) return null;

  return { apiKey, publicApiKey, signingKey, feedChannelId };
}

// ─── In-app feed session (browser) ───

/** What the browser needs to read one person's feed from Knock, and nothing more. */
export type KnockFeedSession = {
  apiKey: string; // the Public API Key
  feedChannelId: string;
  userId: string;
  userToken: string;
};

const USER_TOKEN_LIFETIME_SECONDS = 60 * 60;

/**
 * Signs an RS256 User Token (`sub` = String(users.id), 1 h expiry) for the
 * signed-in person. Null when nobody is signed in or Knock isn't configured,
 * in which case no bell is shown.
 */
export async function knockFeedSession(
  personId: number | null,
  config: KnockConfig | null = knockConfig()
): Promise<KnockFeedSession | null> {
  if (personId === null || !config) return null;

  const userId = String(personId);
  const userToken = await signUserToken(userId, {
    signingKey: config.signingKey,
    expiresInSeconds: USER_TOKEN_LIFETIME_SECONDS,
  });

  return {
    apiKey: config.publicApiKey,
    feedChannelId: config.feedChannelId,
    userId,
    userToken,
  };
}

// ─── Channels ───

/** A person as Knock sees them. `id` is String(users.id), with no prefix. */
export type Recipient = { id: string; name: string; email: string };

/** The in-app feed Channel, owned by Cadence. */
export interface FeedTransport {
  trigger(
    workflow: string,
    args: { recipients: Recipient[]; actor: Recipient; data: object }
  ): Promise<void>;
}

export type Channels = { feed: FeedTransport; mail: MailTransport };

/** The only adapter to Knock, and the only code that talks to @knocklabs/node. */
export function knockFeed(client: Knock): FeedTransport {
  return {
    async trigger(workflow, { recipients, actor, data }) {
      await client.workflows.trigger(workflow, {
        recipients,
        actor,
        data: { ...data },
      });
    },
  };
}

function unconfiguredFeed(): FeedTransport {
  return {
    async trigger() {
      throw new Error("Knock is not configured (KNOCK_* env vars missing).");
    },
  };
}

/**
 * The real Channels, built when called and never at import: `new Knock()`
 * throws without a key. Without Knock config the feed rejects (and is logged)
 * while email still goes.
 */
export function defaultChannels(): Channels {
  const config = knockConfig();
  return {
    feed: config
      ? knockFeed(new Knock({ apiKey: config.apiKey }))
      : unconfiguredFeed(),
    mail: defaultTransport(),
  };
}

async function deliver(
  event: string,
  sends: Record<string, () => Promise<void>>
): Promise<void> {
  const names = Object.keys(sends);
  const results = await Promise.allSettled(
    names.map((name) => Promise.resolve().then(sends[name]))
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `[notifications] ${event}: the ${names[index]} Channel failed`,
        result.reason
      );
    }
  });
}

// ─── Refund Request decided ───

/**
 * Feed data for the Knock workflow `refund-request-decided`. Its template is
 * edited by hand in the Knock dashboard (Development) and reads these
 * top-level fields:
 *
 * - `decision`: `approved` or `declined`
 * - `course_title`
 * - `note`: the Platform Admin's whole decision note, or null. Never truncated.
 * - `amount`: the amount paid, formatted (e.g. "$79.00")
 * - `purchase_kind`: `individual_purchase` or `team_licence`. An approved
 *   Team Licence adds "Its Unclaimed Seats can no longer be claimed."
 * - `url`: `/settings` (Individual Purchase) or `/team` (Team Licence)
 */
export type RefundDecidedData = {
  decision: "approved" | "declined";
  course_title: string;
  note: string | null;
  amount: string;
  purchase_kind: PurchaseKind;
  url: "/settings" | "/team";
};

/** The buyer is told; the Platform Admin who decided is the actor. */
export type RefundDecided = {
  recipient: Recipient;
  actor: Recipient;
  data: RefundDecidedData;
};

export const REFUND_DECIDED_WORKFLOW = "refund-request-decided";

/** Tells the buyer their Refund Request was decided: in-app feed and email. */
export async function notifyRefundDecided(
  { refundDecided, email }: { refundDecided: RefundDecided; email: Email },
  { feed, mail }: Channels = defaultChannels()
): Promise<void> {

  await deliver("Refund Request decided", {
    feed: () =>
      feed.trigger(REFUND_DECIDED_WORKFLOW, {
        recipients: [refundDecided.recipient],
        actor: refundDecided.actor,
        data: refundDecided.data,
      }),
    email: () => mail.send(email),
  });
}
