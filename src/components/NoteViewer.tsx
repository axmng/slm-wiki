import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Edit3,
  Eye,
  Save,
  Check,
  Link2,
  Folder,
  FileCode,
  Archive,
  AlertCircle,
} from 'lucide-react';
import { vault } from '../services/vault/vaultService';
import { WikiPage } from '../services/vault/types';
import { marked } from 'marked';

interface NoteViewerProps {
  initialPage?: string;
  currentWiki?: string;
  onPageSelect?: (pageName: string) => void;
}

export const NoteViewer: React.FC<NoteViewerProps> = ({ initialPage, currentWiki, onPageSelect }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [rawFiles, setRawFiles] = useState<{ filename: string; title: string }[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>(initialPage || 'INDEX');
  const [filterQuery, setFilterQuery] = useState('');
  
  const [currentPage, setCurrentPage] = useState<WikiPage | null>(null);
  const [isCurrentPageStub, setIsCurrentPageStub] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check if a wikilink target exists as a real page in the vault
  const isPageExisting = (pageTitle: string): boolean => {
    const clean = pageTitle.split('|')[0].trim().toLowerCase();
    if (clean === 'index' || clean === 'log') return true;
    if (clean.startsWith('raw/')) return true;
    return pages.some((p) => p.toLowerCase() === clean);
  };

  // Load list of pages and raw files
  const refreshList = async () => {
    const p = await vault.listPages();
    setPages(p);
    const r = await vault.listRawFiles();
    setRawFiles(r.map((x) => ({ filename: x.filename, title: x.title })));
  };

  useEffect(() => {
    refreshList();
    setSelectedTopic('INDEX');
  }, [currentWiki]);

  useEffect(() => {
    if (initialPage) {
      setSelectedTopic(initialPage);
    }
  }, [initialPage]);

  // Load content whenever selected topic changes
  useEffect(() => {
    const loadContent = async () => {
      setIsLoading(true);
      setIsEditing(false);

      if (selectedTopic === 'INDEX') {
        setIsCurrentPageStub(false);
        const index = await vault.readIndex();
        const md = vault.serializeIndexMarkdown(index);
        setCurrentPage({
          title: 'INDEX',
          filename: 'INDEX.md',
          content: md,
          outgoingLinks: vault.extractWikilinks(md),
        });
        setEditContent(md);
      } else if (selectedTopic === 'LOG') {
        setIsCurrentPageStub(false);
        const log = await vault.readLog();
        setCurrentPage({
          title: 'LOG',
          filename: 'LOG.md',
          content: log,
          outgoingLinks: vault.extractWikilinks(log),
        });
        setEditContent(log);
      } else if (selectedTopic.startsWith('raw/')) {
        setIsCurrentPageStub(false);
        const rawFilename = selectedTopic.replace('raw/', '');
        const content = await vault.readRaw(rawFilename);
        setCurrentPage({
          title: rawFilename,
          filename: `raw/${rawFilename}`,
          content: content || '# Not Found',
          outgoingLinks: [],
        });
        setEditContent(content || '');
      } else {
        const page = await vault.readPage(selectedTopic);
        if (page) {
          setIsCurrentPageStub(false);
          setCurrentPage(page);
          setEditContent(page.content);
        } else {
          // If page not found yet, create default stub
          setIsCurrentPageStub(true);
          setCurrentPage({
            title: selectedTopic,
            filename: `${selectedTopic}.md`,
            content: `# ${selectedTopic}\n\n*This note has not been ingested or written yet.*`,
            outgoingLinks: [],
          });
          setEditContent(`# ${selectedTopic}\n\n*This note has not been ingested or written yet.*`);
        }
      }
      setIsLoading(false);
    };

    loadContent();
  }, [selectedTopic, pages]);

  const handleSave = async () => {
    if (!currentPage) return;

    if (selectedTopic === 'INDEX') {
      const parsed = vault.parseIndexMarkdown(editContent);
      await vault.saveIndex(parsed);
    } else if (selectedTopic === 'LOG') {
      // Direct raw write not encouraged for log, but allowed
    } else if (selectedTopic.startsWith('raw/')) {
      // Raw files are immutable archives
    } else {
      await vault.savePage(selectedTopic, editContent);
      await vault.appendToLog('MANUAL_EDIT', `User edited note [[${selectedTopic}]].`);
    }

    setIsCurrentPageStub(false);
    setCurrentPage({
      ...currentPage,
      content: editContent,
      outgoingLinks: vault.extractWikilinks(editContent),
    });

    setIsEditing(false);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
    refreshList();
  };

  const handleNavigate = (topicName: string) => {
    setSelectedTopic(topicName);
    onPageSelect?.(topicName);
  };

  const renderMarkdown = (text: string) => {
    const preprocessed = text.replace(/\[\[(.*?)\]\]/g, (_fullMatch, inner) => {
      const parts = inner.split('|');
      const target = parts[0].trim();
      const exists = isPageExisting(target);

      if (exists) {
        return `<a href="#" data-wikilink="${inner}" class="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 cursor-pointer">[[$1]]</a>`;
      } else {
        return `<a href="#" data-wikilink="${inner}" title="Uncreated note stub: [[${target}]] (click to open)" class="text-slate-400 hover:text-amber-300 border-b border-dashed border-slate-500 hover:border-amber-400 cursor-pointer opacity-80">[[$1]] <span class="text-[9px] text-amber-500/90 no-underline font-mono">?</span></a>`;
      }
    });
    return { __html: marked.parse(preprocessed) as string };
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('[data-wikilink]')?.getAttribute('data-wikilink');
    if (link) {
      e.preventDefault();
      handleNavigate(link.split('|')[0].trim());
    }
  };

  const filteredPages = pages.filter((p) =>
    p.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 py-4">
      {/* Sidebar: Navigation tree */}
      <div className="md:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl h-[calc(100vh-140px)] flex flex-col">
        {/* Search Input */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter vault notes..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Scrollable tree list */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Core Wiki Files */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1 flex items-center gap-1.5">
              <Folder className="w-3 h-3 text-slate-400" /> Root Vault Files
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => handleNavigate('INDEX')}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                  selectedTopic === 'INDEX'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span>INDEX.md</span>
                </div>
                <span className="text-[10px] opacity-70">Table of Contents</span>
              </button>

              <button
                onClick={() => handleNavigate('LOG')}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                  selectedTopic === 'LOG'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>LOG.md</span>
                </div>
                <span className="text-[10px] opacity-70">Changelog</span>
              </button>
            </div>
          </div>

          {/* Concept Pages */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Folder className="w-3 h-3 text-indigo-400" /> pages/ ({filteredPages.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {filteredPages.map((pageName) => (
                <button
                  key={pageName}
                  onClick={() => handleNavigate(pageName)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    selectedTopic === pageName
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{pageName}</span>
                  </div>
                </button>
              ))}
              {filteredPages.length === 0 && (
                <div className="text-xs text-slate-500 px-2 py-1">No matching notes</div>
              )}
            </div>
          </div>

          {/* Raw Archives */}
          {rawFiles.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1 flex items-center gap-1.5">
                <Archive className="w-3 h-3 text-amber-400" /> raw/ ({rawFiles.length})
              </div>
              <div className="space-y-0.5">
                {rawFiles.map((rf) => (
                  <button
                    key={rf.filename}
                    onClick={() => handleNavigate(`raw/${rf.filename}`)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      selectedTopic === `raw/${rf.filename}`
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Archive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{rf.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main View: Markdown Reader / Editor */}
      <div className="md:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl h-[calc(100vh-140px)] flex flex-col overflow-hidden">
        {/* Top Header of Editor */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              {currentPage ? currentPage.filename : 'Loading note...'}
            </h2>
            {isSavedNotice && (
              <span className="text-xs text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" /> Saved to Vault
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!selectedTopic.startsWith('raw/') && (
              <>
                {isEditing ? (
                  <>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Markdown
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Outgoing Wikilinks Bar */}
        {currentPage && currentPage.outgoingLinks.length > 0 && !isEditing && (
          <div className="px-6 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-slate-500 flex items-center gap-1 shrink-0">
              <Link2 className="w-3.5 h-3.5 text-indigo-400" /> Links ({currentPage.outgoingLinks.length}):
            </span>
            {currentPage.outgoingLinks.map((link, idx) => {
              const exists = isPageExisting(link);
              return exists ? (
                <button
                  key={idx}
                  onClick={() => handleNavigate(link)}
                  className="shrink-0 text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/80 px-2 py-0.5 rounded text-[11px] font-mono transition-colors"
                >
                  [[{link}]]
                </button>
              ) : (
                <button
                  key={idx}
                  onClick={() => handleNavigate(link)}
                  className="shrink-0 text-slate-400 bg-slate-900/60 hover:bg-slate-800 border border-dashed border-slate-700 px-2 py-0.5 rounded text-[11px] font-mono transition-colors flex items-center gap-1 opacity-80 hover:opacity-100"
                  title="Uncreated note stub (click to create)"
                >
                  [[{link}]] <span className="text-[9px] text-amber-500 font-sans font-semibold">uncreated</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Loading note from vault...
            </div>
          ) : isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
            />
          ) : (
            <div>
              {isCurrentPageStub && (
                <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 mb-5 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-amber-300 text-xs font-bold uppercase tracking-wider">Uncreated Note Stub</div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      This note was referenced as a link in your vault, but has not been ingested or written yet.
                      You can ingest reference documents mentioning <strong>{selectedTopic}</strong> to populate it, or click <strong>Edit Markdown</strong> to write notes manually.
                    </p>
                  </div>
                </div>
              )}
              <div
                onClick={handleContentClick}
                className="prose prose-invert max-w-none text-slate-200 text-sm leading-relaxed"
                dangerouslySetInnerHTML={renderMarkdown(currentPage?.content || '')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
