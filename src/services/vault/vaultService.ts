import { WikiIndex, WikiIndexEntry, WikiPage, WikiRawEntry, VaultStats } from './types';
import { areTopicsEquivalent, getCanonicalRoot } from '../utils/textNormalization';

// Browser File System Access API types
interface FileSystemDirectoryHandle {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterable<FileSystemHandle>;
}

interface FileSystemFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemHandle {
  name: string;
  kind: 'file' | 'directory';
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

export class VaultService {
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private wikisDirHandle: FileSystemDirectoryHandle | null = null;
  private currentWikiHandle: FileSystemDirectoryHandle | null = null;
  private pagesDirHandle: FileSystemDirectoryHandle | null = null;
  private rawDirHandle: FileSystemDirectoryHandle | null = null;
  private isVirtual = false;
  
  private currentWiki = 'Default';
  private availableWikis: string[] = ['Default'];

  // In-memory fallback if showDirectoryPicker is cancelled or unsupported
  private virtualStorage = new Map<string, string>();
  private vaultName = 'Default Memory Vault';

  constructor() {
    this.initVirtualStarter();
  }

  private initVirtualStarter() {
    const prefix = 'wikis/Default/';
    this.virtualStorage.set(
      `${prefix}INDEX.md`,
      `# Local Wiki Index\n\n| Topic | Summary | File | Updated |\n| :--- | :--- | :--- | :--- |\n| [[Quantum Computing]] | Fundamentals of qubits, superposition, and entanglement | Quantum Computing.md | 2026-09-23 |\n| [[Neural Networks]] | Architecture of multilayer perceptrons and gradient descent | Neural Networks.md | 2026-09-23 |\n`
    );
    this.virtualStorage.set(
      `${prefix}LOG.md`,
      `# Vault Activity Log\n\n- **2026-09-23 09:00:00**: [INIT] Default Wiki initialized with starter concepts.\n`
    );
    this.virtualStorage.set(
      `${prefix}pages/Quantum Computing.md`,
      `# Quantum Computing\n\nQuantum computing is a rapidly-emerging technology that harnesses the laws of quantum mechanics to solve problems too complex for classical computers.\n\n## Core Principles\n- **Superposition**: Unlike classical bits that are either 0 or 1, qubits can exist in linear combinations of both.\n- **Entanglement**: Two or more particles can become correlated in ways that measurement of one dictates the state of the other.\n\n## Applications\n- Cryptography and Shor's algorithm\n- Molecular simulation\n- Optimization algorithms for [[Neural Networks]]\n`
    );
    this.virtualStorage.set(
      `${prefix}pages/Neural Networks.md`,
      `# Neural Networks\n\nNeural networks are computing systems inspired by the biological neural networks that constitute animal brains.\n\n## Components\n- Input, hidden, and output layers\n- Activation functions (ReLU, GELU, Sigmoid)\n- Backpropagation via automatic differentiation\n\n## Connections\n- Accelerated algorithms explored in [[Quantum Computing]]\n`
    );
    this.virtualStorage.set(
      `${prefix}raw/2026-09-23-initial-seed.md`,
      `# Initial Knowledge Seed\n\nStarter text covering quantum information science and deep learning foundations.\n`
    );
  }

  public isUsingFileSystemAPI(): boolean {
    return this.rootHandle !== null && !this.isVirtual;
  }

  public getVaultName(): string {
    return this.rootHandle ? this.rootHandle.name : this.vaultName;
  }

  public getActiveWiki(): string {
    return this.currentWiki;
  }

  public async listWikis(): Promise<string[]> {
    if (!this.rootHandle || this.isVirtual) {
      const set = new Set<string>();
      for (const key of this.virtualStorage.keys()) {
        if (key.startsWith('wikis/')) {
          const parts = key.split('/');
          if (parts[1]) set.add(parts[1]);
        }
      }
      this.availableWikis = Array.from(set).sort();
      return this.availableWikis.length > 0 ? this.availableWikis : ['Default'];
    }

    try {
      if (!this.wikisDirHandle) {
        this.wikisDirHandle = await this.rootHandle.getDirectoryHandle('wikis', { create: true });
      }
      const list: string[] = [];
      for await (const entry of this.wikisDirHandle.values()) {
        if (entry.kind === 'directory') {
          list.push(entry.name);
        }
      }
      if (list.length === 0) {
        list.push('Default');
      }
      this.availableWikis = list.sort();
      return this.availableWikis;
    } catch {
      return ['Default'];
    }
  }

