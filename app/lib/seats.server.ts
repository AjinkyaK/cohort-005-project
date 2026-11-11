// Seats and their states. See GLOSSARY.md and ADR 0002.

import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { RefundStatus, coupons, enrollments, purchases } from "~/db/schema";
import { hasRefundRequest } from "./refund-eligibility.server";

export type SeatState = "available" | "held" | "claimed";

type Seat = Pick<
  typeof coupons.$inferSelect,
  "purchaseId" | "redeemedByUserId"
>;

/**
 * Whether the Seat is Available, Held or Claimed: the one place that decides,
 * because "nobody has claimed it" does not mean it can be claimed (ADR 0002).
 */
export function getSeatState(seat: Seat): SeatState {
  if (seat.redeemedByUserId !== null) return "claimed";
  if (hasRefundRequest(seat.purchaseId, RefundStatus.Open)) return "held";
  return "available";
}

/** Whether the Purchase is a Team Licence: one that bought Seats. */
export function isTeamLicence(purchaseId: number) {
  const seat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .get();
  return seat !== undefined;
}

/** Whether the learner holds a Claimed Seat on the course, from any Team Licence. */
export function holdsClaimedSeat(userId: number, courseId: number) {
  const seat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.redeemedByUserId, userId), eq(coupons.courseId, courseId))
    )
    .get();
  return seat !== undefined;
}

export function getSeatByCode(code: string) {
  return db.select().from(coupons).where(eq(coupons.code, code)).get();
}

export type ClaimResult =
  | { ok: true; enrollment: typeof enrollments.$inferSelect }
  | { ok: false; error: string };

/** Claim the Seat with this code for the learner, enrolling them on its course. */
export function claimSeat(
  code: string,
  userId: number,
  userCountry: string
): ClaimResult {
  const seat = getSeatByCode(code);
  if (!seat) {
    return { ok: false, error: "Coupon not found" };
  }

  const state = getSeatState(seat);
  if (state === "claimed") {
    return { ok: false, error: "Coupon has already been redeemed" };
  }
  if (state === "held") {
    return {
      ok: false,
      error: "This seat is on hold. Please try again later.",
    };
  }

  const existingEnrollment = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, seat.courseId)
      )
    )
    .get();

  if (existingEnrollment) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();

  if (purchase?.country && purchase.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  db.update(coupons)
    .set({
      redeemedByUserId: userId,
      redeemedAt: new Date().toISOString(),
    })
    .where(eq(coupons.id, seat.id))
    .run();

  const enrollment = db
    .insert(enrollments)
    .values({ userId, courseId: seat.courseId })
    .returning()
    .get();

  return { ok: true, enrollment };
}
