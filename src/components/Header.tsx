import React, { useState } from 'react';
import { FolderOpen, Cpu, CheckCircle2, BookMarked, Plus, Loader2, Trash2, HardDrive } from 'lucide-react';
import { VaultStats } from '../services/vault/types';
import { ModelEngineType, SUPPORTED_MODELS, InitProgressEvent } from '../services/ai/aiTypes';

interface HeaderProps {
  stats: VaultStats;
  engine: ModelEngineType;
  modelId: string;
  loadingProgress?: InitProgressEvent | null;
  onMountVault: () => void;
  onSelectEngine: (newEngine: ModelEngineType, modelId?: string) => void;
  onSelectWiki: (wikiName: string) => void;
  onCreateWiki: (wikiName: string) => void;
  onDeleteWiki?: (wikiName: string) => void;
  activeTab: 'query' | 'ingest' | 'notes';
  setActiveTab: (tab: 'query' | 'ingest' | 'notes') => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  engine,
  modelId,
  loadingProgress,
  onMountVault,
  onSelectEngine,
  onSelectWiki,
  onCreateWiki,
  onDeleteWiki,
  activeTab,
  setActiveTab,
}) => {
  const [isCreatingWiki, setIsCreatingWiki] = useState(false);
  const [newWikiName, setNewWikiName] = useState('');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWikiName.trim()) {
      onCreateWiki(newWikiName.trim());
      setNewWikiName('');
      setIsCreatingWiki(false);
    }
  };

  const handleEngineChange = (val: string) => {
    if (val === 'mock-dev') {
      onSelectEngine('mock-dev');
    } else {
      const match = SUPPORTED_MODELS.find((m) => m.id === val);
      if (match) {
        onSelectEngine(match.engine, match.id);
      }
    }
  };

  const currentSelectValue = engine === 'mock-dev' ? 'mock-dev' : modelId;
  const activeModel = SUPPORTED_MODELS.find((m) => m.id === modelId);

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Active Wiki Indicator */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-950/50">
            <span className="text-xl">🧠</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-white tracking-tight">SLM Wiki</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                {engine === 'mock-dev'
                  ? 'Simulated Dev SLM'
                  : activeModel
                  ? activeModel.shortName + ' (WebGPU)'
                  : 'WebGPU SLM'}
              </span>
            </div>
            
            {/* Active Wiki Selector */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <BookMarked className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-slate-400">Wiki:</span>
              
              {isCreatingWiki ? (
                <form onSubmit={handleCreateSubmit} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newWikiName}
                    onChange={(e) => setNewWikiName(e.target.value)}
                    placeholder="New wiki name..."
                    autoFocus
                    className="bg-slate-950 text-xs text-white border border-indigo-500 rounded px-1.5 py-0.5 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] px-2 py-0.5 rounded font-medium"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingWiki(false)}
                    className="text-slate-400 hover:text-white text-[11px] px-1"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5">
                  <select
                    value={stats.currentWiki}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCreatingWiki(true);
                      } else {
                        onSelectWiki(e.target.value);
                      }
                    }}
                    className="bg-slate-950 text-indigo-300 font-medium text-xs rounded border border-indigo-900/60 px-2 py-0.5 focus:outline-none cursor-pointer"
                  >
                    {stats.availableWikis.map((w) => (
                      <option key={w} value={w} className="bg-slate-900 text-slate-200">
                        {w}
                      </option>
                    ))}
                    <option value="__NEW__" className="bg-slate-900 text-amber-300 font-medium">
                      + Create New Wiki...
                    </option>
                  </select>

                  <button
                    onClick={() => setIsCreatingWiki(true)}
                    title="Create new wiki"
                    className="text-indigo-400 hover:text-indigo-300 p-0.5 hover:bg-slate-800 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  {stats.currentWiki !== 'Default' && onDeleteWiki && (
                    <button
                      onClick={() => onDeleteWiki(stats.currentWiki)}
                      title={`Delete wiki "${stats.currentWiki}"`}
                      className="text-slate-500 hover:text-rose-400 p-0.5 hover:bg-slate-800 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800 self-center">
          <button
            onClick={() => setActiveTab('query')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'query'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Query & Synthesize
          </button>
          <button
            onClick={() => setActiveTab('ingest')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'ingest'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ingest & Map-Reduce
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'notes'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Vault Explorer ({stats.pagesCount})
          </button>
        </nav>

        {/* Vault & SLM Engine Controls */}
        <div className="flex items-center gap-2.5">
          {/* Engine Selector */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={currentSelectValue}
              onChange={(e) => handleEngineChange(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer max-w-[230px] truncate"
            >
              <optgroup label="WebGPU In-Browser Models">
                {SUPPORTED_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                    {m.name} ({m.downloadSizeApprox})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Simulated Dev Engine">
                <option value="mock-dev" className="bg-slate-900 text-slate-200">
                  Simulated Dev SLM (Instant / Heuristic)
                </option>
              </optgroup>
            </select>
          </div>

          {/* Mount Vault Folder Button & Storage Indicator */}
          <div className="flex items-center gap-2">
            {!stats.isMounted && (
              <span
                className="hidden lg:flex items-center gap-1.5 text-[11px] text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 px-2.5 py-1 rounded-lg"
                title="Your wikis and notes are saved automatically in browser IndexedDB (persists across tab closes)"
              >
                <HardDrive className="w-3 h-3 text-cyan-400" />
                <span>IndexedDB (Persistent)</span>
              </span>
            )}

            <button
              onClick={onMountVault}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                stats.isMounted
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/80 hover:bg-emerald-950/70'
                  : 'bg-indigo-950/40 text-indigo-200 border-indigo-700/60 hover:bg-indigo-900/60'
              }`}
              title={
                stats.isMounted
                  ? `Mounted: ${stats.vaultName} (writing directly to disk on Mac)`
                  : 'Stored in persistent IndexedDB. Click to mount an Obsidian vault or folder from your Mac.'
              }
            >
              {stats.isMounted ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[120px] font-mono">{stats.vaultName}</span>
                </>
              ) : (
                <>
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Mount Local Folder</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Model Download & Compilation Progress Banner */}
      {loadingProgress && loadingProgress.stage !== 'ready' && (
        <div className="bg-indigo-950/90 border-t border-indigo-800/60 px-6 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-indigo-200">
          <div className="flex items-center gap-2.5 truncate">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
            <span className="truncate">{loadingProgress.detail}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-36 bg-slate-900 rounded-full h-2 overflow-hidden border border-indigo-700/50">
              <div
                className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full transition-all duration-300"
                style={{ width: `${loadingProgress.progress}%` }}
              />
            </div>
            <span className="font-mono text-xs text-cyan-300 font-semibold">{loadingProgress.progress}%</span>
          </div>
        </div>
      )}
    </header>
  );
};