  /**
   * Create a new Wiki container
   */
  public async createWiki(wikiName: string): Promise<void> {
    const cleanName = wikiName.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
    if (!cleanName) throw new Error('Invalid wiki name');

    if (!this.rootHandle || this.isVirtual) {
      if (!this.availableWikis.includes(cleanName)) {
        this.availableWikis.push(cleanName);
        this.availableWikis.sort();
      }
      const prefix = `wikis/${cleanName}/`;
      this.virtualStorage.set(
        `${prefix}INDEX.md`,
        `# ${cleanName} Wiki Index\n\n| Topic | Summary | File | Updated |\n| :--- | :--- | :--- | :--- |\n`
      );
      this.virtualStorage.set(
        `${prefix}LOG.md`,
        `# ${cleanName} Activity Log\n\n- **${new Date().toISOString().replace('T', ' ').slice(0, 19)}**: [INIT] Wiki "${cleanName}" created.\n`
      );
      await this.setActiveWiki(cleanName);
      return;
    }

    if (!this.wikisDirHandle) {
      this.wikisDirHandle = await this.rootHandle.getDirectoryHandle('wikis', { create: true });
    }

    const wikiHandle = await this.wikisDirHandle.getDirectoryHandle(cleanName, { create: true });
    await wikiHandle.getDirectoryHandle('pages', { create: true });
    await wikiHandle.getDirectoryHandle('raw', { create: true });

    // Initialize INDEX.md and LOG.md
    const indexFile = await wikiHandle.getFileHandle('INDEX.md', { create: true });
    const iw = await indexFile.createWritable();
    await iw.write(`# ${cleanName} Wiki Index\n\n| Topic | Summary | File | Updated |\n| :--- | :--- | :--- | :--- |\n`);
    await iw.close();

    const logFile = await wikiHandle.getFileHandle('LOG.md', { create: true });
    const lw = await logFile.createWritable();
    await lw.write(`# ${cleanName} Activity Log\n\n- **${new Date().toISOString().replace('T', ' ').slice(0, 19)}**: [INIT] Wiki "${cleanName}" created.\n`);
    await lw.close();

    await this.listWikis();
    await this.setActiveWiki(cleanName);
  }

  /**
   * Switch the active Wiki
   */
  public async setActiveWiki(wikiName: string): Promise<void> {
    this.currentWiki = wikiName;

    if (!this.rootHandle || this.isVirtual) {
      return;
    }

    if (!this.wikisDirHandle) {
      this.wikisDirHandle = await this.rootHandle.getDirectoryHandle('wikis', { create: true });
    }

    this.currentWikiHandle = await this.wikisDirHandle.getDirectoryHandle(wikiName, { create: true });
    this.pagesDirHandle = await this.currentWikiHandle.getDirectoryHandle('pages', { create: true });
    this.rawDirHandle = await this.currentWikiHandle.getDirectoryHandle('raw', { create: true });

    await this.ensureFile(
      this.currentWikiHandle,
      'INDEX.md',
      `# ${wikiName} Wiki Index\n\n| Topic | Summary | File | Updated |\n| :--- | :--- | :--- | :--- |\n`
    );
    await this.ensureFile(
      this.currentWikiHandle,
      'LOG.md',
      `# ${wikiName} Activity Log\n\n- **${new Date().toISOString().replace('T', ' ').slice(0, 19)}**: [ACTIVE] Wiki switched to "${wikiName}".\n`
    );
  }

  /**
   * Prompt user to pick a local folder using File System Access API
   */
  public async mountDirectory(): Promise<VaultStats> {
    if (!window.showDirectoryPicker) {
      console.warn('File System Access API not supported in this browser. Using virtual in-memory vault.');
      this.isVirtual = true;
      return this.getStats();
    }

    try {
      this.rootHandle = await window.showDirectoryPicker();
      this.isVirtual = false;
      this.vaultName = this.rootHandle.name;

      // Ensure 'wikis' container directory exists
      this.wikisDirHandle = await this.rootHandle.getDirectoryHandle('wikis', { create: true });

      const wikis = await this.listWikis();
      const targetWiki = wikis[0] || 'Default';
      await this.setActiveWiki(targetWiki);

      return await this.getStats();
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        console.log('User cancelled folder selection');
      } else {
        console.error('Error mounting folder:', error);
      }
      return this.getStats();
    }
  }

