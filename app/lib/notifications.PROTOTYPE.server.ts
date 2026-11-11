// ⚠️ PROTOTYPE: throwaway. Answers the wayfinder ticket
// "Prototype the server wiring between Cadence and Knock" (issue #18).
// Lives on branch prototype/knock-server-wiring and is never merged.
//
// Question: where do the Knock trigger and the email send live, and how readable
// is the flow from the admin refunds action down to Knock?
//
// Shape tried here: ONE function per event (`notifyRefundDecided`), called from
// the action after the decision transaction has committed. It does both halves:
//   1. the in-app feed: a Knock workflow trigger, buyer identified inline
//   2. the email: Cadence's own sendEmail (Knock has no email channel)
// Each half fails on its own and never throws back into the action, so a
// failed Notification never undoes the decision.

import { Knock } from "@knocklabs/node";
import { sendEmail, type Email } from "~/lib/mailer.server";

// Reads KNOCK_API_KEY from process.env (server only).
const knock = new Knock();

/** A person as Knock sees them. Ids are plain String(users.id). */
export type Recipient = { id: number; name: string; email: string };

/** What the buyer's feed item shows. Plain data, built inside the decision transaction. */
export type RefundDecided = {
  refundRequestId: number;
  buyer: Recipient;
  decision: "approved" | "declined";
  courseTitle: string;
  note: string | null;
};

function toKnockRecipient(person: Recipient) {
  return { id: String(person.id), name: person.name, email: person.email };
}

export async function notifyRefundDecided(
  event: RefundDecided,
  email: Email,
  platformAdmin: Recipient
) {
  const [feed, mail] = await Promise.allSettled([
    knock.workflows.trigger("refund-request-decided", {
      recipients: [toKnockRecipient(event.buyer)],
      actor: toKnockRecipient(platformAdmin),
      data: {
        decision: event.decision,
        course_title: event.courseTitle,
        note: event.note,
        url: "/dashboard",
      },
    }),
    sendEmail(email),
  ]);

  // PROTOTYPE: log and move on. Real retry/reporting is out of scope here.
  if (feed.status === "rejected") {
    console.error("[notifications] Knock trigger failed", feed.reason);
  }
  if (mail.status === "rejected") {
    console.error("[notifications] email failed", mail.reason);
  }

  return {
    workflowRunId:
      feed.status === "fulfilled" ? feed.value.workflow_run_id : null,
    emailSent: mail.status === "fulfilled",
  };
}

/** Exposed only so the prototype script can read a feed back. */
export { knock as PROTOTYPE_knock };
