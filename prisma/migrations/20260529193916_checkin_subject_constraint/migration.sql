-- A CheckIn must reference exactly one subject: a member OR a visitor pass,
-- never both, never neither. App code enforced this; this makes it a DB invariant.
ALTER TABLE "CheckIn"
  ADD CONSTRAINT "CheckIn_subject_exactly_one"
  CHECK (
    ("memberId" IS NOT NULL AND "visitorPassId" IS NULL)
    OR
    ("memberId" IS NULL AND "visitorPassId" IS NOT NULL)
  );
