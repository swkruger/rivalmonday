-- Phase 12b: clients already active before activated_at existed count as activated at creation.
UPDATE client SET activated_at = created_at WHERE activated_at IS NULL AND status = 'active';
