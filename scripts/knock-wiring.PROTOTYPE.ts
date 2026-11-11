// ⚠️ PROTOTYPE: throwaway (issue #18). Run: npm run prototype:knock
// Fires the real notifyRefundDecided once against Knock's Development
// environment for a seeded buyer, then reads the feeds back so we can see:
//   - what the trigger returns
//   - what lands in the buyer's in-app feed
//   - what Knock returns for a person who has never received a Notification
import { eq } from "drizzle-orm";
import { db } from "../app/db";
import { purchases, users, UserRole } from "../app/db/schema";
import {
  notifyRefundDecided,
  PROTOTYPE_knock as knock,
} from "../app/lib/notifications.PROTOTYPE.server";

const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID!;

const purchase = db.select().from(purchases).limit(1).get()!;
const buyer = db.select().from(users).where(eq(users.id, purchase.userId)).get()!;
const admin = db.select().from(users).where(eq(users.role, UserRole.Admin)).get()!;

console.log("Buyer:", buyer.id, buyer.name, "| Platform Admin:", admin.id, admin.name);

const result = await notifyRefundDecided(
  {
    refundRequestId: 0,
    buyer: { id: buyer.id, name: buyer.name, email: buyer.email },
    decision: "declined",
    courseTitle: "PROTOTYPE course",
    note: "Prototype run from scripts/knock-wiring.PROTOTYPE.ts",
  },
  { to: buyer.email, subject: "PROTOTYPE refund declined", body: "Prototype email." },
  { id: admin.id, name: admin.name, email: admin.email }
);
console.log("\nnotifyRefundDecided →", result);

// Workflow runs are async; give Knock a moment before reading the feed.
await new Promise((r) => setTimeout(r, 3000));

async function showFeed(label: string, userId: string) {
  try {
    const page = await knock.users.feeds.listItems(userId, feedChannelId);
    const items = page.entries ?? page.getPaginatedItems?.() ?? [];
    console.log(`\n${label} (${userId}): ${items.length} item(s)`);
    for (const item of items.slice(0, 3)) {
      console.log(" -", item.inserted_at, JSON.stringify(item.data), "actors:", item.actors?.map((a: any) => a.id));
    }
  } catch (error: any) {
    console.log(`\n${label} (${userId}): ERROR ${error.status ?? ""} ${error.message}`);
  }
}

await showFeed("Buyer feed", String(buyer.id));
await showFeed("Never-notified feed", `never-notified-${Date.now()}`);