  private async ensureFile(
    dirHandle: FileSystemDirectoryHandle,
    name: string,
    defaultContent: string
  ): Promise<void> {
    try {
      await dirHandle.getFileHandle(name, { create: false });
    } catch {
      const fileHandle = await dirHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(defaultContent);
      await writable.close();
    }
  }

  public async getStats(): Promise<VaultStats> {
    await this.deduplicateWikiPages();
    const pages = await this.listPages();
    const raw = await this.listRawFiles();
    const log = await this.readLog();
    const lastLogLine = log.trim().split('\n').filter((l) => l.startsWith('-')).pop();
    const wikis = await this.listWikis();

    return {
      pagesCount: pages.length,
      rawCount: raw.length,
      lastLogEntry: lastLogLine,
      isMounted: this.isUsingFileSystemAPI(),
      vaultName: this.getVaultName(),
      currentWiki: this.currentWiki,
      availableWikis: wikis,
    };
  }

  public sanitizeFilename(topic: string): string {
    const clean = topic.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
    return clean.endsWith('.md') ? clean : `${clean}.md`;
  }

  public extractWikilinks(content: string): string[] {
    const matches = content.matchAll(/\[\[(.*?)\]\]/g);
    const links = new Set<string>();
    for (const match of matches) {
      if (match[1]) {
        const link = match[1].split('|')[0].trim();
        if (link) links.add(link);
      }
    }
    return Array.from(links);
  }

  private getVirtualPrefix(): string {
    return `wikis/${this.currentWiki}/`;
  }

  /* ------------------- PAGE OPERATIONS ------------------- */

