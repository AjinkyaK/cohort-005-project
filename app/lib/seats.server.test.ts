import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { eq } from "drizzle-orm";
import { claimSeat, getSeatByCode, getSeatState } from "./seats.server";
import { declineRefundRequest } from "./refund-requests.server";

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

/** A Team Licence bought by the base user, with one Seat. */
function buyTeamLicence() {
  const purchase = holder.db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 9800,
      country: "US",
    })
    .returning()
    .get();
  const team = holder.db.insert(schema.teams).values({}).returning().get();
  const seat = holder.db
    .insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: `SEAT-${purchase.id}`,
      purchaseId: purchase.id,
    })
    .returning()
    .get();
  return { purchase, seat };
}

function requestRefund(purchaseId: number, status: schema.RefundStatus) {
  return holder.db
    .insert(schema.refunds)
    .values({ purchaseId, reason: "The team changed plans.", status })
    .returning()
    .get();
}

function addLearner(name: string) {
  return holder.db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

describe("getSeatState", () => {
  it("is Available when nobody has claimed it and there is no Refund Request", () => {
    const { seat } = buyTeamLicence();

    expect(getSeatState(seat)).toBe("available");
  });

  it("is Claimed once someone has claimed it", () => {
    const { seat } = buyTeamLicence();
    const learner = addLearner("Ada");

    expect(getSeatState({ ...seat, redeemedByUserId: learner.id })).toBe(
      "claimed"
    );
  });

  it("is Held while its Team Licence has an Open Refund Request", () => {
    const { purchase, seat } = buyTeamLicence();
    requestRefund(purchase.id, schema.RefundStatus.Open);

    expect(getSeatState(seat)).toBe("held");
  });

  it("is Available again once the Refund Request is Declined", () => {
    const { purchase, seat } = buyTeamLicence();
    requestRefund(purchase.id, schema.RefundStatus.Declined);

    expect(getSeatState(seat)).toBe("available");
  });

  it("goes from Held back to Available when a Platform Admin declines the Refund Request", () => {
    const { purchase, seat } = buyTeamLicence();
    const refundRequest = requestRefund(purchase.id, schema.RefundStatus.Open);
    const admin = holder.db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    expect(getSeatState(seat)).toBe("held");

    declineRefundRequest(refundRequest.id, admin.id);

    expect(getSeatState(seat)).toBe("available");
  });

  it("is not Held by another Team Licence's Open Refund Request", () => {
    const { seat } = buyTeamLicence();
    const other = buyTeamLicence();
    requestRefund(other.purchase.id, schema.RefundStatus.Open);

    expect(getSeatState(seat)).toBe("available");
  });
});

describe("claimSeat", () => {
  function enrollmentsOf(userId: number) {
    return holder.db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, userId))
      .all();
  }

  it("refuses a Held Seat as on hold, and enrols nobody", () => {
    const { purchase, seat } = buyTeamLicence();
    requestRefund(purchase.id, schema.RefundStatus.Open);
    const learner = addLearner("Ada");

    const result = claimSeat(seat.code, learner.id, "US");

    expect(result).toEqual({
      ok: false,
      error: "This seat is on hold. Please try again later.",
    });
    expect(enrollmentsOf(learner.id)).toEqual([]);
    expect(getSeatState(seat)).toBe("held");
  });

  it("claims the Seat once its Refund Request is Declined", () => {
    const { purchase, seat } = buyTeamLicence();
    requestRefund(purchase.id, schema.RefundStatus.Declined);
    const learner = addLearner("Ada");

    const result = claimSeat(seat.code, learner.id, "US");

    expect(result.ok).toBe(true);
    expect(enrollmentsOf(learner.id)).toHaveLength(1);
    const claimed = getSeatByCode(seat.code);
    expect(claimed && getSeatState(claimed)).toBe("claimed");
  });
});
