import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { getAccess, requirePlatformAdmin } from "./access.server";
import { approveRefundRequest } from "./refund-requests.server";

const holder = vi.hoisted(() => ({
  db: undefined as unknown as ReturnType<typeof createTestDb>,
}));

vi.mock("~/db", () => ({
  get db() {
    return holder.db;
  },
}));

let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  holder.db = createTestDb();
  base = seedBaseData(holder.db);
});

async function requestAs(userId: number | null, country?: string) {
  const headers: Record<string, string> = country ? { "CF-IPCountry": country } : {};
  if (userId === null) return new Request("http://localhost/admin", { headers });
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  headers.Cookie = setCookie.split(";")[0];
  return new Request("http://localhost/admin", { headers });
}

async function statusThrownBy(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "init" in error &&
      typeof error.init === "object" &&
      error.init !== null &&
      "status" in error.init
    ) {
      return error.init.status;
    }
    throw error;
  }
  return "did not throw";
}

describe("requirePlatformAdmin", () => {
  it("rejects a signed-out visitor with 401", async () => {
    expect(await statusThrownBy(requirePlatformAdmin(await requestAs(null)))).toBe(
      401
    );
  });

  it("rejects a Student or an Instructor with 403", async () => {
    for (const user of [base.user, base.instructor]) {
      expect(
        await statusThrownBy(requirePlatformAdmin(await requestAs(user.id)))
      ).toBe(403);
    }
  });

  it("rejects a Team Admin with 403", async () => {
    const team = holder.db.insert(schema.teams).values({}).returning().get();
    holder.db
      .insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: base.user.id,
        role: schema.TeamMemberRole.Admin,
      })
      .run();

    expect(
      await statusThrownBy(requirePlatformAdmin(await requestAs(base.user.id)))
    ).toBe(403);
  });

  it("lets a Platform Admin through and returns them", async () => {
    const admin = holder.db
      .insert(schema.users)
      .values({
        name: "Ada Admin",
        email: "ada@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();

    const result = await requirePlatformAdmin(await requestAs(admin.id));

    expect(result.userId).toBe(admin.id);
    expect(result.user.name).toBe("Ada Admin");
  });

  it("rejects a session whose user no longer exists with 403", async () => {
    expect(await statusThrownBy(requirePlatformAdmin(await requestAs(9999)))).toBe(
      403
    );
  });
});

describe("getAccess after a Refund Request is approved", () => {
  function addPlatformAdmin() {
    return holder.db
      .insert(schema.users)
      .values({
        name: "Ada Admin",
        email: "ada@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
  }

  function buyAndEnroll(country: string, createdAt: string) {
    const purchase = holder.db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 4900,
        country,
        createdAt,
      })
      .returning()
      .get();
    holder.db
      .insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    return purchase;
  }

  function approveRefundOn(purchaseId: number) {
    const request = holder.db
      .insert(schema.refunds)
      .values({ purchaseId, reason: "Not for me." })
      .returning()
      .get();
    approveRefundRequest(request.id, addPlatformAdmin().id, 4900);
  }

  it("no longer lets the learner reach the course's lessons", async () => {
    approveRefundOn(buyAndEnroll("US", "2026-03-01T12:00:00.000Z").id);

    const access = await getAccess(
      await requestAs(base.user.id, "US"),
      base.course.id
    );

    expect(access).toMatchObject({ enrolled: false, canViewContent: false });
  });

  it("judges PPP by the learner's new Purchase, not the Refunded Purchase, after they buy again", async () => {
    holder.db
      .update(schema.courses)
      .set({ price: 4900, pppEnabled: true })
      .run();
    // Bought at an India discount, refunded, then bought again at full price.
    approveRefundOn(buyAndEnroll("IN", "2026-03-01T12:00:00.000Z").id);
    buyAndEnroll("US", "2026-03-10T12:00:00.000Z");

    const access = await getAccess(
      await requestAs(base.user.id, "US"),
      base.course.id
    );

    expect(access).toMatchObject({
      enrolled: true,
      pppBlocked: false,
      canViewContent: true,
    });
  });
});
