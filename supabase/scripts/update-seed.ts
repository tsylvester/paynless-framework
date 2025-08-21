#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write

/**
 * @file This script automates updating `supabase/seed.sql`. It fetches the current 
 * `ai_providers` data, generates deterministic UUIDs for each entry, and then 
 * surgically replaces the old `ai_providers` INSERT statements in the seed file.
 * 
 * To run from `supabase/functions`:
 * deno run --allow-net --allow-read --allow-write ../scripts/update-seed.ts
 */

import { Client } from "https://deno.land/x/postgres@v0.19.2/mod.ts";
import { resolve } from "https://deno.land/std@0.224.0/path/mod.ts";
import { v5 } from "npm:uuid@9.0.1";
import { AiModelExtendedConfigSchema } from "../functions/chat/zodSchema.ts";

// --- Configuration ---
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TABLE_NAME = "ai_providers";
const SCHEMA_NAME = "public";
const SEED_SQL_PATH = resolve(Deno.cwd(), "..", "seed.sql");
const PROVIDER_NAMESPACE = "3f2b4c5d-963e-45e1-8f9a-0a8b7a6e5d6f"; // Fixed namespace for deterministic UUIDs
// ---

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: unknown): string {
  if (value === null || typeof value === 'undefined') return 'NULL';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

export async function updateSeedFile() {
  console.log("🚀 Starting seed file update process...");
  const client = new Client(DB_URL);
  
  try {
    // 1. Connect and fetch data, sorted for consistent output
    await client.connect();
    console.log("✅ Successfully connected to the local database.");
    const queryText = `SELECT * FROM ${quoteIdent(SCHEMA_NAME)}.${quoteIdent(TABLE_NAME)} ORDER BY provider, api_identifier`;
    const result = await client.queryObject(queryText);
    const rows = result.rows;
    console.log(`Found ${rows.length} rows to seed.`);

    // Set the default embedding model
    rows.forEach(row => {
      const typedRow = row as Record<string, unknown>;
      if (typedRow.api_identifier === 'openai-text-embedding-3-large') {
        typedRow.is_default_embedding = true;
      } else {
        typedRow.is_default_embedding = false;
      }
    });
    console.log("✅ Set 'openai-text-embedding-3-large' as the default embedding model.");

    // 2. Generate INSERT statements with deterministic UUIDs
    const columnNames = result.columns;
    if (!columnNames) throw new Error("Could not get column names.");

    const textEncoder = new TextEncoder();
    const insertStatements = await Promise.all(rows.map(async (row) => {
      const rawRow = row as Record<string, unknown>;
      const apiIdentifier = rawRow.api_identifier as string;
      if (!apiIdentifier) throw new Error("Fatal: Found a provider with no api_identifier.");
      
      // Validate the config object from the database against the Zod schema.
      // We use .parse() here because if validation fails, the entire script
      // should halt to prevent writing a corrupted seed file.
      if (rawRow.config && typeof rawRow.config === 'object') {
        AiModelExtendedConfigSchema.parse(rawRow.config);
      } else {
        // Instead of throwing, log a clear warning and skip this record.
        // This allows the seed script to complete even if some rows are corrupted,
        // preventing a single bad row from halting the entire CI/CD pipeline.
        // The sync process is responsible for fixing the data in the DB.
        console.warn(`[WARN] Skipping provider ${apiIdentifier} because its config is missing, null, or not an object.`);
        return null; // This will be filtered out later.
      }

      // Generate a stable UUIDv5 based on the unique api_identifier
      rawRow.id = v5(apiIdentifier, PROVIDER_NAMESPACE);

      const values = columnNames.map(col => quoteLiteral(rawRow[col])).join(', ');
      return `INSERT INTO ${quoteIdent(SCHEMA_NAME)}.${quoteIdent(TABLE_NAME)} (${columnNames.map(quoteIdent).join(', ')}) VALUES (${values});`;
    }));
    const finalInserts = insertStatements.filter(s => s !== null).join('\n');

    // 3. Read the existing seed.sql file
    console.log(`📖 Reading seed file from: ${SEED_SQL_PATH}`);
    const seedSqlContent = await Deno.readTextFile(SEED_SQL_PATH);

    // 4. Define precise markers for the content block to be replaced
    const startMarker = "-- START AI PROVIDERS";
    const endMarker = "-- END AI PROVIDERS";

    const startIndex = seedSqlContent.indexOf(startMarker);
    const endIndex = seedSqlContent.indexOf(endMarker);

    if (startIndex === -1) {
      throw new Error(`❌ Could not find start marker in seed file: "${startMarker}"`);
    }
    if (endIndex === -1) {
      throw new Error(`❌ Could not find end marker in seed file: "${endMarker}"`);
    }

    // 5. Construct the new file content by replacing the block between the markers
    const contentBefore = seedSqlContent.substring(0, startIndex + startMarker.length);
    const contentAfter = seedSqlContent.substring(endIndex);
    
    // Assemble the new content, ensuring proper newlines for readability
    const newSeedSqlContent = `${contentBefore.trimEnd()}\n\n${finalInserts}\n\n${contentAfter.trimStart()}`;

    // 6. Write the updated content back
    await Deno.writeTextFile(SEED_SQL_PATH, newSeedSqlContent);
    console.log(`✅ Successfully updated ${SEED_SQL_PATH} with ${rows.length} new records and stable IDs!`);

  } catch (error) {
    console.error("\n❌ An error occurred during the seed file update process:");
    const err = error as Error;
    console.error(err.message);
    if (err.stack) console.error(err.stack);
    // Re-throw the error to allow test runners to catch it and to ensure
    // the script exits with a non-zero status code in a CI/CD environment.
    throw err;
  } finally {
    await client.end();
    console.log("🔌 Database connection closed.");
  }
}

// Ensure the script can still be run directly from the command line
if (import.meta.main) {
  await updateSeedFile();
}
