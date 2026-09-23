import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Initialize PDF.js worker
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface ParsedDocument {
  title: string;
  text: string;
  format: 'txt' | 'md' | 'pdf' | 'docx' | 'unknown';
  pageCount?: number;
}

export class DocumentParser {
  /**
   * Parse uploaded or selected file into clean text
   */
  public async parseFile(file: File): Promise<ParsedDocument> {
    const filename = file.name;
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const baseTitle = filename.replace(/\.[^/.]+$/, '');

    switch (extension) {
      case 'txt':
      case 'text': {
        const text = await file.text();
        return { title: baseTitle, text, format: 'txt' };
      }

      case 'md':
      case 'markdown': {
        const text = await file.text();
        return { title: baseTitle, text, format: 'md' };
      }

      case 'pdf': {
        const arrayBuffer = await file.arrayBuffer();
        return await this.parsePdf(arrayBuffer, baseTitle);
      }

      case 'docx': {
        const arrayBuffer = await file.arrayBuffer();
        return await this.parseDocx(arrayBuffer, baseTitle);
      }

      default: {
        // Fallback: attempt reading as plain text
        try {
          const text = await file.text();
          return { title: baseTitle, text, format: 'unknown' };
        } catch {
          throw new Error(`Unsupported document format: .${extension}. Supported: .txt, .md, .pdf, .docx`);
        }
      }
    }
  }

  /**
   * Extract text from PDF using PDF.js
   */
  public async parsePdf(arrayBuffer: ArrayBuffer, title: string): Promise<ParsedDocument> {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageString = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      
      if (pageString.trim().length > 0) {
        pageTexts.push(pageString.trim());
      }
    }

    const fullText = pageTexts.join('\n\n');
    return {
      title,
      text: fullText,
      format: 'pdf',
      pageCount: numPages,
    };
  }

  /**
   * Extract text from Word DOCX using Mammoth
   */
  public async parseDocx(arrayBuffer: ArrayBuffer, title: string): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return {
      title,
      text: result.value.trim(),
      format: 'docx',
    };
  }
}

export const documentParser = new DocumentParser();
