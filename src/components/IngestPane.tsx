import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Sparkles,
  FileUp,
  BookMarked,
  FolderPlus,
} from 'lucide-react';
import { ingestionPipeline, IngestionProgress } from '../services/pipeline/ingestionPipeline';
import { documentParser, ParsedDocument } from '../services/parsers/documentParser';

interface IngestPaneProps {
  currentWiki: string;
  availableWikis: string[];
  onIngestSuccess: (topics: string[], wikiName: string) => void;
  onOpenPage: (pageName: string) => void;
}

const SAMPLE_ARTICLES = [
  {
    title: 'Transformer Architecture & Attention Mechanisms',
    text: `The Transformer model, introduced in "Attention Is All You Need" by Vaswani et al. in 2017, replaced recurrent neural network architectures with multi-head self-attention mechanisms.
Self-attention allows the model to weigh the relevance of different tokens in an input sequence regardless of their positional distance. 

In large language models (LLMs) and small language models (SLMs), decoder-only variants such as Gemma, LLaMA, and GPT compute autoregressive token predictions. Key computational bottlenecks include the KV cache memory footprint during long-context generation and quadratic complexity of standard full attention.

Techniques like Grouped-Query Attention (GQA), FlashAttention kernel acceleration, and 4-bit WebGPU quantization enable running models like Gemma directly on client edge hardware without cloud roundtrips.`
  },
  {
    title: 'Neuromorphic Computing & Spiking Neural Networks',
    text: `Neuromorphic computing refers to hardware architectures designed to mimic the biological neuro-synaptic structures of the human brain. Unlike traditional Von Neumann architectures that separate compute (CPU/GPU) from memory, neuromorphic chips integrate memory and computation directly into artificial neurons.

Spiking Neural Networks (SNNs) represent the third generation of neural network models. Rather than transmitting continuous activation values at every cycle, SNN neurons transmit discrete spikes only when an electrical threshold is surpassed, achieving dramatic energy efficiency.

Key platforms include Intel's Loihi, IBM's TrueNorth, and SpiNNaker. While current LLM inference predominantly runs on matrix multiply units like GPUs and TPUs, research into neuromorphic hardware promises micro-watt inference for edge sensors and wearable AI.`
  }
];

