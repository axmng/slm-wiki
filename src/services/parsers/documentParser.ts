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

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
        return { title: baseTitle, text: this.cleanPunctuation(text), format: 'txt' };
      }

      case 'md':
      case 'markdown': {
        const text = await file.text();
        return { title: baseTitle, text: this.cleanPunctuation(text), format: 'md' };
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
        try {
          const text = await file.text();
          return { title: baseTitle, text: this.cleanPunctuation(text), format: 'unknown' };
        } catch {
          throw new Error(`Unsupported document format: .${extension}. Supported: .txt, .md, .pdf, .docx`);
        }
      }
    }
  }

  /**
   * Clean spacing around punctuation and hyphens
   */
  public cleanPunctuation(text: string): string {
    return text
      // Remove journal running publication headers like "Antibiotics 2019 , 8 , 23 8 of 18"
      .replace(/\b[A-Za-z]+\s+\d{4}\s*,\s*\d+\s*,\s*\d+\s+\d+\s+of\s+\d+\b/gi, '')
      .replace(/\b\d+\s+of\s+\d+\b/gi, '')
      // Fix hyphenated words broken across lines: e.g. "anti-\nbiotic" -> "antibiotic"
      .replace(/(\b[a-zA-Z]{2,})-\s*\n\s*([a-zA-Z]{2,}\b)/g, '$1$2')
      // Fix spaces before punctuation: "Canada , China" -> "Canada, China"
      .replace(/\s+([,.:;?!%)}\]])/g, '$1')
      // Fix spaces after opening brackets: "( see Fig" -> "(see Fig"
      .replace(/([({[])\s+/g, '$1')
      // Clean duplicate whitespace
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  /**
   * Extract text from PDF with column awareness and header/footer pruning
   */
  public async parsePdf(arrayBuffer: ArrayBuffer, title: string): Promise<ParsedDocument> {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      const textContent = await page.getTextContent();
      const rawItems = textContent.items as any[];

      // Map items with spatial coordinates (transform: [scaleX, skewY, skewX, scaleY, x, y])
      const items: PdfTextItem[] = [];
      for (const item of rawItems) {
        if (!item.str || item.str.trim().length === 0) continue;
        const x = item.transform ? item.transform[4] : 0;
        const y = item.transform ? item.transform[5] : 0;

        // Skip headers (top 10% of page) and footers/page numbers (bottom 7% of page)
        if (pageHeight > 0) {
          if (y > pageHeight * 0.90 || y < pageHeight * 0.07) {
            continue;
          }
        }

        items.push({
          str: item.str,
          x,
          y,
          width: item.width || 0,
          height: item.height || 0,
        });
      }

      if (items.length === 0) continue;

      // Detect if page has two distinct columns
      // Check if there are significant items on the left (< 46% width) and right (> 54% width)
      const leftColItems = items.filter((i) => i.x < pageWidth * 0.48);
      const rightColItems = items.filter((i) => i.x >= pageWidth * 0.48);
      const isTwoColumn =
        leftColItems.length > items.length * 0.3 &&
        rightColItems.length > items.length * 0.3;

      let pageString = '';
      if (isTwoColumn) {
        // Process Column 1 top-to-bottom, then Column 2 top-to-bottom
        const col1Text = this.assembleLines(leftColItems);
        const col2Text = this.assembleLines(rightColItems);
        pageString = `${col1Text}\n\n${col2Text}`;
      } else {
        // Single column layout
        pageString = this.assembleLines(items);
      }

      const cleanedPage = this.cleanPunctuation(pageString);
      if (cleanedPage.length > 0) {
        pageTexts.push(cleanedPage);
      }
    }

    let fullText = pageTexts.join('\n\n');

    // Remove or truncate references section at end of academic papers to avoid polluting topics
    const refMatch = fullText.search(/\n\s*(?:References|BIBLIOGRAPHY|Works Cited)\s*\n/i);
    if (refMatch > 500) {
      // Keep main text and exclude the 100+ raw citation references
      fullText = fullText.slice(0, refMatch).trim();
    }

    return {
      title,
      text: fullText,
      format: 'pdf',
      pageCount: numPages,
    };
  }

  /**
   * Sort spatial items into lines and paragraphs
   */
  private assembleLines(items: PdfTextItem[]): string {
    // Sort primarily by Y descending (PDF coordinates: 0 is bottom, pageHeight is top), then X ascending
    items.sort((a, b) => {
      // If Y difference is small (< 3pt), consider them on the same line
      if (Math.abs(a.y - b.y) <= 3) {
        return a.x - b.x;
      }
      return b.y - a.y;
    });

    const lines: string[] = [];
    let currentLineY = items[0]?.y ?? 0;
    let currentLineTokens: string[] = [];

    for (const item of items) {
      if (Math.abs(item.y - currentLineY) > 4) {
        // New line detected
        if (currentLineTokens.length > 0) {
          lines.push(currentLineTokens.join(' '));
        }
        currentLineTokens = [item.str];
        currentLineY = item.y;
      } else {
        currentLineTokens.push(item.str);
      }
    }

    if (currentLineTokens.length > 0) {
      lines.push(currentLineTokens.join(' '));
    }

    return lines.join('\n');
  }

  /**
   * Extract text from Word DOCX using Mammoth
   */
  public async parseDocx(arrayBuffer: ArrayBuffer, title: string): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return {
      title,
      text: this.cleanPunctuation(result.value.trim()),
      format: 'docx',
    };
  }
}

export const documentParser = new DocumentParser();
