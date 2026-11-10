# Cadence

An online course platform where learners buy courses, work through lessons, and can ask for their money back on a recent purchase.

## Buying and access

**Purchase**:
A learner paying for a course; the record of what was paid, when, and from which country.
_Avoid_: Order, transaction

**Enrollment**:
A learner's access to a course. It can come from a Purchase or from a redeemed team seat, so being enrolled does not mean a learner bought the course.
_Avoid_: Registration, subscription

## Refunds

**Refund Request**:
A learner's request, with a written reason, for the money from one of their own Purchases to be given back. It always belongs to a Purchase, never directly to an Enrollment.
_Avoid_: Cancellation, Reversal, Chargeback, Refund (for the request itself)

**Refund**:
Money being given back to the learner, once an Admin approves a Refund Request. A learner counts as refunded from the moment of approval; when the money actually reaches their bank is outside the platform and is not tracked.
_Avoid_: Reversal, Chargeback, Delivered, Settled, Paid out

**Refund Amount**:
The figure quoted to the learner when they make a Refund Request: what they paid if they bought at a purchasing-power discount, otherwise the course's current list price. It is a quote, not a record of what was given back.
_Avoid_: Refundable amount

**Amount Refunded**:
The figure an Admin records when approving a Refund Request; the only record of what was actually given back. It is normally the same as the Refund Amount but can differ, for example if the course was repriced in between.
_Avoid_: Refund Amount (for the recorded figure)

**Open** (Refund Request status):
A Refund Request that no Admin has resolved yet. A Purchase can have at most one Open Refund Request.
_Avoid_: Requested, Pending

**Approved** (Refund Request status):
An Admin has accepted the Refund Request, so a Refund is due. Approved is final within the platform, even if the money later fails to reach the learner.

**Declined** (Refund Request status):
An Admin has turned the Refund Request down, so nothing is given back. A Declined request does not stop the learner raising a new one while they are still eligible.

**Admin**:
The only kind of user who can resolve an Open Refund Request, by approving or declining it.

## Refund Eligibility

**Refund Eligibility**:
Whether a learner may raise a Refund Request on a Purchase right now. It is judged per Purchase, only at the moment the request is raised; an Admin's later decision is not bound by it. A Purchase is eligible only when every rule below holds.
_Avoid_: Cancellation offer, cancellable

**Refund Window**:
The period in which a Purchase can be refunded: from the purchase day to the end of the 14th calendar day after it, counted in the platform's local time rather than the learner's.
_Avoid_: Cancel window

**Watched Time**:
How much of a course's video a learner has seen: the furthest point reached in each lesson, added up across the course. Skipping ahead counts as watching. It belongs to the learner and course, so it carries over between Purchases.

**Watch Limit**:
Two hours of Watched Time. A learner at or past it is no longer eligible.

**Completion Limit**:
Half of a course's lessons completed. A learner at or past it is no longer eligible; a course with no lessons has no Completion Limit.

**Claimed Seat**:
A team seat that a colleague has redeemed. A team Purchase with any Claimed Seat cannot be refunded at all, even for its unclaimed seats.
_Avoid_: Redeemed coupon, used seat

**Refunded Purchase**:
A Purchase with an Approved Refund Request. Buying the course again creates a new Purchase with its own Refund Window.
