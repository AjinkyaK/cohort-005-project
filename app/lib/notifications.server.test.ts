import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Email, MailTransport } from "~/lib/mailer.server";
import {
  knockConfig,
  notifyRefundDecided,
  notifySeatClaimed,
  type FeedTransport,
  type RefundDecided,
  type SeatClaimed,
} from "./notifications.server";

type Trigger = { workflow: string; args: Parameters<FeedTransport["trigger"]>[1] };

function recordingFeed() {
  const triggers: Trigger[] = [];
  const feed: FeedTransport = {
    async trigger(workflow, args) {
      triggers.push({ workflow, args });
    },
  };
  return { feed, triggers };
}

function failingFeed(): FeedTransport {
  return {
    async trigger() {
      throw new Error("Knock is down");
    },
  };
}

function recordingMail() {
  const sent: Email[] = [];
  const mail: MailTransport = {
    async send(email) {
      sent.push(email);
    },
  };
  return { mail, sent };
}

function failingMail(): MailTransport {
  return {
    async send() {
      throw new Error("Postmark is down");
    },
  };
}

const refundDecided: RefundDecided = {
  recipient: { id: "7", name: "Priya", email: "priya@example.com" },
  actor: { id: "2", name: "Pat Admin", email: "pat@example.com" },
  data: {
    decision: "declined",
    course_title: "Test Course",
    note: "Seats are in use.",
    amount: "$79.00",
    purchase_kind: "team_licence",
    url: "/team",
  },
};

const email: Email = {
  to: "priya@example.com",
  subject: "Refund declined — Test Course",
  body: "Hi Priya,",
};

beforeEach(() => {
  // Only to keep test output quiet; failures are logged, never asserted on.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifyRefundDecided", () => {
  it("puts the decision in the buyer's feed, from the Platform Admin who decided", async () => {
    const { feed, triggers } = recordingFeed();
    const { mail } = recordingMail();

    await notifyRefundDecided({ refundDecided, email }, { feed, mail });

    expect(triggers).toEqual([
      {
        workflow: "refund-request-decided",
        args: {
          recipients: [
            { id: "7", name: "Priya", email: "priya@example.com" },
          ],
          actor: { id: "2", name: "Pat Admin", email: "pat@example.com" },
          data: {
            decision: "declined",
            course_title: "Test Course",
            note: "Seats are in use.",
            amount: "$79.00",
            purchase_kind: "team_licence",
            url: "/team",
          },
        },
      },
    ]);
  });

  it("emails the buyer the decision email", async () => {
    const { feed } = recordingFeed();
    const { mail, sent } = recordingMail();

    await notifyRefundDecided({ refundDecided, email }, { feed, mail });

    expect(sent).toEqual([email]);
  });

  it("still emails the buyer when the feed fails", async () => {
    const { mail, sent } = recordingMail();

    await expect(
      notifyRefundDecided({ refundDecided, email }, { feed: failingFeed(), mail })
    ).resolves.toBeUndefined();

    expect(sent).toEqual([email]);
  });

  it("still fills the feed when the email fails", async () => {
    const { feed, triggers } = recordingFeed();

    await expect(
      notifyRefundDecided({ refundDecided, email }, { feed, mail: failingMail() })
    ).resolves.toBeUndefined();

    expect(triggers).toHaveLength(1);
  });
});

describe("knockConfig", () => {
  const complete = {
    KNOCK_API_KEY: "sk_test_1",
    KNOCK_PUBLIC_API_KEY: "pk_test_1",
    KNOCK_SIGNING_KEY: "-----BEGIN RSA PRIVATE KEY-----",
    KNOCK_FEED_CHANNEL_ID: "feed-channel",
  };

  it("returns all four settings when they are set", () => {
    expect(knockConfig(complete)).toEqual({
      apiKey: "sk_test_1",
      publicApiKey: "pk_test_1",
      signingKey: "-----BEGIN RSA PRIVATE KEY-----",
      feedChannelId: "feed-channel",
    });
  });

  it("treats a partial config as off", () => {
    for (const missing of Object.keys(complete)) {
      expect(knockConfig({ ...complete, [missing]: undefined })).toBeNull();
    }
  });
});

describe("notifySeatClaimed", () => {
  const seatClaimed: SeatClaimed = {
    recipient: { id: "7", name: "Priya", email: "priya@example.com" },
    actor: { id: "9", name: "Ben", email: "ben@example.com" },
    data: {
      student_name: "Ben",
      course_title: "Test Course",
      claimed: 2,
      total: 3,
      url: "/team",
    },
  };

  it("puts the claim in the Team Admin's feed, from the Student who claimed", async () => {
    const { feed, triggers } = recordingFeed();

    await notifySeatClaimed(seatClaimed, feed);

    expect(triggers).toEqual([
      {
        workflow: "seat-claimed",
        args: {
          recipients: [{ id: "7", name: "Priya", email: "priya@example.com" }],
          actor: { id: "9", name: "Ben", email: "ben@example.com" },
          data: {
            student_name: "Ben",
            course_title: "Test Course",
            claimed: 2,
            total: 3,
            url: "/team",
          },
        },
      },
    ]);
  });

  it("resolves when the feed fails", async () => {
    await expect(
      notifySeatClaimed(seatClaimed, failingFeed())
    ).resolves.toBeUndefined();
  });
});
