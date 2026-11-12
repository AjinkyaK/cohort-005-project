import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus, RefundStatus, UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  checkRefundRequest,
  claimSeat,
  declineRefundRequest,
  getRefundOffer,
  getSeatAvailability,
  listRefundRequestsForBuyer,
  listRefundRequestsForReview,
  listTeamLicences,
  raiseRefundRequest,
} from "./refunds.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  platformAdmin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3, 4].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addLearner(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function buyForSelf(userId: number, daysAgo = 3, amountPaid = 7900) {
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid,
      createdAt: daysBefore(daysAgo),
    })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
  return purchase;
}

function buySeats(userId: number, seats: number, daysAgo = 3) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      createdAt: daysBefore(daysAgo),
    })
    .returning()
    .get();
  const seatRows = Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, seats: seatRows };
}

function markSeatClaimed(seatId: number, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: daysBefore(1) })
    .where(eq(schema.coupons.id, seatId))
    .run();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

function isEnrolled(userId: number) {
  return !!db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .get();
}

function raise(purchaseId: number, buyerId: number) {
  const result = raiseRefundRequest(
    db,
    purchaseId,
    buyerId,
    "It was not what I expected.",
    NOW
  );
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

function getSeat(seatId: number) {
  const seat = db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.id, seatId))
    .get();
  if (!seat) throw new Error("Seat not found");
  return seat;
}

