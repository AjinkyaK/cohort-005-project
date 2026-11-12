import { createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Email, MailTransport } from "~/lib/mailer.server";
import {
  knockConfig,
  knockFeedSession,
  type KnockConfig,
  notifyRefundDecided,
  type FeedTransport,
  type RefundDecided,
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

describe("knockFeedSession", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  const config: KnockConfig = {
    apiKey: "sk_test_1",
    publicApiKey: "pk_test_1",
    signingKey: privateKey,
    feedChannelId: "feed-channel",
  };

  function decode(token: string) {
    const [header, payload, signature] = token.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    return {
      header: JSON.parse(Buffer.from(header, "base64url").toString()),
      payload: JSON.parse(Buffer.from(payload, "base64url").toString()),
      validSignature: verifier.verify(publicKey, signature, "base64url"),
    };
  }

  it("gives the browser the public key, feed channel, person id and a signed User Token", async () => {
    const session = await knockFeedSession(7, config);

    expect(session).toEqual({
      apiKey: "pk_test_1",
      feedChannelId: "feed-channel",
      userId: "7",
      userToken: expect.any(String),
    });
  });

  it("signs the User Token with RS256 for that person, valid for one hour", async () => {
    const session = await knockFeedSession(7, config);
    const { header, payload, validSignature } = decode(session!.userToken);

    expect(validSignature).toBe(true);
    expect(header.alg).toBe("RS256");
    expect(payload.sub).toBe("7");
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it("is null when nobody is signed in", async () => {
    expect(await knockFeedSession(null, config)).toBeNull();
  });

  it("is null without Knock config", async () => {
    expect(await knockFeedSession(7, null)).toBeNull();
  });
});
