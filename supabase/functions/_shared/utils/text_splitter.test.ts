import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { LangchainTextSplitter } from "./text_splitter.ts";
import { RecursiveCharacterTextSplitter } from "npm:@langchain/textsplitters";

Deno.test("LangchainTextSplitter default splits long text into overlapping chunks", async () => {
    const text = "a".repeat(2500);
    const splitter = new LangchainTextSplitter();
    const chunks = await splitter.splitText(text);
    assertEquals(chunks.length > 1, true);
    assertEquals(chunks[0].length, 1000);
    assertEquals(chunks[0].slice(800, 1000), chunks[1].slice(0, 200));
});

Deno.test("LangchainTextSplitter short text returns a single chunk equal to input", async () => {
    const text = "short text";
    const splitter = new LangchainTextSplitter();
    const chunks = await splitter.splitText(text);
    assertEquals(chunks.length, 1);
    assertEquals(chunks[0], text);
});

Deno.test("LangchainTextSplitter honors custom chunkSize and chunkOverlap", async () => {
    const text = "a".repeat(100);
    const splitter = new LangchainTextSplitter({ chunkSize: 20, chunkOverlap: 5 });
    const chunks = await splitter.splitText(text);
    assertEquals(chunks.length, 7);
    assertEquals(chunks[0].length, 20);
    assertEquals(chunks[0].slice(15, 20), chunks[1].slice(0, 5));
});

Deno.test("LangchainTextSplitter empty string returns real RecursiveCharacterTextSplitter result", async () => {
    const splitter = new LangchainTextSplitter();
    const actual = await splitter.splitText("");
    const expected = await new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 }).splitText("");
    assertEquals(actual, expected);
});
