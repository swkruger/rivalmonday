export type Surface =
  | 'app-client' | 'app-agency' | 'app-platform' | 'app-account' | 'app-shared'
  | 'help' | 'guides' | 'glossary' | 'labels' | 'emails' | 'documents' | 'site' | 'site-legal' | 'mcp-tools';

export type ScanMode = 'module' | 'jsx' | 'property' | 'markdown';

export interface SourceRule {
  surface: Surface;
  mode: ScanMode;
  include: string[];
  exclude?: string[];
  properties?: string[];
}

export interface CopyItem {
  surface: Surface;
  file: string;
  line: number;
  anchor: string;
  context: string;
  text: string;
  hash: string;
  kind: 'string' | 'email' | 'document' | 'markdown';
  html?: string;
}

export type LedgerEntry =
  | { type: 'sign'; file: string; hash: string; anchor: string; text: string; at: string; by: string }
  | { type: 'ignore'; file: string; hash: string; anchor: string; text: string; at: string; by: string }
  | {
      type: 'comment'; file: string; hash: string; anchor: string; text: string; at: string; by: string;
      comment: string; suggestion?: string; resolved?: boolean;
    };

export interface Ledger { version: 1; entries: LedgerEntry[] }

export type ItemStatus = 'unsigned' | 'signed' | 'changed' | 'ignored';

export interface StatusedItem extends CopyItem {
  status: ItemStatus;
  needsEdit: boolean;
  signedText?: string;
  comments: Extract<LedgerEntry, { type: 'comment' }>[];
}
