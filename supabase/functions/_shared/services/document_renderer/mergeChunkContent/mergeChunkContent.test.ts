import { assert, assertEquals } from "jsr:@std/assert";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { MockLogger } from "../../../logger.mock.ts";
import { createMockDownloadFromStorage } from "../../../supabase_storage_utils.mock.ts";
import { sanitizeJsonContent } from "../../../utils/jsonSanitizer/jsonSanitizer.ts";
import { createMockSanitizeJsonContent } from "../../../utils/jsonSanitizer/jsonSanitizer.mock.ts";
import { buildContributionRow } from "../assembleContributionChain/assembleContributionChain.mock.ts";
import {
  buildMergeChunkContentDeps,
  buildMergeChunkContentParams,
  buildMergeChunkContentPayload,
} from "./mergeChunkContent.mock.ts";
import { ChunkMergeError, mergeChunkContent } from "./mergeChunkContent.ts";

const basePath = "proj_x/session_s/iteration_1/thesis/documents";

Deno.test("parses JSON content and extracts the content field", async () => {
  const chunk = buildContributionRow({
    id: "root-json-1",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const structuredData = {
    executive_summary: "This is the executive summary content.",
    market_opportunity: "This is the market opportunity content.",
  };
  const jsonContent = JSON.stringify({ content: structuredData });
  const data = await new Blob([jsonContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData, structuredData);
});

Deno.test("merges JSON with no content wrapper and ignores metadata fields", async () => {
  const chunk = buildContributionRow({
    id: "root-unwrapped-1",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const structuredData = {
    executive_summary: "Unwrapped executive summary.",
    market_opportunity: "Unwrapped market opportunity.",
  };
  const jsonContent = JSON.stringify({
    continuation_needed: false,
    stop_reason: "complete",
    ...structuredData,
  });
  const data = await new Blob([jsonContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData, structuredData);
  assertEquals("continuation_needed" in result.mergedStructuredData, false);
  assertEquals("stop_reason" in result.mergedStructuredData, false);
});

Deno.test("converts escaped newlines, quotes, and backslashes correctly", async () => {
  const chunk = buildContributionRow({
    id: "root-json-2",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const structuredData = {
    executive_summary: 'Title\n\nQuote: "text"\nBackslash: \\path',
    market_opportunity: "Market opportunity content",
  };
  const jsonContent = JSON.stringify({ content: structuredData });
  const data = await new Blob([jsonContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData, structuredData);
});

Deno.test("uses markdown content directly when content is not JSON", async () => {
  const chunk = buildContributionRow({
    id: "root-json-3",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const markdownContent =
    "# Business Case\n\n## Market Opportunity\nThis is markdown content.";
  const data = await new Blob([markdownContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData._extra_content, markdownContent);
});

Deno.test("handles mixed JSON and markdown chunks correctly", async () => {
  const chunk1 = buildContributionRow({
    id: "root-json-4",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const chunk2 = buildContributionRow({
    id: "cont-json-4",
    file_name: "gpt-4o-mini_1_business_case.md",
  });
  const rawJsonPath1 = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const markdownPath2 = `${basePath}/gpt-4o-mini_1_business_case.md`;
  const structuredData = {
    executive_summary: "First Chunk\n\nThis is from JSON.",
    market_opportunity: "First chunk market opportunity",
  };
  const jsonContent1 = JSON.stringify({ content: structuredData });
  const markdownContent2 = "# Second Chunk\n\nThis is markdown.";
  const jsonData = await new Blob([jsonContent1]).arrayBuffer();
  const mdData = await new Blob([markdownContent2]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: {
      [rawJsonPath1]: jsonData,
      [markdownPath2]: mdData,
    },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk1, chunk2] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData.executive_summary, structuredData.executive_summary);
  assertEquals(result.mergedStructuredData.market_opportunity, structuredData.market_opportunity);
  assertEquals(result.mergedStructuredData._extra_content, markdownContent2);
});

Deno.test("parses JSON content with trailing whitespace or newlines", async () => {
  const chunk = buildContributionRow({
    id: "root-json-trailing",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const structuredData = {
    executive_summary: "Content with trailing whitespace test",
    market_opportunity: "Market opportunity content",
  };
  const jsonContent = JSON.stringify({ content: structuredData }) + "\n\n  \t  \n";
  const data = await new Blob([jsonContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData, structuredData);
});

Deno.test("accepts content as object and populates structured data correctly", async () => {
  const chunk = buildContributionRow({
    id: "root-object-content-test",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const agentResponseWithObjectContent = {
    content: {
      market_opportunity: "The target market consists of enterprise customers seeking advanced analytics solutions with projected growth of 25% annually.",
      user_problem_validation: "User research confirms that 78% of enterprises struggle with data processing latency exceeding acceptable thresholds.",
      competitive_analysis: "Compared to legacy solutions, our approach offers 3x performance improvement while maintaining compatibility with existing infrastructure.",
      "differentiation_&_value_proposition": "Our unique value lies in the proprietary algorithm that reduces processing time by 60% without sacrificing accuracy.",
      "risks_&_mitigation": "Primary risks include market adoption timing and technical scalability, mitigated through phased rollout and cloud-native architecture.",
      strengths: "Strong technical team, proven prototype, and early customer validation with three pilot partners.",
      weaknesses: "Limited brand recognition and dependency on third-party cloud infrastructure.",
      opportunities: "Growing market demand and regulatory changes favoring data sovereignty solutions.",
      threats: "Well-funded competitors and potential economic downturn affecting enterprise IT budgets.",
      next_steps: "Complete Series A funding, expand pilot program, and finalize enterprise partnership agreements.",
      proposal_references: "Internal market research Q4 2024, Customer interviews Dec 2024, Competitive analysis report Jan 2025",
      executive_summary: "This proposal outlines a strategic initiative to capture the enterprise analytics market through innovative technology and strong execution.",
    },
  };
  const jsonContent = JSON.stringify(agentResponseWithObjectContent);
  const data = await new Blob([jsonContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData, agentResponseWithObjectContent.content);
});

Deno.test("two JSON fragments concatenate and parse into a single merged object", async () => {
  const chunk1 = buildContributionRow({
    id: "root-frag",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const chunk2 = buildContributionRow({
    id: "cont-frag",
    file_name: "gpt-4o-mini_1_business_case_raw.json",
  });
  const path1 = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const path2 = `${basePath}/gpt-4o-mini_1_business_case_raw.json`;
  const fragment1 = '{"content": {"executive_summary": "hello ';
  const fragment2 = 'world"}}';
  const data1 = await new Blob([fragment1]).arrayBuffer();
  const data2 = await new Blob([fragment2]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: {
      [path1]: data1,
      [path2]: data2,
    },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk1, chunk2] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData.executive_summary, "hello world");
});

Deno.test("single chunk with complete JSON still works through concatenated parse", async () => {
  const chunk = buildContributionRow({
    id: "root-single",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const structuredData = {
    executive_summary: "Single chunk summary.",
    market_opportunity: "Single chunk market.",
  };
  const jsonContent = JSON.stringify({ content: structuredData });
  const data = await new Blob([jsonContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData, structuredData);
});

Deno.test("concatenated result with backtick wrappers is sanitized before parse", async () => {
  const chunk = buildContributionRow({
    id: "root-backticks",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const structuredData = {
    executive_summary: "From backticks.",
    market_opportunity: "Market from backticks.",
  };
  const wrappedContent = "```json\n" + JSON.stringify({ content: structuredData }) + "\n```";
  const data = await new Blob([wrappedContent]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData, structuredData);
});

Deno.test("multiple complete JSON objects fallback to per-chunk parse and merge", async () => {
  const chunk1 = buildContributionRow({
    id: "root-full",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const chunk2 = buildContributionRow({
    id: "cont-full",
    file_name: "gpt-4o-mini_1_business_case_raw.json",
  });
  const path1 = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const path2 = `${basePath}/gpt-4o-mini_1_business_case_raw.json`;
  const json1 = JSON.stringify({ content: { executive_summary: "First chunk only." } });
  const json2 = JSON.stringify({ content: { market_opportunity: "Second chunk only." } });
  const data1 = await new Blob([json1]).arrayBuffer();
  const data2 = await new Blob([json2]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: {
      [path1]: data1,
      [path2]: data2,
    },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk1, chunk2] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData.executive_summary, "First chunk only.");
  assertEquals(result.mergedStructuredData.market_opportunity, "Second chunk only.");
});

Deno.test("non-JSON chunks are accumulated into _extra_content and joined with newlines", async () => {
  const chunk1 = buildContributionRow({
    id: "root-plain-1",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const chunk2 = buildContributionRow({
    id: "cont-plain-2",
    file_name: "gpt-4o-mini_1_business_case_raw.json",
  });
  const path1 = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const path2 = `${basePath}/gpt-4o-mini_1_business_case_raw.json`;
  const plain1 = "Plain markdown without JSON.";
  const plain2 = "No curly braces at start.";
  const data1 = await new Blob([plain1]).arrayBuffer();
  const data2 = await new Blob([plain2]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: {
      [path1]: data1,
      [path2]: data2,
    },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk1, chunk2] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData._extra_content, `${plain1}\n\n${plain2}`);
});

Deno.test("concatenated mid-string fragments are structurally repaired in Phase 2", async () => {
  const chunk1 = buildContributionRow({
    id: "chunk-err-1",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const chunk2 = buildContributionRow({
    id: "chunk-err-2",
    file_name: "gpt-4o-mini_1_business_case_raw.json",
  });
  const path1 = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const path2 = `${basePath}/gpt-4o-mini_1_business_case_raw.json`;
  const fragment1 = '{"executive_summary": "unclosed';
  const fragment2 = "string";
  const data1 = await new Blob([fragment1]).arrayBuffer();
  const data2 = await new Blob([fragment2]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: {
      [path1]: data1,
      [path2]: data2,
    },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk1, chunk2] }),
  );

  assert(!("error" in result), "expected success return");
  assertEquals(result.mergedStructuredData.executive_summary, "unclosedstring");
});

Deno.test("returns ChunkMergeError when a chunk is missing file_name", async () => {
  const chunk = buildContributionRow({
    id: "root-missing-filename",
    file_name: undefined,
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps(),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert("error" in result, "expected error return");
  assert(result.error instanceof ChunkMergeError);
  assertEquals(result.retriable, false);
  assertEquals(
    result.error.message,
    `Contribution ${chunk.id} is missing file_name`,
  );
});

Deno.test("propagates storage-download error unmodified", async () => {
  const chunk = buildContributionRow({
    id: "root-storage-error",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const downloadError = new Error("storage download failed");
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "error",
    error: downloadError,
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert("error" in result, "expected error return");
  assert(result.error === downloadError);
  assertEquals(result.retriable, false);
  assert(!(result.error instanceof ChunkMergeError));
});

Deno.test("Phase 3 JSON parse failure returns the actual SyntaxError and logs context", async () => {
  const chunk = buildContributionRow({
    id: "root-parse-fail",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const invalidJson = '{"content": { invalid';
  const data = await new Blob([invalidJson]).arrayBuffer();
  const logger = new MockLogger();
  const errorSpy = spy(logger, "error");
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, logger, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert("error" in result, "expected error return");
  assert(result.error instanceof SyntaxError);
  assertEquals(result.retriable, false);
  assert(!(result.error instanceof ChunkMergeError));
  assert(errorSpy.calls.length >= 1, "logger.error should have been called");
  assert(
    errorSpy.calls.some((c) =>
      c.args.some((arg) =>
        typeof arg === "object" &&
        arg !== null &&
        JSON.stringify(arg).includes(chunk.id)
      )
    ),
    "logger.error should include chunkId context",
  );
});

Deno.test("Phase 2 JSON parse failure is logged and falls through to Phase 3", async () => {
  const chunk1 = buildContributionRow({
    id: "root-phase2-fail",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const chunk2 = buildContributionRow({
    id: "cont-phase2-fail",
    file_name: "gpt-4o-mini_1_business_case_raw.json",
  });
  const path1 = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const path2 = `${basePath}/gpt-4o-mini_1_business_case_raw.json`;
  const json1 = JSON.stringify({ content: { a: "1" } });
  const json2 = JSON.stringify({ content: { b: "2" } });
  const logger = new MockLogger();
  const warnSpy = spy(logger, "warn");
  const data1 = await new Blob([json1]).arrayBuffer();
  const data2 = await new Blob([json2]).arrayBuffer();
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: {
      [path1]: data1,
      [path2]: data2,
    },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, logger, sanitizeJsonContent }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk1, chunk2] }),
  );

  assert(!("error" in result), "expected success return after Phase 3 fallback");
  assertEquals(result.mergedStructuredData.a, "1");
  assertEquals(result.mergedStructuredData.b, "2");
  assert(warnSpy.calls.length >= 1, "logger.warn should have been called for Phase 2 failure");
});

Deno.test("returns ChunkMergeError for invalid sanitization result", async () => {
  const chunk = buildContributionRow({
    id: "root-invalid-sanitization",
    file_name: "gpt-4o-mini_0_business_case_raw.json",
  });
  const rawJsonPath = `${basePath}/gpt-4o-mini_0_business_case_raw.json`;
  const data = await new Blob([JSON.stringify({ content: {} })]).arrayBuffer();
  const invalidSanitize = createMockSanitizeJsonContent({ sanitized: undefined });
  const downloadFromStorage = createMockDownloadFromStorage({
    mode: "pathKeyed",
    pathToData: { [rawJsonPath]: data },
  });

  const result = await mergeChunkContent(
    buildMergeChunkContentDeps({ downloadFromStorage, sanitizeJsonContent: invalidSanitize }),
    buildMergeChunkContentParams(),
    buildMergeChunkContentPayload({ orderedChunks: [chunk] }),
  );

  assert("error" in result, "expected error return");
  assert(result.error instanceof ChunkMergeError);
  assertEquals(result.retriable, false);
  assertEquals(
    result.error.message,
    `Failed to parse JSON content: invalid sanitization result (chunk IDs: ${chunk.id}; paths: ${rawJsonPath})`,
  );
});
