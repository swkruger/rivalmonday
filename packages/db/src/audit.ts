import type { AuditSink } from '@cs/core';
import type { Db } from './client';
import { auditLog } from './schema';

/** Use with the service-role Db so audit writes succeed regardless of the caller's tenant transaction. */
export function createAuditSink(db: Db): AuditSink {
  return {
    async record(event) {
      await db.insert(auditLog).values(event);
    },
  };
}
