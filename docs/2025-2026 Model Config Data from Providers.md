# 2025-2026 Model Config Data from Providers

Collected 2026-02-23 from official provider pricing and documentation pages.

Provider costs are USD per 1 million tokens unless otherwise noted.

Application accounting uses **tokens** as the fixed I/O unit at $20 USD per million tokens.  

---

## OpenAI

Source: [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing)

Context window and max output data was not provided on the OpenAI pricing page. Values marked with `*` are carried forward from the existing internal model map and need independent verification from OpenAI's models documentation.

| API Identifier | Input $/1M | Output $/1M | Context Window | Max Output Tokens |
|----------------|------------|-------------|----------------|-------------------|
| gpt-5.2        |       1.75 |       14.00 |        400,000 |           128,000 |
| gpt-5.2-pro    |      21.00 |      168.00 |        400,000 |           128,000 |
| gpt-5.1        |       1.25 |       10.00 |        400,000 |           128,000 |
| gpt-5          |       1.25 |       10.00 |        400,000 |           128,000 |

**Critical finding**: The model map costs for gpt-5/5-mini/5-nano and gpt-4.1 series are off by a factor of 1000x. The map uses values like `1250` where the provider charges `$1.25/MTok`. The application's normalization unit is "cost per 1 million tokens" and the provider prices are already expressed in that unit.

## Anthropic

Source: [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)

All Claude models have a 200,000 token context window.
Claude Opus 4.6, Sonnet 4.6, Sonnet 4.5, and Sonnet 4 support 1,000,000 token context (beta, tier 4+).

|      API Identifier | Input $/1M | Output $/1M |    Context Window |  Max Output Tokens |
|---------------------|------------|-------------|-------------------|--------------------|
| claude-opus-4-6-*   |       5.00 |       25.00 |           200,000 |             64,000 |
| claude-opus-4-5-*   |       5.00 |       25.00 |           200,000 |             64,000 |
| claude-opus-4-1-*   |      15.00 |       75.00 |           200,000 |             64,000 |
| claude-opus-4-*     |      15.00 |       75.00 |           200,000 |             64,000 |
| claude-sonnet-4-6-* |       3.00 |       15.00 |           200,000 |             64,000 |
| claude-sonnet-4-5-* |       3.00 |       15.00 |           200,000 |             64,000 |
| claude-sonnet-4-*   |       3.00 |       15.00 |           200,000 |             64,000 |

---

## Google

Source: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)

Context window and max output data was not explicitly provided on the Google pricing page. The Google API itself returns `inputTokenLimit` and `outputTokenLimit` per model (used as Tier 1 data by google_adapter.ts).

|   API Identifier | Input $/1M | Output $/1M |  Context Window |   Max Output Tokens |
|------------------|------------|-------------|-----------------|---------------------|
| gemini-3.1       |       2.00 |       12.00 |       1,000,000 |              64,000 |
| gemini-3         |       2.00 |       12.00 |       1,000,000 |              64,000 |
| gemini-3-flash   |       0.50 |        3.00 |       1,000,000 |              64,000 |
| gemini-2.5       |       1.25 |       10.00 |       1,000,000 |              64,000 |
| gemini-2.5-flash |       0.30 |        2.50 |       1,000,000 |              64,000 |


