import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { IngestPane } from './components/IngestPane';
import { QueryPane } from './components/QueryPane';
import { NoteViewer } from './components/NoteViewer';
import { vault } from './services/vault/vaultService';
import { aiService } from './services/ai/aiService';
import { VaultStats } from './services/vault/types';
import { ModelEngineType } from './services/ai/aiTypes';
import { Info, FolderCheck, Cpu, BookMarked } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'query' | 'ingest' | 'notes'>('query');
  const [targetPage, setTargetPage] = useState<string>('INDEX');
  const [stats, setStats] = useState<VaultStats>({
    pagesCount: 0,
    rawCount: 0,
    isMounted: false,
    vaultName: 'Default Vault',
    currentWiki: 'Default',
    availableWikis: ['Default'],
  });
  const [engine, setEngine] = useState<ModelEngineType>('mock-dev');
  const modelId = 'gemma-2b-it';

  const refreshStats = async () => {
    const s = await vault.getStats();
    setStats(s);
  };

  useEffect(() => {
    refreshStats();
    aiService.initModel({ engine: 'mock-dev' });
  }, []);

  const handleMountVault = async () => {
    const s = await vault.mountDirectory();
    setStats(s);
  };

  const handleToggleEngine = async (newEngine: ModelEngineType) => {
    setEngine(newEngine);
    try {
      await aiService.switchEngine(newEngine);
    } catch (err) {
      console.error('Error switching engine:', err);
    }
  };

  const handleSelectWiki = async (wikiName: string) => {
    await vault.setActiveWiki(wikiName);
    await refreshStats();
    setTargetPage('INDEX');
  };

  const handleCreateWiki = async (wikiName: string) => {
    await vault.createWiki(wikiName);
    await refreshStats();
    setTargetPage('INDEX');
  };

  const handleOpenPage = (pageName: string) => {
    setTargetPage(pageName);
    setActiveTab('notes');
  };

  const handleIngestSuccess = async (topics: string[]) => {
    await refreshStats();
    if (topics.length > 0) {
      setTargetPage(topics[0]);
    } else {
      setTargetPage('INDEX');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation & Controls Header */}
      <Header
        stats={stats}
        engine={engine}
        modelId={modelId}
        onMountVault={handleMountVault}
        onToggleEngine={handleToggleEngine}
        onSelectWiki={handleSelectWiki}
        onCreateWiki={handleCreateWiki}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 px-4 md:px-6">
        {activeTab === 'query' && (
          <QueryPane onOpenPage={handleOpenPage} />
        )}

        {activeTab === 'ingest' && (
          <IngestPane
            currentWiki={stats.currentWiki}
            availableWikis={stats.availableWikis}
            onIngestSuccess={handleIngestSuccess}
            onOpenPage={handleOpenPage}
          />
        )}

        {activeTab === 'notes' && (
          <NoteViewer
            initialPage={targetPage}
            currentWiki={stats.currentWiki}
            onPageSelect={(page) => setTargetPage(page)}
          />
        )}
      </main>

      {/* Bottom Status Bar */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-2.5 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-slate-400">
            <FolderCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Vault:</span>
            <strong className="text-slate-300 font-medium">{stats.vaultName}</strong>
          </span>
          <span className="flex items-center gap-1 text-indigo-300 font-medium bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-900/60">
            <BookMarked className="w-3 h-3 text-indigo-400" />
            <span>Wiki: {stats.currentWiki}</span>
            <span className="text-[10px] text-indigo-400 opacity-80">
              ({stats.pagesCount} notes, {stats.rawCount} archives)
            </span>
          </span>
          {stats.lastLogEntry && (
            <span className="hidden lg:inline text-slate-600 truncate max-w-md">
              {stats.lastLogEntry}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>SLM Worker:</span>
            <span className="text-slate-300 font-mono">
              {engine === 'mock-dev' ? 'Dev Mock Engine' : `LiteRT-LM WebGPU (${modelId})`}
            </span>
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:flex items-center gap-1 text-slate-500">
            <Info className="w-3 h-3" /> Compatible with Obsidian & VS Code
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
