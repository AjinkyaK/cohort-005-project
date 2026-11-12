import { Knock } from "@knocklabs/node";
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

// ─── Seat claimed ───

/**
 * Feed data for the Knock workflow `seat-claimed`. Its template is edited by
 * hand in the Knock dashboard (Development) and reads these top-level fields:
 *
 * - `student_name`: the Student who claimed the Seat
 * - `course_title`
 * - `claimed`: how many of the Team Licence's Seats are claimed, just after
 *   this claim
 * - `total`: how many Seats the Team Licence has
 * - `url`: `/team`
 */
export type SeatClaimedData = {
  student_name: string;
  course_title: string;
  claimed: number;
  total: number;
  url: "/team";
};

/** The Team Admin (the Team Licence's buyer) is told; the Student is the actor. */
export type SeatClaimed = {
  recipient: Recipient;
  actor: Recipient;
  data: SeatClaimedData;
};

export const SEAT_CLAIMED_WORKFLOW = "seat-claimed";

/**
 * Tells the Team Admin a Student claimed a Seat: in-app feed only, so a big
 * Team Licence doesn't fill their inbox.
 */
export async function notifySeatClaimed(
  seatClaimed: SeatClaimed,
  feed: FeedTransport = defaultChannels().feed
): Promise<void> {
  await deliver("Seat claimed", {
    feed: () =>
      feed.trigger(SEAT_CLAIMED_WORKFLOW, {
        recipients: [seatClaimed.recipient],
        actor: seatClaimed.actor,
        data: seatClaimed.data,
      }),
  });
}

// ─── Refund Request raised ───

/**
 * Feed data for the Knock workflow `refund-request-raised`. Its template is
 * edited by hand in the Knock dashboard (Development) and reads these
 * top-level fields:
 *
 * - `buyer_name`
 * - `course_title`
 * - `amount`: the amount paid, formatted (e.g. "$79.00")
 * - `reason`: the buyer's whole reason. Never truncated.
 * - `url`: `/admin/refunds`
 */
export type RefundRaisedData = {
  buyer_name: string;
  course_title: string;
  amount: string;
  reason: string;
  url: "/admin/refunds";
};

/**
 * Every Platform Admin at the moment it was raised is told, each with their
 * own email; the buyer is the actor.
 */
export type RefundRaised = {
  recipients: Recipient[];
  actor: Recipient;
  data: RefundRaisedData;
  emails: Email[];
};

export const REFUND_RAISED_WORKFLOW = "refund-request-raised";

/** Tells every Platform Admin a Refund Request was raised: in-app feed and email. */
export async function notifyRefundRaised(
  refundRaised: RefundRaised,
  { feed, mail }: Channels = defaultChannels()
): Promise<void> {
  await deliver("Refund Request raised", {
    feed: () =>
      feed.trigger(REFUND_RAISED_WORKFLOW, {
        recipients: refundRaised.recipients,
        actor: refundRaised.actor,
        data: refundRaised.data,
      }),
    email: async () => {
      await Promise.all(refundRaised.emails.map((email) => mail.send(email)));
    },
  });
}
