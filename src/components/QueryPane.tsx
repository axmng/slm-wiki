import React, { useState } from 'react';
import { Search, Sparkles, BookOpen, FileText, ArrowRight, CornerDownLeft, Loader2, Layers } from 'lucide-react';
import { queryPipeline, QueryResult } from '../services/pipeline/queryPipeline';
import { marked } from 'marked';

interface QueryPaneProps {
  onOpenPage: (pageName: string) => void;
  engine?: string;
  modelName?: string;
  onSwitchToWebGPU?: () => void;
}

const SAMPLE_QUESTIONS = [
  'What are the core principles of quantum computing?',
  'How do neural networks connect to quantum algorithms?',
  'Explain self-attention and transformer bottlenecks.',
  'What is neuromorphic computing and spiking neural networks?',
];

export const QueryPane: React.FC<QueryPaneProps> = ({
  onOpenPage,
  engine = 'mock-dev',
  modelName = 'Gemma 4',
  onSwitchToWebGPU,
}) => {
  const [query, setQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [pass1Data, setPass1Data] = useState<{ files: string[]; reasoning: string } | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [finalResult, setFinalResult] = useState<QueryResult | null>(null);

  const handleRunQuery = async (userQuestion?: string) => {
    const q = userQuestion || query;
    if (!q.trim() || isQuerying) return;

    setQuery(q);
    setIsQuerying(true);
    setPass1Data(null);
    setStreamingAnswer('');
    setFinalResult(null);

    try {
      const result = await queryPipeline.executeQuery(
        q,
        (token) => {
          setStreamingAnswer((prev) => prev + token);
        },
        (selectedFiles, reasoning) => {
          setPass1Data({ files: selectedFiles, reasoning });
        }
      );
      setFinalResult(result);
    } catch (err) {
      console.error('Query execution error:', err);
    } finally {
      setIsQuerying(false);
    }
  };

  const renderMarkdown = (text: string) => {
    // Convert [[Wikilink]] syntax into clickable spans before parsing
    const preprocessed = text.replace(
      /\[\[(.*?)\]\]/g,
      `<a href="#" data-wikilink="$1" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 font-medium cursor-pointer">[[$1]]</a>`
    );
    return { __html: marked.parse(preprocessed) as string };
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('[data-wikilink]')?.getAttribute('data-wikilink');
    if (link) {
      e.preventDefault();
      onOpenPage(link.split('|')[0].trim());
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Search Bar & Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -left-12 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-cyan-400" />
            Hierarchical SLM Query & Synthesis
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Pass 1 scans <code className="text-cyan-300">INDEX.md</code> to select relevant files, then Pass 2 synthesizes grounded answers strictly from those notes.
          </p>
        </div>

        {/* Engine Transparency Pill */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800/80 rounded-xl px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                engine === 'mock-dev' ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span className="text-slate-400">Engine:</span>
            <span className="font-medium text-slate-200">
              {engine === 'mock-dev'
                ? 'Simulated Dev SLM (Heuristic)'
                : engine === 'gemma4-webgpu'
                ? 'WebGPU: Gemma 4 (Google)'
                : 'WebGPU: Bonsai 27B (Prism ML 1-Bit)'}
            </span>
          </div>

          {engine === 'mock-dev' && onSwitchToWebGPU && (
            <button
              onClick={onSwitchToWebGPU}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load In-Browser WebGPU SLM ({modelName})</span>
            </button>
          )}
        </div>

        {/* Query Input */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunQuery()}
            placeholder="Ask anything stored in your local wiki..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-24 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
            disabled={isQuerying}
          />
          <button
            onClick={() => handleRunQuery()}
            disabled={!query.trim() || isQuerying}
            className={`absolute right-2 top-2 bottom-2 px-4 rounded-lg font-medium text-xs flex items-center gap-1.5 transition-all ${
              !query.trim() || isQuerying
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30'
            }`}
          >
            {isQuerying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <span>Ask</span>
                <CornerDownLeft className="w-3 h-3 opacity-70" />
              </>
            )}
          </button>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" /> Suggestions:
          </span>
          {SAMPLE_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleRunQuery(q)}
              disabled={isQuerying}
              className="text-xs bg-slate-950/80 hover:bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-800 transition-colors truncate max-w-xs"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Query Reasoning & Streaming Output */}
      {(isQuerying || pass1Data || streamingAnswer || finalResult) && (
        <div className="space-y-4">
          {/* PASS 1: Index Routing Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Pass 1: Direct Index Scan & File Selection
                </h3>
              </div>
              {!pass1Data && isQuerying && (
                <span className="text-xs text-cyan-400 flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Scanning INDEX.md...
                </span>
              )}
            </div>

            {pass1Data ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 italic">
                  "{pass1Data.reasoning}"
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500">Selected Notes:</span>
                  {pass1Data.files.map((file, i) => (
                    <button
                      key={i}
                      onClick={() => onOpenPage(file.replace('.md', ''))}
                      className="group flex items-center gap-1.5 px-3 py-1 bg-cyan-950/60 border border-cyan-800/80 hover:border-cyan-600 rounded-lg text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-all cursor-pointer"
                    >
                      <FileText className="w-3 h-3 text-cyan-400" />
                      <span>{file}</span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-10 flex items-center text-xs text-slate-500">
                Evaluating candidate topics from INDEX.md...
              </div>
            )}
          </div>

          {/* PASS 2: Grounded Synthesis Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Pass 2: Grounded Answer Synthesis
                </h3>
              </div>
              {isQuerying && (
                <span className="text-xs text-indigo-400 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating tokens...
                </span>
              )}
            </div>

            {/* Answer Content */}
            <div
              onClick={handleContentClick}
              className="prose prose-invert max-w-none text-slate-200 text-sm leading-relaxed"
              dangerouslySetInnerHTML={renderMarkdown(
                streamingAnswer || (finalResult ? finalResult.answer : 'Waiting for answer synthesis...')
              )}
            />

            {/* Source citations footer */}
            {finalResult && finalResult.loadedNotes.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Retrieved Vault Context ({finalResult.loadedNotes.length} notes):
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {finalResult.loadedNotes.map((note, idx) => (
                    <div
                      key={idx}
                      onClick={() => onOpenPage(note.filename.replace('.md', ''))}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-indigo-600 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-medium text-indigo-300 flex items-center gap-1">
                        <FileText className="w-3 h-3 text-indigo-400" />
                        {note.filename}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{note.preview}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
