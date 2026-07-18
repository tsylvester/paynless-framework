export interface ITextSplitter {
    splitText(text: string): Promise<string[]>;
}
