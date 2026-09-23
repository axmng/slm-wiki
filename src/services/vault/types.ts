export interface WikiIndexEntry {
  topic: string;
  filename: string;
  summary: string;
  lastUpdated: string;
  backlinksCount?: number;
}

export interface WikiIndex {
  entries: WikiIndexEntry[];
  lastRegenerated: string;
}

export interface WikiPage {
  title: string;
  filename: string;
  content: string;
  lastModified?: number;
  outgoingLinks: string[];
}

export interface WikiRawEntry {
  filename: string;
  title: string;
  timestamp: string;
  preview: string;
}

export interface VaultStats {
  pagesCount: number;
  rawCount: number;
  lastLogEntry?: string;
  isMounted: boolean;
  vaultName: string;
  currentWiki: string;
  availableWikis: string[];
}
