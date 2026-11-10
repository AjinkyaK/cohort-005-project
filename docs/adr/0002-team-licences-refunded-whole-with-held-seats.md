# Team Licences are refunded whole, judged only by Claimed Seats, and their Seats are held during review

A Refund Request on a Team Licence is for the whole Licence. It is eligible only while no Seat has been claimed, and the Team Admin claiming one themselves counts. While the request is Open, every Seat is a Held Seat and cannot be claimed. Declining makes the Seats Available again, and approving makes them Void. Approving a Team Licence therefore never ends an Enrollment: by the time a Platform Admin decides, none of its Seats has been claimed, so nobody is using it. The Watch Limit and Completion Limit do not apply to Team Licences, because they measure the buyer's own viewing, which says nothing about whether the team used the Seats. The Claimed Seat is the only sign of use that matters, and the Refund Amount is what was paid.

## Considered Options

The question was what should happen if a Seat is claimed while the Team Licence's Refund Request is Open:

- **Let the Seat be claimed, and have approval end that learner's Enrollment.** Rejected: someone who did nothing wrong loses access with no warning, because of another person's refund.
- **Let the Seat be claimed, and make approval impossible from then on.** Rejected: the Platform Admin's decision gets taken away by a third party's click, and Refund Eligibility is meant to be judged only when the request is raised.
- **Partially refund only the unclaimed Seats.** Rejected: a Refund Request is for one Purchase's money, not part of it. Per-seat refunds would make Amount Refunded a calculation and need a different model.
- **Hold the Seats (chosen).** Someone given a Seat's link is told it is on hold and to try again later. That is a small, temporary inconvenience, unlike losing access.

## Consequences

- A Seat whose claim is "still empty" is not necessarily claimable. Code must not treat "nobody has claimed it" as "can be claimed"; a Seat's state comes from its Team Licence's Refund Requests too. This is why the glossary defines Available, Held, Claimed and Void, and avoids "Unclaimed Seat".
- Team Licence requests are raised from the team page, per Licence. Individual Purchases stay on the course page.
