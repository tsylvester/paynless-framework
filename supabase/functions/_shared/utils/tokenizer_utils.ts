import { type TiktokenModel, encodingForModel } from "https://esm.sh/js-tiktoken@1.0.10";

interface MessageForTokenCounting {
  role: "system" | "user" | "assistant" | "function"; // Function role might be needed for some models
  content: string | null; // Content can be null for some function calls
  name?: string; // Optional, for function calls
}

/**
 * Counts the number of tokens in a list of messages for a given model.
 * Relies on `encoding_for_model` to get the correct tokenizer.
 * Applies ChatML-specific token counting rules for supported OpenAI model families.
 * Throws an error if the model is not supported by `tiktoken` or if it's not a
 * recognized chat model for which ChatML rules can be accurately applied.
 *
 * @param messages Array of message objects, each with role, content, and optional name.
 * @param modelName The API identifier of the model (e.g., "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo-0125").
 *                  This name must be a valid `TiktokenModel` recognized by the `tiktoken` library.
 * @returns The total number of tokens.
 * @throws Error if token counting cannot be performed accurately for the given model.
 */
export function countTokensForMessages(
  messages: MessageForTokenCounting[],
  modelName: string // Must be a TiktokenModel, e.g., "gpt-4", "gpt-3.5-turbo"
): number {
  let encoding: ReturnType<typeof encodingForModel>; // Tiktoken type is not directly exported by js-tiktoken via esm.sh in a simple way
  try {
    // The modelName string must be one of the literal strings defined in the TiktokenModel type.
    // If it's not, encoding_for_model will throw an error.
    encoding = encodingForModel(modelName as TiktokenModel);
  } catch (e: unknown) {
    const typedError = e instanceof Error ? e : new Error(String(e));
    console.error(`[countTokensForMessages] Failed to get encoding for model "${modelName}" using encoding_for_model. This model may not be supported by the tiktoken library or the provided name is not a recognized TiktokenModel. Error: ${typedError.message}`);
    throw new Error(`Unsupported model for token counting: ${modelName}. The tiktoken library could not find an encoding for this model. Original error: ${typedError.message}`);
  }

  let tokensPerMessage: number;
  let tokensPerName: number;

  // Determine tokensPerMessage and tokensPerName based on OpenAI model family.
  // These rules are specific to ChatML message formatting.
  if (modelName.startsWith("gpt-4o")) { // Covers gpt-4o, gpt-4o-2024-05-13
    tokensPerMessage = 3;
    tokensPerName = 1;
  } else if (modelName.startsWith("gpt-4")) { // Covers gpt-4, gpt-4-0314, gpt-4-0613, gpt-4-turbo etc.
    tokensPerMessage = 3;
    tokensPerName = 1;
  } else if (modelName.startsWith("gpt-3.5-turbo")) { // Covers gpt-3.5-turbo, gpt-3.5-turbo-0613, gpt-3.5-turbo-16k etc.
    tokensPerMessage = 3;
    tokensPerName = 1; 
    if (modelName === "gpt-3.5-turbo-0301") { // Older snapshot with specific rules
      tokensPerMessage = 4;
      tokensPerName = -1; // This is the special case where `name` reduces token count.
    }
  } else {
    // If encoding_for_model succeeded but the model isn't one of the known chat model families above.
    // The ChatML-specific counting (tokensPerMessage, tokensPerName, priming tokens) might not apply.
    // encoding.free(); // Free the encoding before throwing
    console.error(`[countTokensForMessages] Model "${modelName}" is not a recognized OpenAI chat model family (gpt-3.5-turbo, gpt-4, gpt-4o) for which specific ChatML token counting rules are defined. Accurate token counting for chat messages is not guaranteed with this function.`);
    throw new Error(`Model "${modelName}" is not a recognized chat model for accurate message token counting using ChatML rules.`);
  }
  
  let numTokens = 0;
  for (const message of messages) {
    numTokens += tokensPerMessage;
    // Add tokens for the textual content of role, content, and name (if present).
    if (message.role) { // Should always be true for valid messages
      numTokens += encoding.encode(message.role).length;
    }
    if (message.content !== null && message.content !== undefined) { // Content can be null
      numTokens += encoding.encode(message.content).length;
    }
    if (message.name) {
      numTokens += encoding.encode(message.name).length;
      numTokens += tokensPerName; // Apply the name-specific penalty or bonus
    }
  }
  numTokens += 3; // Every reply is primed with <|start|>assistant<|message|> (3 tokens) for ChatML.

  // encoding.free(); // Don't forget to free the encoding when done.
  return numTokens;
} 