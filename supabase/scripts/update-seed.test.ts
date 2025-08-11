import { assert, assertEquals, assertExists, assertMatch, assertRejects } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.2/mod.ts";
import { AiModelExtendedConfigSchema } from "../functions/chat/zodSchema.ts";
import { updateSeedFile } from "./update-seed.ts";

// --- Mock Data ---

const MOCK_VALID_PROVIDERS_DATA = [
  {
    provider: "openai",
    api_identifier: "gpt-4",
    name: "GPT-4",
    config: {
      "api_identifier": "gpt-4",
      "tokenization_strategy": { "type": "tiktoken", "tiktoken_encoding_name": "cl100k_base", "is_chatml_model": true },
      "input_token_cost_rate": 0.03,
      "output_token_cost_rate": 0.06,
      "context_window_tokens": 8192,
      "hard_cap_output_tokens": 4096,
      "provider_max_input_tokens": 8192,
      "provider_max_output_tokens": 4096,
    },
    is_default_embedding: false
  },
  {
    provider: "openai",
    api_identifier: "openai-text-embedding-3-large",
    name: "OpenAI Embeddings",
    config: {
      "api_identifier": "openai-text-embedding-3-large",
      "tokenization_strategy": { "type": "tiktoken", "tiktoken_encoding_name": "cl100k_base", "is_chatml_model": false },
      "input_token_cost_rate": 0.00013,
      "output_token_cost_rate": 1,
      "context_window_tokens": 8191,
      "hard_cap_output_tokens": 4096,
      "provider_max_input_tokens": 8191,
      "provider_max_output_tokens": 4096,
    },
    is_default_embedding: true
  },
  {
    provider: "anthropic",
    api_identifier: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    config: {
      "api_identifier": "claude-3-opus-20240229",
      "tokenization_strategy": { "type": "anthropic_tokenizer", "model": "claude-3-opus-20240229" },
      "input_token_cost_rate": 0.015,
      "output_token_cost_rate": 0.075,
      "context_window_tokens": 200000,
      "hard_cap_output_tokens": 4096,
      "provider_max_input_tokens": 200000,
      "provider_max_output_tokens": 4096,
    },
    is_default_embedding: false
  },
];

const MOCK_INVALID_PROVIDERS_DATA = [
    ...MOCK_VALID_PROVIDERS_DATA,
    {
        provider: "anthropic",
        api_identifier: "claude-invalid-config",
        name: "Claude Invalid",
        config: {
          "api_identifier": "claude-invalid-config",
          "tokenization_strategy": { "type": "anthropic_tokenizer" }, // Deliberately invalid: Missing 'model' property
          "input_token_cost_rate": 0.015,
          "output_token_cost_rate": 0.075,
          "context_window_tokens": 200000,
          "hard_cap_output_tokens": 4096,
          "provider_max_input_tokens": 200000,
          "provider_max_output_tokens": 4096,
        },
        is_default_embedding: false
      }
];

const MOCK_SEED_SQL_CONTENT = `
-- Some initial SQL statements
-- More SQL statements

-- START AI PROVIDERS
-- This content will be replaced by the script.
-- END AI PROVIDERS

-- Some final SQL statements
`;

// Helper function to extract JSON config from a SQL INSERT statement
function extractConfigFromJsonString(sql: string): Record<string, unknown> | null {
  // This regex is adjusted to look for a JSON object within single quotes,
  // which might be followed by '::jsonb' or just be a string literal.
  const match = sql.match(/'({[^']*})'/);
  if (!match || !match[1]) {
    return null;
  }
  const jsonString = match[1].replace(/''/g, "'");
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse JSON from SQL:", jsonString);
    throw e;
  }
}


Deno.test("update-seed.ts - generated configs should conform to Zod schema", async () => {
  let writtenContent = "";

  const readTextFileStub = stub(Deno, "readTextFile", () => Promise.resolve(MOCK_SEED_SQL_CONTENT));
  const writeTextFileStub = stub(Deno, "writeTextFile", (_path, content) => {
    writtenContent = content as string;
    return Promise.resolve();
  });

  const clientQueryObjectStub = stub(
    Client.prototype,
    "queryObject",
    () => Promise.resolve({ rows: MOCK_VALID_PROVIDERS_DATA, columns: Object.keys(MOCK_VALID_PROVIDERS_DATA[0]) }) as any,
  );

  const clientConnectStub = stub(Client.prototype, "connect", () => Promise.resolve());
  const clientEndStub = stub(Client.prototype, "end", () => Promise.resolve());

  try {
    await updateSeedFile();

    assert(writeTextFileStub.calls.length > 0, "Deno.writeTextFile should have been called.");
    assertExists(writtenContent, "The new seed file content should not be empty.");

    const startMarker = "-- START AI PROVIDERS";
    const endMarker = "-- END AI PROVIDERS";
    const startIndex = writtenContent.indexOf(startMarker);
    const endIndex = writtenContent.indexOf(endMarker);
    const insertBlock = writtenContent.substring(startIndex + startMarker.length, endIndex).trim();

    const insertStatements = insertBlock.split(';\n').filter(s => s.trim() !== '');
    assertEquals(insertStatements.length, MOCK_VALID_PROVIDERS_DATA.length, "Should have one INSERT statement per mock provider.");

    for (const statement of insertStatements) {
      const config = extractConfigFromJsonString(statement);
      assertExists(config, `Could not extract config from statement: ${statement}`);
      
      const parseResult = AiModelExtendedConfigSchema.safeParse(config);
      assert(parseResult.success, `Zod schema validation failed for config: ${JSON.stringify(config, null, 2)}. Errors: ${JSON.stringify(parseResult.error?.format(), null, 2)}`);
    }

  } finally {
    readTextFileStub.restore();
    writeTextFileStub.restore();
    clientQueryObjectStub.restore();
    clientConnectStub.restore();
    clientEndStub.restore();
  }
});


Deno.test("update-seed.ts - should throw a fatal error if a config from the database is invalid", async () => {
  const readTextFileStub = stub(Deno, "readTextFile", () => Promise.resolve(MOCK_SEED_SQL_CONTENT));
  const writeTextFileStub = stub(Deno, "writeTextFile", () => Promise.resolve());
  
  const clientQueryObjectStub = stub(
    Client.prototype,
    "queryObject",
    () => Promise.resolve({ rows: MOCK_INVALID_PROVIDERS_DATA, columns: Object.keys(MOCK_INVALID_PROVIDERS_DATA[0]) }) as any,
  );

  const clientConnectStub = stub(Client.prototype, "connect", () => Promise.resolve());
  const clientEndStub = stub(Client.prototype, "end", () => Promise.resolve());

  try {
    await assertRejects(
      () => updateSeedFile(),
      Error, // We expect an Error (ZodError is a subclass)
      undefined, // We don't need to match the message string
      "The script should have thrown an error due to the invalid config."
    );

    assertEquals(writeTextFileStub.calls.length, 0, "Deno.writeTextFile should not have been called when validation fails.");

  } finally {
    readTextFileStub.restore();
    writeTextFileStub.restore();
    clientQueryObjectStub.restore();
    clientConnectStub.restore();
    clientEndStub.restore();
  }
});