describe("raising a Refund Request", () => {
  it("lets the buyer raise one on an Individual Purchase inside the window", () => {
    const purchase = buyForSelf(base.user.id);

    const result = raiseRefundRequest(db, purchase.id, base.user.id, "Nope.", NOW);

    expect(result).toMatchObject({ ok: true, kind: "individual_purchase" });
  });

  it("refuses anyone but the buyer", () => {
    const purchase = buyForSelf(base.user.id);
    const someoneElse = addLearner("Ben");

    expect(checkRefundRequest(db, purchase.id, someoneElse.id, NOW)).toMatchObject(
      { ok: false, status: 404 }
    );
  });

  it("allows only one Open Refund Request per Purchase", () => {
    const purchase = buyForSelf(base.user.id);
    raise(purchase.id, base.user.id);

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 409 }
    );
  });

  it("keeps the fourteenth day open and closes the fifteenth", () => {
    const onDay14 = buyForSelf(base.user.id, 14);
    const onDay15 = buyForSelf(addLearner("Ben").id, 15);

    expect(checkRefundRequest(db, onDay14.id, onDay14.userId, NOW).ok).toBe(true);
    expect(
      checkRefundRequest(db, onDay15.id, onDay15.userId, NOW)
    ).toMatchObject({ ok: false, error: "The 14-day window has closed." });
  });

  it("refuses a buyer who has completed half the lessons", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.lessonProgress)
      .values(
        lessonIds.slice(0, 2).map((lessonId) => ({
          userId: base.user.id,
          lessonId,
          status: LessonProgressStatus.Completed,
        }))
      )
      .run();

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 403 }
    );
  });

  it("refuses a buyer who has watched two hours", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.videoWatchEvents)
      .values([
        { userId: base.user.id, lessonId: lessonIds[0], eventType: "progress", positionSeconds: 3600 },
        { userId: base.user.id, lessonId: lessonIds[1], eventType: "progress", positionSeconds: 3600 },
      ])
      .run();

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 403 }
    );
  });

  it("refuses a Team Licence with a Claimed Seat", () => {
    const teamAdmin = addLearner("Priya");
    const { purchase, seats } = buySeats(teamAdmin.id, 3);
    markSeatClaimed(seats[0].id, addLearner("Ben").id);

    expect(checkRefundRequest(db, purchase.id, teamAdmin.id, NOW)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("telling Platform Admins a Refund Request was raised", () => {
  it("tells every Platform Admin, from the buyer, with the whole reason", () => {
    const secondAdmin = db
      .insert(schema.users)
      .values({ name: "Sam Admin", email: "sam@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = buyForSelf(base.user.id);
    const reason = "It was not what I expected. ".repeat(30).trim();

    const result = raiseRefundRequest(db, purchase.id, base.user.id, reason, NOW);
    if (!result.ok) throw new Error(result.error);

    expect(result.refundRaised.recipients).toEqual([
      { id: String(platformAdmin.id), name: "Pat Admin", email: "pat@example.com" },
      { id: String(secondAdmin.id), name: "Sam Admin", email: "sam@example.com" },
    ]);
    expect(result.refundRaised.actor).toEqual({
      id: String(base.user.id),
      name: "Test User",
      email: "test@example.com",
    });
    expect(result.refundRaised.data).toEqual({
      buyer_name: "Test User",
      course_title: "Test Course",
      amount: "$79.00",
      reason,
      url: "/admin/refunds",
    });
  });

  it("tells a Platform Admin who raised it on their own Purchase too", () => {
    const purchase = buyForSelf(platformAdmin.id);

    const result = raiseRefundRequest(db, purchase.id, platformAdmin.id, "Bought it twice.", NOW);
    if (!result.ok) throw new Error(result.error);

    expect(result.refundRaised.recipients.map((r) => r.id)).toEqual([
      String(platformAdmin.id),
    ]);
    expect(result.refundRaised.actor.id).toBe(String(platformAdmin.id));
  });

  it("emails each Platform Admin about an Individual Purchase", () => {
    const purchase = buyForSelf(base.user.id);

    const result = raiseRefundRequest(db, purchase.id, base.user.id, "Not for me.", NOW);
    if (!result.ok) throw new Error(result.error);

    expect(result.refundRaised.emails).toEqual([
      {
        to: "pat@example.com",
        subject: "New refund request — Test Course",
        body: [
          'Test User has asked for a refund on "Test Course" (Individual Purchase, $79.00).',
          "",
          "Their reason:",
          "Not for me.",
          "",
          "Decide it under Admin → Refund Requests.",
        ].join("\n"),
      },
    ]);
  });

  it("emails the Seat count for a Team Licence", () => {
    const teamAdmin = addLearner("Priya");
    const { purchase } = buySeats(teamAdmin.id, 3);

    const result = raiseRefundRequest(db, purchase.id, teamAdmin.id, "Team changed plans.", NOW);
    if (!result.ok) throw new Error(result.error);

    expect(result.refundRaised.emails[0].body).toContain(
      'Priya has asked for a refund on "Test Course" (Team Licence of 3 Seats, $237.00).'
    );
  });

  it("leaves the buyer's acknowledgement email as it was", () => {
    const purchase = buyForSelf(base.user.id);

    const result = raiseRefundRequest(db, purchase.id, base.user.id, "Not for me.", NOW);
    if (!result.ok) throw new Error(result.error);

    expect(result.email).toEqual({
      to: "test@example.com",
      subject: "Refund requested — Test Course",
      body: [
        "Hi Test User,",
        "",
        'We have your refund request for "Test Course".',
        "The refund is for $79.00, the amount you paid.",
        "",
        "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is done.",
        "",
        "— The Cadence team",
      ].join("\n"),
    });
  });
});

describe("the refund offer on the course page", () => {
  it("offers the newest Individual Purchase, not a newer Team Licence", () => {
    const individual = buyForSelf(base.user.id, 3);
    buySeats(base.user.id, 5, 1);

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toMatchObject({
      purchaseId: individual.id,
      amount: 7900,
    });
  });

  it("offers nothing once the purchase has been refunded", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toBeNull();
  });
});

describe("approving a Refund Request", () => {
  it("removes the buyer's Enrollment but keeps their progress", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: lessonIds[0],
        status: LessonProgressStatus.Completed,
      })
      .run();
    const id = raise(purchase.id, base.user.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(result.ok).toBe(true);
    expect(isEnrolled(base.user.id)).toBe(false);
    expect(
      db
        .select()
        .from(schema.lessonProgress)
        .where(eq(schema.lessonProgress.userId, base.user.id))
        .all()
    ).toHaveLength(1);

    const refundRequest = db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.id, id))
      .get();
    expect(refundRequest).toMatchObject({
      status: RefundStatus.Approved,
      amountRefunded: 7900,
      resolvedByUserId: platformAdmin.id,
    });
  });

  it("keeps the buyer's Enrollment if they also hold a Claimed Seat for the course", () => {
    const priya = addLearner("Priya");
    const { seats } = buySeats(priya.id, 2);
    // Liam claims a Seat first, so his Enrollment came from it.
    markSeatClaimed(seats[0].id, base.user.id);
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: daysBefore(2),
      })
      .returning()
      .get();
    const id = raise(purchase.id, base.user.id);

    approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(isEnrolled(base.user.id)).toBe(true);
  });

  it("makes a Team Licence's Unclaimed Seats unclaimable", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 2);
    const id = raise(purchase.id, priya.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(result.ok).toBe(true);
    for (const seat of seats) {
      expect(getSeatAvailability(db, getSeat(seat.id))).toBe("refunded");
    }
  });

  it("refuses a Team Licence whose Seat was claimed after the request", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 2);
    const id = raise(purchase.id, priya.id);
    // Seats are on hold while Open, but older data can still hold a claim.
    markSeatClaimed(seats[0].id, addLearner("Ben").id);

    expect(approveRefundRequest(db, id, platformAdmin.id, null, NOW)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(getSeatAvailability(db, getSeat(seats[1].id))).toBe("on_hold");
  });

  it("lets the first decision win", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    expect(
      declineRefundRequest(db, id, platformAdmin.id, "Too late.", NOW)
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "This refund request was already approved.",
    });
  });

  it("emails the buyer that the refund is on its way", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.email.to).toBe("test@example.com");
    expect(result.email.subject).toBe("Refund approved — Test Course");
    expect(result.email.body).toContain("$79.00");
  });

  it("tells the buyer, from the deciding Platform Admin, with the whole note and a link to their settings", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    const note = "Approved. ".repeat(200).trim();

    const result = approveRefundRequest(db, id, platformAdmin.id, note, NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.refundDecided).toEqual({
      recipient: {
        id: String(base.user.id),
        name: "Test User",
        email: "test@example.com",
      },
      actor: {
        id: String(platformAdmin.id),
        name: "Pat Admin",
        email: "pat@example.com",
      },
      data: {
        decision: "approved",
        course_title: "Test Course",
        note,
        amount: "$79.00",
        purchase_kind: "individual_purchase",
        url: "/settings",
      },
    });
  });

  it("tells a Team Admin their Unclaimed Seats can no longer be claimed, linking to the team page", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 2);
    const id = raise(purchase.id, priya.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.refundDecided.recipient.id).toBe(String(priya.id));
    expect(result.refundDecided.data).toMatchObject({
      decision: "approved",
      note: null,
      amount: "$158.00",
      purchase_kind: "team_licence",
      url: "/team",
    });
    expect(result.email.body).toContain(
      "Its Unclaimed Seats can no longer be claimed."
    );
  });

  it("does not mention Seats when approving an Individual Purchase", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    const result = approveRefundRequest(db, id, platformAdmin.id, null, NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.email.body).not.toContain("Seats");
  });
});

