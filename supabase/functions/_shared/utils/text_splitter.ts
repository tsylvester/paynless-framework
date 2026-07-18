import { RecursiveCharacterTextSplitter } from 'npm:@langchain/textsplitters';
import type { ITextSplitter } from './text_splitter.interface.ts';

export class LangchainTextSplitter implements ITextSplitter {
  private splitter: RecursiveCharacterTextSplitter;

  constructor(options?: { chunkSize?: number; chunkOverlap?: number }) {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: options?.chunkSize || 1000,
      chunkOverlap: options?.chunkOverlap || 200,
    });
  }

  async splitText(text: string): Promise<string[]> {
    return this.splitter.splitText(text);
  }
}
