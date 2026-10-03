-- A reclaimed stale brief run must never store a second set of items (Task 11 fencing backstop).
-- DEFERRABLE INITIALLY DEFERRED so a reorder that rewrites ord row by row in one transaction does not collide mid-way.
ALTER TABLE brief_item ADD CONSTRAINT brief_item_brief_ord_unique UNIQUE (brief_id, ord) DEFERRABLE INITIALLY DEFERRED;