describe("declining a Refund Request", () => {
  it("needs a note", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    expect(declineRefundRequest(db, id, platformAdmin.id, "  ", NOW)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("keeps the buyer's Enrollment and lets them raise a new Refund Request", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);

    const result = declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "You finished the course.",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.email.body).toContain("You finished the course.");
    expect(isEnrolled(base.user.id)).toBe(true);
    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW).ok).toBe(true);
  });

  it("frees a Team Licence's Seats again", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 1);
    const id = raise(purchase.id, priya.id);
    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("on_hold");

    declineRefundRequest(db, id, platformAdmin.id, "Seats are in use.", NOW);

    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("available");
  });

  it("tells the buyer it was declined, with the whole note", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 1);
    const id = raise(purchase.id, priya.id);

    const result = declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "  Seats are in use.  ",
      NOW
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.refundDecided).toEqual({
      recipient: {
        id: String(priya.id),
        name: "Priya",
        email: "priya@example.com",
      },
      actor: {
        id: String(platformAdmin.id),
        name: "Pat Admin",
        email: "pat@example.com",
      },
      data: {
        decision: "declined",
        course_title: "Test Course",
        note: "Seats are in use.",
        amount: "$79.00",
        purchase_kind: "team_licence",
        url: "/team",
      },
    });
    expect(result.email.body).not.toContain("Unclaimed Seats");
  });
});

