-- Payment gating: a league can require the commissioner to confirm payment
-- before a member actually participates (see LeagueMembership.hasPaid/paidAt
-- and recompute.service.ts's eligibility-window handling).

ALTER TABLE "League" ADD COLUMN "paymentRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LeagueMembership" ADD COLUMN "hasPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeagueMembership" ADD COLUMN "paidAt" TIMESTAMP(3);
