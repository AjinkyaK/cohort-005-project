# Cadence

An online course platform where learners buy courses, work through lessons, and can ask for their money back on a recent purchase.

## Buying and access

**Purchase**:
A learner paying for a course; the record of what was paid, when, and from which country.
_Avoid_: Order, transaction

**Individual Purchase**:
A Purchase of one place on a course, for the buyer themselves. It enrols the buyer.

**Team Licence**:
A Purchase of several Seats on a course for a team, made by its Team Admin. It does not enrol the Team Admin; they take a place only by claiming one of its Seats like anyone else.
_Avoid_: Team purchase, bulk purchase

**Seat**:
One place on a course bought as part of a Team Licence, which anyone can claim once to become enrolled. Every Seat is in exactly one state: Available, Held, Claimed or Void.
_Avoid_: Coupon, code (for the Seat itself), Unclaimed Seat (it lumps together Available, Held and Void)

**Available Seat**:
A Seat that can be claimed right now: nobody has claimed it, and its Team Licence has neither an Open nor an Approved Refund Request.

**Enrollment**:
A learner's access to a course. It can come from an Individual Purchase or from a Claimed Seat, so being enrolled does not mean a learner bought the course. It ends the moment the Refund Request on the Purchase behind it is Approved, and not before; the learner's progress is kept.
_Avoid_: Registration, subscription

## Refunds

**Refund Request**:
A buyer's request, with a written reason, for the money from one specific Purchase of their own to be given back; the buyer chooses which. A Refund Request on an Individual Purchase is raised from the course page, and one on a Team Licence from the team page. It always belongs to a Purchase, never directly to an Enrollment.
_Avoid_: Cancellation, Reversal, Chargeback, Refund (for the request itself)

**Refund**:
Money being given back to the learner, once a Platform Admin approves a Refund Request. A learner counts as refunded from the moment of approval, whatever its Payment Transfer Status; when the money actually reaches their bank is outside the platform and is not tracked.
_Avoid_: Reversal, Chargeback, Delivered, Settled, Paid out

**Refund Amount**:
The figure quoted to the learner when they make a Refund Request: for a Team Licence, what was paid; for an Individual Purchase, what was paid if it was bought at a purchasing-power discount, otherwise the course's current list price. It is a quote, not a record of what was given back.
_Avoid_: Refundable amount

**Amount Refunded**:
The figure a Platform Admin records when approving a Refund Request; the only record of what was actually given back. It is normally the same as the Refund Amount but can differ, for example if the course was repriced in between.
_Avoid_: Refund Amount (for the recorded figure)

**Open** (Refund Request status):
A Refund Request that no Admin has resolved yet. A Purchase can have at most one Open Refund Request.
_Avoid_: Requested, Pending

**Approved** (Refund Request status):
A Platform Admin has accepted the Refund Request, so a Refund is due. Approved is final within the platform, even if the Refund's Payment Transfer Status later becomes Failed or Canceled.

**Declined** (Refund Request status):
A Platform Admin has turned the Refund Request down, so nothing is given back. A Declined request does not stop the learner raising a new one while they are still eligible.

**Platform Admin**:
Someone who runs the platform itself, and the only kind of user who can resolve an Open Refund Request, by approving or declining it.
_Avoid_: Admin (on its own), Team Admin

**Team Admin**:
The member of a team who manages its seats. A Team Admin has no say over Refund Requests, not even on their own team's Purchase.
_Avoid_: Admin (on its own)

## Payment transfers

**Payment Transfer Status**:
The payment service's latest word on a Refund: how the money's journey back to the learner is going. It is shown to the learner alongside the Refund Request's status but decides nothing else; being refunded still depends only on approval. Only an Approved Refund Request can have one, and until the payment service reports anything it has none. Each new report replaces the last, and earlier reports are not kept.
_Avoid_: Refund status, Payout status, Settlement status

**Pending** (Payment Transfer Status):
The payment service has taken on the Refund but has not finished sending it. Not to be confused with an Open Refund Request, which has no Payment Transfer Status at all.

**Succeeded** (Payment Transfer Status):
The payment service reports the money as sent. It does not mean the money has reached the learner's bank, and a Succeeded Refund can still later become Failed.

**Failed** (Payment Transfer Status):
The payment service could not send the money, for example because the learner's card is closed. The Refund Request stays Approved and the money is still owed.

**Canceled** (Payment Transfer Status):
The payment service's transfer was withdrawn before it completed. It is the transfer that is canceled, not the Refund Request, which stays Approved.

**Requires Action** (Payment Transfer Status):
The payment service needs something more before it can send the money, such as the learner's bank details.

## Refund Eligibility

**Refund Eligibility**:
Whether a learner may raise a Refund Request on a Purchase right now. It is judged per Purchase, only at the moment the request is raised; a Platform Admin's later decision is not bound by it. A Purchase is eligible only when every rule below holds.
_Avoid_: Cancellation offer, cancellable

**Refund Window**:
The period in which a Purchase can be refunded: from the purchase day to the end of the 14th calendar day after it, counted in the platform's local time rather than the learner's.
_Avoid_: Cancel window

**Watched Time**:
How much of a course's video a learner has seen: the furthest point reached in each lesson, added up across the course. Skipping ahead counts as watching. It belongs to the learner and course, so it carries over between Purchases.

**Watch Limit**:
Two hours of Watched Time. A learner at or past it is no longer eligible. It applies only to Individual Purchases.

**Completion Limit**:
Half of a course's lessons completed. A learner at or past it is no longer eligible; a course with no lessons has no Completion Limit. It applies only to Individual Purchases.

**Claimed Seat**:
A Seat that someone has claimed, whoever they are, the Team Admin included. A Team Licence with any Claimed Seat is not eligible for a refund, even for its other Seats.
_Avoid_: Redeemed coupon, used seat

**Held Seat**:
A Seat that would be Available, except that its Team Licence has an Open Refund Request, so it cannot be claimed until the request is resolved. If the request is Declined it becomes Available again; if Approved, it becomes Void. Because Seats are held, a Team Licence never gains a Claimed Seat while its Refund Request is Open.
_Avoid_: Frozen seat, locked seat

**Void Seat**:
A Seat on a Refunded Team Licence. It was never claimed and never can be.
_Avoid_: Cancelled seat, revoked seat, expired seat

**Refunded Purchase**:
A Purchase with an Approved Refund Request. An Individual Purchase's Enrollment ends; every Seat on a Team Licence becomes Void. Buying the course again creates a new Purchase with its own Refund Window.