describe("listing Refund Requests", () => {
  it("shows a Platform Admin live figures and the rules a request breaks", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    // Since raising the request, the buyer has finished half the course.
    db.insert(schema.lessonProgress)
      .values(
        lessonIds.slice(0, 2).map((lessonId) => ({
          userId: base.user.id,
          lessonId,
          status: LessonProgressStatus.Completed,
        }))
      )
      .run();

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row).toMatchObject({
      id,
      buyerName: "Test User",
      daysSincePurchase: 3,
      figures: {
        kind: "individual_purchase",
        lessonsCompleted: 2,
        lessonCount: 4,
      },
      ruleBreaks: ["completed_too_much"],
      canApprove: true,
    });
  });

  it("shows a Team Licence's Seats instead of the buyer's progress", () => {
    const priya = addLearner("Priya");
    const { purchase } = buySeats(priya.id, 3);
    raise(purchase.id, priya.id);

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row.figures).toEqual({
      kind: "team_licence",
      seatCount: 3,
      claimedSeatCount: 0,
    });
  });

  it("lists only the requested status, oldest first", () => {
    const first = buyForSelf(base.user.id);
    const ben = addLearner("Ben");
    const second = buyForSelf(ben.id);
    const firstId = raise(first.id, base.user.id);
    const secondId = raiseRefundRequest(
      db,
      second.id,
      ben.id,
      "Changed my mind.",
      new Date(NOW.getTime() + 60_000)
    );
    if (!secondId.ok) throw new Error(secondId.error);

    expect(
      listRefundRequestsForReview(db, RefundStatus.Open, NOW).map((r) => r.id)
    ).toEqual([firstId, secondId.refundRequestId]);

    approveRefundRequest(db, firstId, platformAdmin.id, null, NOW);

    expect(
      listRefundRequestsForReview(db, RefundStatus.Approved, NOW)
    ).toMatchObject([{ id: firstId, decidedByName: "Pat Admin" }]);
  });

  it("shows a buyer their decided requests with the decline note", () => {
    const purchase = buyForSelf(base.user.id);
    const id = raise(purchase.id, base.user.id);
    declineRefundRequest(db, id, platformAdmin.id, "Past half way.", NOW);

    expect(listRefundRequestsForBuyer(db, base.user.id)).toMatchObject([
      { id, status: RefundStatus.Declined, decisionNote: "Past half way." },
    ]);
  });

  it("lists a Team Admin's Team Licences and whether each can be refunded", () => {
    const priya = addLearner("Priya");
    buySeats(priya.id, 2);
    const { seats } = buySeats(priya.id, 2);
    markSeatClaimed(seats[0].id, addLearner("Ben").id);

    expect(listTeamLicences(db, priya.id, NOW)).toMatchObject([
      { seatCount: 2, claimedSeatCount: 1, canRequestRefund: false },
      { seatCount: 2, claimedSeatCount: 0, canRequestRefund: true },
    ]);
  });
});

describe("claiming a Seat", () => {
  it("makes the Seat a Claimed Seat and enrols the Student", () => {
    const priya = addLearner("Priya");
    const ben = addLearner("Ben");
    const { seats } = buySeats(priya.id, 2);

    const result = claimSeat(db, seats[0].code, ben.id, "", NOW);

    if (!result.ok) throw new Error(result.error);
    expect(result.enrollment).toMatchObject({
      userId: ben.id,
      courseId: base.course.id,
    });
    expect(getSeat(seats[0].id)).toMatchObject({
      redeemedByUserId: ben.id,
      redeemedAt: NOW.toISOString(),
    });
    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("claimed");
    expect(isEnrolled(ben.id)).toBe(true);
  });

  it("refuses a code that isn't a Seat", () => {
    expect(claimSeat(db, "NO-SUCH-SEAT", base.user.id, "", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });

  it("refuses a Seat that is already claimed", () => {
    const priya = addLearner("Priya");
    const { seats } = buySeats(priya.id, 1);
    markSeatClaimed(seats[0].id, addLearner("Ben").id);

    expect(claimSeat(db, seats[0].code, base.user.id, "", NOW)).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
    expect(isEnrolled(base.user.id)).toBe(false);
  });

  it("refuses a Seat on hold while its Team Licence has an Open Refund Request", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 1);
    raise(purchase.id, priya.id);

    expect(claimSeat(db, seats[0].code, base.user.id, "", NOW)).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("on_hold");
    expect(isEnrolled(base.user.id)).toBe(false);
  });

  it("refuses a Seat whose Team Licence Refund Request was approved", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 1);
    approveRefundRequest(db, raise(purchase.id, priya.id), platformAdmin.id, null, NOW);

    expect(claimSeat(db, seats[0].code, base.user.id, "", NOW)).toEqual({
      ok: false,
      error:
        "This seat is no longer available. Ask the person who shared it with you.",
    });
    expect(isEnrolled(base.user.id)).toBe(false);
  });

  it("refuses a Student already enrolled in the course", () => {
    const priya = addLearner("Priya");
    const { seats } = buySeats(priya.id, 1);
    buyForSelf(base.user.id);

    expect(claimSeat(db, seats[0].code, base.user.id, "", NOW)).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("available");
  });

  it("refuses a Student in a different country from the buyer, saving nothing", () => {
    const priya = addLearner("Priya");
    const { purchase, seats } = buySeats(priya.id, 1);
    db.update(schema.purchases)
      .set({ country: "IN" })
      .where(eq(schema.purchases.id, purchase.id))
      .run();

    expect(claimSeat(db, seats[0].code, base.user.id, "US", NOW)).toEqual({
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    });
    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("available");
    expect(isEnrolled(base.user.id)).toBe(false);

    expect(claimSeat(db, seats[0].code, base.user.id, "IN", NOW).ok).toBe(true);
  });
});