  public async listPages(): Promise<string[]> {
    if (!this.rootHandle || this.isVirtual) {
      const results: string[] = [];
      const prefix = `${this.getVirtualPrefix()}pages/`;
      for (const key of this.virtualStorage.keys()) {
        if (key.startsWith(prefix) && key.endsWith('.md')) {
          results.push(key.replace(prefix, '').replace('.md', ''));
        }
      }
      return results.sort();
    }

    const pages: string[] = [];
    if (!this.pagesDirHandle) return pages;

    for await (const entry of this.pagesDirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        pages.push(entry.name.replace('.md', ''));
      }
    }
    return pages.sort();
  }

  /**
   * Check if a page or its singular/plural variant already exists
   */
  public async findExistingPageName(topic: string): Promise<string | null> {
    const pages = await this.listPages();
    const cleanTopic = topic.trim();

    // 1. Exact case-insensitive match
    for (const page of pages) {
      if (page.toLowerCase() === cleanTopic.toLowerCase()) {
        return page;
      }
    }

    // 2. Canonical / inflectional equivalence (e.g. 'Antibiotic' matches 'Antibiotics')
    for (const page of pages) {
      if (areTopicsEquivalent(page, cleanTopic)) {
        return page;
      }
    }

    return null;
  }

  public async readPage(topic: string): Promise<WikiPage | null> {
    const matched = await this.findExistingPageName(topic);
    const resolvedTopic = matched || topic;
    const filename = this.sanitizeFilename(resolvedTopic);
    const title = filename.replace('.md', '');

    if (!this.rootHandle || this.isVirtual) {
      const content = this.virtualStorage.get(`${this.getVirtualPrefix()}pages/${filename}`);
      if (!content) return null;
      return {
        title,
        filename,
        content,
        outgoingLinks: this.extractWikilinks(content),
      };
    }

    try {
      if (!this.pagesDirHandle) return null;
      const fileHandle = await this.pagesDirHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return {
        title,
        filename,
        content,
        lastModified: file.lastModified,
        outgoingLinks: this.extractWikilinks(content),
      };
    } catch {
      return null;
    }
  }

  public async savePage(topic: string, content: string): Promise<WikiPage> {
    const matched = await this.findExistingPageName(topic);
    const resolvedTopic = matched || topic;
    const filename = this.sanitizeFilename(resolvedTopic);
    const title = filename.replace('.md', '');

    if (!this.rootHandle || this.isVirtual) {
      this.virtualStorage.set(`${this.getVirtualPrefix()}pages/${filename}`, content);
      return {
        title,
        filename,
        content,
        outgoingLinks: this.extractWikilinks(content),
      };
    }

    if (!this.pagesDirHandle) {
      throw new Error('Pages directory not available');
    }

    const fileHandle = await this.pagesDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    return {
      title,
      filename,
      content,
      lastModified: Date.now(),
      outgoingLinks: this.extractWikilinks(content),
    };
  }

  public async deletePage(topic: string): Promise<void> {
    const filename = this.sanitizeFilename(topic);
    if (!this.rootHandle || this.isVirtual) {
      this.virtualStorage.delete(`${this.getVirtualPrefix()}pages/${filename}`);
      return;
    }

    if (this.pagesDirHandle && this.pagesDirHandle.removeEntry) {
      try {
        await this.pagesDirHandle.removeEntry(filename);
      } catch (err) {
        console.warn(`Could not delete page ${filename}:`, err);
      }
    }
  }

  /**
   * Scan and automatically merge singular/plural duplicates (e.g. Antibiotic and Antibiotics)
   */
  public async deduplicateWikiPages(): Promise<{ merged: string[]; removed: string[] }> {
    const pages = await this.listPages();
    const groups = new Map<string, string[]>();

    for (const p of pages) {
      const root = getCanonicalRoot(p);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(p);
    }

    const merged: string[] = [];
    const removed: string[] = [];

    for (const [, group] of groups) {
      if (group.length <= 1) continue;

      // Prefer the plural or longer title as canonical (e.g. 'Antibiotics' over 'Antibiotic')
      group.sort((a, b) => b.length - a.length || (b.endsWith('s') ? 1 : -1));
      const canonical = group[0];
      const duplicates = group.slice(1);

      const canonicalPage = await this.readPage(canonical);
      let content = canonicalPage ? canonicalPage.content : `# ${canonical}\n\n`;

      for (const dup of duplicates) {
        const dupPage = await this.readPage(dup);
        if (dupPage) {
          const dupLines = dupPage.content.split('\n').filter((l) => l.startsWith('-') || l.startsWith('*'));
          for (const line of dupLines) {
            if (!content.includes(line)) {
              content += `\n${line}`;
            }
          }
          await this.deletePage(dup);
          removed.push(dup);
        }
      }

      await this.savePage(canonical, content);
      merged.push(canonical);

      // Clean INDEX.md
      const index = await this.readIndex();
      index.entries = index.entries.filter(
        (e) => !duplicates.some((d) => d.toLowerCase() === e.topic.toLowerCase())
      );
      await this.saveIndex(index);

      await this.appendToLog(
        'DEDUPLICATE',
        `Merged duplicate note(s) [${duplicates.map((d) => `[[${d}]]`).join(', ')}] into [[${canonical}]].`
      );
    }

    return { merged, removed };
  }

  /* ------------------- RAW OPERATIONS ------------------- */

  public async saveRaw(title: string, rawText: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filename = `${timestamp}-${cleanTitle || 'clip'}.md`;

    const markdown = `# ${title}\n*Archived: ${new Date().toISOString()} in Wiki "${this.currentWiki}"*\n\n---\n\n${rawText}\n`;

    if (!this.rootHandle || this.isVirtual) {
      this.virtualStorage.set(`${this.getVirtualPrefix()}raw/${filename}`, markdown);
      return filename;
    }

    if (!this.rawDirHandle) throw new Error('Raw directory handle missing');
    const fileHandle = await this.rawDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(markdown);
    await writable.close();

    return filename;
  }

  public async listRawFiles(): Promise<WikiRawEntry[]> {
    if (!this.rootHandle || this.isVirtual) {
      const results: WikiRawEntry[] = [];
      const prefix = `${this.getVirtualPrefix()}raw/`;
      for (const [key, content] of this.virtualStorage.entries()) {
        if (key.startsWith(prefix)) {
          const filename = key.replace(prefix, '');
          const lines = content.split('\n');
          const title = lines[0]?.replace(/^#\s*/, '') || filename;
          results.push({
            filename,
            title,
            timestamp: filename.slice(0, 10),
            preview: content.slice(0, 150),
          });
        }
      }
      return results.reverse();
    }

    const results: WikiRawEntry[] = [];
    if (!this.rawDirHandle) return results;

    for await (const entry of this.rawDirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const fileHandle = await this.rawDirHandle.getFileHandle(entry.name);
        const file = await fileHandle.getFile();
        const content = await file.text();
        const lines = content.split('\n');
        const title = lines[0]?.replace(/^#\s*/, '') || entry.name;
        results.push({
          filename: entry.name,
          title,
          timestamp: entry.name.slice(0, 10),
          preview: content.slice(0, 150),
        });
      }
    }
    return results.sort((a, b) => b.filename.localeCompare(a.filename));
  }

  public async readRaw(filename: string): Promise<string | null> {
    if (!this.rootHandle || this.isVirtual) {
      return this.virtualStorage.get(`${this.getVirtualPrefix()}raw/${filename}`) || null;
    }
    try {
      if (!this.rawDirHandle) return null;
      const fileHandle = await this.rawDirHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  /* ------------------- INDEX & LOG OPERATIONS ------------------- */

  public async readIndex(): Promise<WikiIndex> {
    let content = '';
    if (!this.rootHandle || this.isVirtual) {
      content = this.virtualStorage.get(`${this.getVirtualPrefix()}INDEX.md`) || '';
    } else {
      try {
        if (!this.currentWikiHandle) return { entries: [], lastRegenerated: new Date().toISOString() };
        const handle = await this.currentWikiHandle.getFileHandle('INDEX.md');
        const file = await handle.getFile();
        content = await file.text();
      } catch {
        content = '';
      }
    }

    return this.parseIndexMarkdown(content);
  }

  public parseIndexMarkdown(content: string): WikiIndex {
    const entries: WikiIndexEntry[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length < 3) continue;
      if (cells[0].toLowerCase().includes('topic') || cells[0].startsWith(':-')) continue;

      const rawTopic = cells[0];
      const topic = rawTopic.replace(/\[\[|\]\]/g, '').trim();
      const summary = cells[1] || '';
      const filename = cells[2] || this.sanitizeFilename(topic);
      const lastUpdated = cells[3] || new Date().toISOString().slice(0, 10);

      entries.push({
        topic,
        summary,
        filename,
        lastUpdated,
      });
    }

    return {
      entries,
      lastRegenerated: new Date().toISOString(),
    };
  }

  public serializeIndexMarkdown(index: WikiIndex): string {
    let md = `# ${this.currentWiki} Wiki Index\n\n`;
    md += `*Total Topics: ${index.entries.length} | Last Updated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}*\n\n`;
    md += `| Topic | Summary | File | Updated |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;

    for (const e of index.entries) {
      const topicCell = `[[${e.topic}]]`;
      const cleanSummary = e.summary.replace(/\|/g, '-').replace(/\n/g, ' ');
      md += `| ${topicCell} | ${cleanSummary} | ${e.filename} | ${e.lastUpdated} |\n`;
    }

    return md;
  }

  public async saveIndex(index: WikiIndex): Promise<void> {
    const md = this.serializeIndexMarkdown(index);
    if (!this.rootHandle || this.isVirtual) {
      this.virtualStorage.set(`${this.getVirtualPrefix()}INDEX.md`, md);
      return;
    }

    if (!this.currentWikiHandle) return;
    const fileHandle = await this.currentWikiHandle.getFileHandle('INDEX.md', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(md);
    await writable.close();
  }

  public async appendToLog(action: string, details: string): Promise<void> {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `- **${timestamp}**: [${action}] ${details}\n`;

    if (!this.rootHandle || this.isVirtual) {
      const key = `${this.getVirtualPrefix()}LOG.md`;
      const current = this.virtualStorage.get(key) || `# ${this.currentWiki} Activity Log\n\n`;
      this.virtualStorage.set(key, current + line);
      return;
    }

    if (!this.currentWikiHandle) return;
    try {
      const fileHandle = await this.currentWikiHandle.getFileHandle('LOG.md', { create: true });
      const file = await fileHandle.getFile();
      const current = await file.text();
      const writable = await fileHandle.createWritable();
      await writable.write(current + line);
      await writable.close();
    } catch (err) {
      console.error('Failed to append to log:', err);
    }
  }

  public async readLog(): Promise<string> {
    if (!this.rootHandle || this.isVirtual) {
      return this.virtualStorage.get(`${this.getVirtualPrefix()}LOG.md`) || '';
    }
    if (!this.currentWikiHandle) return '';
    try {
      const fileHandle = await this.currentWikiHandle.getFileHandle('LOG.md');
      const file = await fileHandle.getFile();
      return await file.text();
    } catch {
      return '';
    }
  }
}

export const vault = new VaultService();
