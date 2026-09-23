# 🧠 SLM Wiki: In-Browser Local Knowledge Base

An on-device, browser-based personal knowledge wiki inspired by Andrej Karpathy's LLM-wiki pattern, optimized to run with **Small Language Models (SLMs)** such as Google Gemma 2B/4B using **LiteRT-LM (WebGPU)** and the **File System Access API**.

---

## 💡 The Core Idea

Karpathy's LLM Wiki paradigm centers on an LLM reading unstructured notes, organizing them into a structured personal encyclopedia, maintaining an `INDEX.md`, and routing queries.

Running this on small local models (2B–4B parameters) directly inside a web browser requires decomposing monolithic agent prompts into **deterministic, programmatic TypeScript pipelines**:
1. **Map-Reduce Ingestion Pipeline**: Chunks raw clips, uses the SLM with structured JSON output schemas to identify entities and facts, merges them into targeted Markdown notes, deterministically resolves `[[wikilinks]]`, and updates `INDEX.md` and `LOG.md`.
2. **Hierarchical 2-Pass Retrieval Pipeline**:
   - **Pass 1 (Routing)**: The SLM scans `INDEX.md` and selects only the top 2–3 filenames relevant to the query (with BM25 pre-filtering for large indices).
   - **Pass 2 (Synthesis)**: Only those 2–3 Markdown notes are loaded into context, producing a grounded, hallucination-free answer with citations.

---

## 📁 Local Vault Disk Layout

When you click **Mount Local Vault**, the web app connects directly to a directory on your disk (such as an Obsidian vault or Git repo) via `window.showDirectoryPicker()`:

```
my-vault/
└── wikis/
    ├── Default/
    │   ├── INDEX.md             # Registry of topics for Default wiki
    │   ├── LOG.md               # Chronological log for Default wiki
    │   ├── pages/               # Concept notes (.md)
    │   └── raw/                 # Timestamped source archives
    ├── Machine Learning/
    │   ├── INDEX.md
    │   ├── LOG.md
    │   ├── pages/
    │   └── raw/
    └── Neuroscience/
        ├── INDEX.md
        ├── LOG.md
        ├── pages/
        └── raw/
```

All files are **standard Markdown** organized by wiki and instantly readable/editable in [Obsidian](https://obsidian.md), VS Code, or terminal tools.

---

## ⚡ Architecture & Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide icons.
- **Local Document Parsers**: 100% in-browser parsing for `.pdf` (via `pdfjs-dist`) and `.docx` (via `mammoth`), as well as `.txt` and `.md`. No file content ever leaves your machine.
- **Markdown & Links**: `marked` with custom link handler supporting Obsidian-style `[[wikilinks]]`.
- **Inference Runtime**: Dedicated Web Worker (`aiWorker.ts`) executing:
  - **LiteRT-LM WebGPU**: Hardware-accelerated Gemma models in-browser without cloud servers.
  - **Mock / Dev Mode**: Built-in instantaneous semantic simulator for rapid offline UI testing and debugging without downloading multi-GB model weights.
- **Storage**: Browser File System Access API with an automatic in-memory virtual vault fallback for unsupported browsers.

---

## 🚀 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge (browsers supporting WebGPU & File System Access API).

### 3. Run Unit Tests

```bash
npm test
```

### 4. Production Build

```bash
npm run build
```

---

## 🔍 How to Use

1. **Mount your Vault**: Click **Mount Local Vault** in the top right to select any local folder or your existing Obsidian vault.
2. **Ingest Notes / Articles**: Go to the **Ingest & Map-Reduce** tab. Paste an article, drop a `.txt`/`.md` file, or click one of the sample buttons. Watch the real-time pipeline extract topics and build notes.
3. **Query your Knowledge Base**: Go to the **Query & Synthesize** tab. Type a question. Watch Pass 1 select the most relevant files from `INDEX.md`, and Pass 2 synthesize a grounded answer citing your notes.
4. **Browse & Edit Notes**: Go to the **Vault Explorer** tab to inspect notes, follow `[[wikilinks]]`, or edit Markdown directly.