export const IngestPane: React.FC<IngestPaneProps> = ({
  currentWiki,
  availableWikis,
  onIngestSuccess,
  onOpenPage,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isParsingDoc, setIsParsingDoc] = useState(false);
  const [parsedDocInfo, setParsedDocInfo] = useState<ParsedDocument | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<IngestionProgress | null>(null);

  // Wiki selection state
  const [wikiMode, setWikiMode] = useState<'current' | 'new'>('current');
  const [selectedWiki, setSelectedWiki] = useState(currentWiki);
  const [newWikiName, setNewWikiName] = useState('');

  useEffect(() => {
    setSelectedWiki(currentWiki);
  }, [currentWiki]);

  const handleStartIngest = async () => {
    if (!content.trim() || isRunning) return;

    const targetWiki = wikiMode === 'new' ? newWikiName.trim() : selectedWiki;
    if (wikiMode === 'new' && !targetWiki) {
      alert('Please enter a name for the new wiki.');
      return;
    }

    setIsRunning(true);
    setProgress({
      stage: 'saving_raw',
      message: `Initializing ingestion pipeline for wiki "${targetWiki}"...`,
      percent: 5,
    });

    try {
      const result = await ingestionPipeline.ingest(
        content,
        title,
        (p) => setProgress(p),
        targetWiki
      );

      onIngestSuccess(result.topics.map(t => t.name), result.wikiName);
      setTimeout(() => {
        setTitle('');
        setContent('');
        setParsedDocInfo(null);
        if (wikiMode === 'new') {
          setNewWikiName('');
          setWikiMode('current');
        }
      }, 1000);
    } catch (err: any) {
      console.error('Ingestion error:', err);
      setProgress({
        stage: 'error',
        message: err.message || 'Ingestion failed',
        percent: 0,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const processFile = async (file: File) => {
    setIsParsingDoc(true);
    try {
      const parsed = await documentParser.parseFile(file);
      setContent(parsed.text);
      if (!title || title.trim() === '') {
        setTitle(parsed.title);
      }
      setParsedDocInfo(parsed);
    } catch (err: any) {
      console.error('File parsing error:', err);
      alert(`Could not parse file: ${err.message || err}`);
    } finally {
      setIsParsingDoc(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const loadSample = (index: number) => {
    const s = SAMPLE_ARTICLES[index];
    setTitle(s.title);
    setContent(s.text);
    setParsedDocInfo(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-indigo-400" />
              Ingest & Map-Reduce Pipeline
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Archive raw texts, PDFs, or DOCX documents into <code className="text-indigo-300">raw/</code>, automatically extract topics with local SLM, update Markdown notes in <code className="text-indigo-300">pages/</code>, and maintain <code className="text-indigo-300">INDEX.md</code>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Try sample:</span>
            <button
              onClick={() => loadSample(0)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 transition-colors"
            >
              Transformers
            </button>
            <button
              onClick={() => loadSample(1)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 transition-colors"
            >
              Neuromorphic
            </button>
          </div>
        </div>

        {/* Form Inputs */}
        <div className="mt-6 space-y-4">
          {/* Target Wiki Selection Option */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <BookMarked className="w-3.5 h-3.5 text-indigo-400" /> Destination Wiki
              </label>
              <span className="text-[11px] text-slate-400">
                Currently Active: <strong className="text-indigo-300">{currentWiki}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWikiMode('current')}
                className={`px-3 py-2 rounded-xl text-xs border text-left flex items-center justify-between transition-all ${
                  wikiMode === 'current'
                    ? 'bg-indigo-950/70 border-indigo-500 text-white font-medium'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <BookMarked className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">Ingest into existing wiki</span>
                </div>
                {wikiMode === 'current' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => setWikiMode('new')}
                className={`px-3 py-2 rounded-xl text-xs border text-left flex items-center justify-between transition-all ${
                  wikiMode === 'new'
                    ? 'bg-indigo-950/70 border-indigo-500 text-white font-medium'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FolderPlus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Create brand new wiki for this doc</span>
                </div>
                {wikiMode === 'new' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              </button>
            </div>

            {/* Select existing wiki */}
            {wikiMode === 'current' && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-400">Target Wiki:</span>
                <select
                  value={selectedWiki}
                  onChange={(e) => setSelectedWiki(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-indigo-300 font-medium rounded-lg px-2.5 py-1 focus:outline-none"
                >
                  {availableWikis.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Create new wiki name input */}
            {wikiMode === 'new' && (
              <div className="pt-1">
                <label className="block text-[11px] text-cyan-400 mb-1 font-medium">
                  Name for the new wiki:
                </label>
                <input
                  type="text"
                  value={newWikiName}
                  onChange={(e) => setNewWikiName(e.target.value)}
                  placeholder="e.g. Machine Learning, Neuroscience, Company Wiki, Cooking..."
                  className="w-full bg-slate-900 border border-cyan-500/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Source Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Research Paper Notes or Article Headline"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              disabled={isRunning || isParsingDoc}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Document / Article Content
              </label>
              <label className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1.5 font-medium">
                <FileUp className="w-3.5 h-3.5" />
                <span>Upload .txt, .md, .pdf, or .docx</span>
                <input
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isRunning || isParsingDoc}
                />
              </label>
            </div>

            {/* Parsing Indicator */}
            {isParsingDoc && (
              <div className="mb-2 p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-800/80 text-xs text-indigo-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Extracting and parsing text locally from document (100% in-browser)...</span>
              </div>
            )}

            {/* Parsed Doc Badge */}
            {parsedDocInfo && !isParsingDoc && (
              <div className="mb-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-xs text-emerald-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Loaded <strong>{parsedDocInfo.format.toUpperCase()}</strong>: {parsedDocInfo.title}
                  {parsedDocInfo.pageCount ? ` (${parsedDocInfo.pageCount} pages)` : ''}
                </span>
                <span className="text-[11px] opacity-80">{parsedDocInfo.text.length} characters</span>
              </div>
            )}

            {/* Drop Zone / Textarea */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-xl transition-all ${
                isDragging
                  ? 'border-2 border-dashed border-indigo-400 bg-indigo-950/30'
                  : 'border border-slate-800'
              }`}
            >
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste raw text, or drag and drop any .txt, .md, .pdf, or .docx file here..."
                rows={8}
                className="w-full bg-slate-950 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed transition-colors"
                disabled={isRunning || isParsingDoc}
              />
              {isDragging && (
                <div className="absolute inset-0 bg-indigo-950/80 rounded-xl backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none text-indigo-200">
                  <UploadCloud className="w-8 h-8 text-indigo-400 animate-bounce mb-1" />
                  <span className="text-sm font-semibold">Drop PDF, DOCX, or Markdown file to parse</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-400">
              {content ? `${content.length} characters (~${Math.round(content.length / 4)} tokens)` : 'Ready for input'}
            </div>

            <button
              onClick={handleStartIngest}
              disabled={!content.trim() || isRunning || isParsingDoc}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg ${
                !content.trim() || isRunning || isParsingDoc
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Processing Ingestion Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>Ingest into {wikiMode === 'new' && newWikiName ? `"${newWikiName}"` : `"${selectedWiki}"`}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Progress & Live Results Box */}
      {progress && (
        <div className={`p-5 rounded-2xl border transition-all ${
          progress.stage === 'error'
            ? 'bg-rose-950/20 border-rose-800/80 text-rose-200'
            : progress.stage === 'completed'
            ? 'bg-emerald-950/20 border-emerald-800/80 text-emerald-200'
            : 'bg-slate-900 border-indigo-900/50 text-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {progress.stage === 'completed' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : progress.stage === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-400" />
              ) : (
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              )}
              <span className="font-semibold text-sm">{progress.message}</span>
            </div>
            <span className="text-xs font-mono font-medium opacity-80">{progress.percent}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mb-4 border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                progress.stage === 'error'
                  ? 'bg-rose-500'
                  : progress.stage === 'completed'
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-indigo-500 to-cyan-500'
              }`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          {/* Extracted Topics & Created Notes */}
          {progress.extractedTopics && progress.extractedTopics.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Discovered Concept Topics ({progress.extractedTopics.length}):
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {progress.extractedTopics.map((topic, i) => (
                  <div
                    key={i}
                    onClick={() => onOpenPage(topic.name)}
                    className="group flex flex-col p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-indigo-600 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-indigo-300 group-hover:text-indigo-200 flex items-center gap-1.5">
                        [[{topic.name}]]
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{topic.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {progress.rawFilename && (
            <div className="text-xs text-slate-400 mt-3 pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="text-slate-500">Raw Archive:</span>
              <code className="text-indigo-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                raw/{progress.rawFilename}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
