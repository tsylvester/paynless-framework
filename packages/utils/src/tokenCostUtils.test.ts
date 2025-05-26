import { describe, it, expect, vi } from 'vitest';
import { estimateInputTokens, getMaxOutputTokens } from './tokenCostUtils';
import type { AiModelExtendedConfig, MessageForTokenCounting } from '../../types/src/ai.types';
import { getEncoding, encodingForModel } from 'js-tiktoken'; // Import anmes for direct mocking

// Mock js-tiktoken
vi.mock('js-tiktoken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('js-tiktoken')>();
  return {
    ...actual,
    // Ensure these are spied on by vi.fn() so they can be further mocked in tests
    getEncoding: vi.fn().mockImplementation((encodingName: string) => ({
      name: encodingName,
      encode: vi.fn((text: string) => text.split(' ').filter(s => s.length > 0)),
      decode: vi.fn((tokens: number[]) => tokens.join(' ')),
    })),
    encodingForModel: vi.fn().mockImplementation((modelName: string) => ({
      name: modelName,
      encode: vi.fn((text: string) => text.split(' ').filter(s => s.length > 0)),
      decode: vi.fn((tokens: number[]) => tokens.join(' ')),
    })),
  };
});


const MOCK_MODEL_CONFIG_TIKTOKEN_CHATML: AiModelExtendedConfig = {
  input_token_cost_rate: 0.01,
  output_token_cost_rate: 0.03,
  context_window_tokens: 4096,
  hard_cap_output_tokens: 1000,
  tokenization_strategy: {
    type: 'tiktoken',
    tiktoken_encoding_name: 'cl100k_base',
    is_chatml_model: true,
  },
};

const MOCK_MODEL_CONFIG_TIKTOKEN_NON_CHATML: AiModelExtendedConfig = {
  ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
  tokenization_strategy: {
    type: 'tiktoken',
    tiktoken_encoding_name: 'cl100k_base',
    is_chatml_model: false,
  },
};

const MOCK_MODEL_CONFIG_ROUGH_CHAR_COUNT: AiModelExtendedConfig = {
  ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
  tokenization_strategy: {
    type: 'rough_char_count',
    chars_per_token_ratio: 4,
  },
};

const MOCK_MODEL_CONFIG_UNKNOWN_STRATEGY: AiModelExtendedConfig = {
    ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
    tokenization_strategy: {
        type: 'unknown',
    },
};

const MOCK_MODEL_CONFIG_NO_STRATEGY: AiModelExtendedConfig = {
    ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
    tokenization_strategy: undefined as unknown as AiModelExtendedConfig['tokenization_strategy'], // To simulate missing strategy
};


describe('estimateInputTokens', () => {
  describe('Tiktoken Strategy (Non-ChatML)', () => {
    it('should estimate tokens for a simple string', () => {
      const text = 'Hello world example'; // 3 words/tokens by mock
      const tokens = estimateInputTokens(text, MOCK_MODEL_CONFIG_TIKTOKEN_NON_CHATML);
      expect(tokens).toBe(3);
    });

    it('should estimate tokens for an array of messages (concatenated content)', () => {
      const messages: MessageForTokenCounting[] = [
        { role: 'user', content: 'Hello there' }, // 2 tokens
        { role: 'assistant', content: 'General Kenobi' }, // 2 tokens
      ];
      // Expected: "Hello there\nGeneral Kenobi" -> 4 tokens by mock (if split by space, newline is one char)
      // Mock counts words: "Hello", "there", "General", "Kenobi" -> 4. Actual mock: "Hello there\nGeneral Kenobi" -> ["Hello", "there\nGeneral", "Kenobi"] -> 3
      const tokens = estimateInputTokens(messages, MOCK_MODEL_CONFIG_TIKTOKEN_NON_CHATML);
      expect(tokens).toBe(3); // Corrected: Was 4, actual is 3 due to newline consolidation
    });

    it('should return 0 for empty string', () => {
      const tokens = estimateInputTokens('', MOCK_MODEL_CONFIG_TIKTOKEN_NON_CHATML);
      expect(tokens).toBe(0);
    });
    
    it('should return 0 for empty messages array', () => {
      const tokens = estimateInputTokens([], MOCK_MODEL_CONFIG_TIKTOKEN_NON_CHATML);
      expect(tokens).toBe(0);
    });
  });

  describe('Tiktoken Strategy (ChatML)', () => {
    it('should estimate tokens for a single ChatML message', () => {
      const messages: MessageForTokenCounting[] = [
        { role: 'user', content: 'Just one message.' }, // "user" (1), "Just" (1), "one" (1), "message." (1) = 4
      ];
      // ChatML overhead:
      // Tokens per message: 3 (generic rule)
      // Role: 1 token for "user"
      // Content: 3 tokens for "Just one message." (mock splits by space, period attached)
      // Name: not present, so tokensPerName not added.
      // Total per message = 3 (base) + 1 (role) + 3 (content) = 7
      // End of ChatML: +3
      // Total: 7 + 3 = 10
      const tokens = estimateInputTokens(messages, MOCK_MODEL_CONFIG_TIKTOKEN_CHATML);
      expect(tokens).toBe(10); 
    });

    it('should estimate tokens for multiple ChatML messages with roles and names', () => {
      const messages: MessageForTokenCounting[] = [
        { role: 'system', content: 'System prompt.', name: 'config' }, // system(1), System(1), prompt.(1), config(1) = 4 content tokens + 1 name token
        { role: 'user', content: 'User input.' }, // user(1), User(1), input.(1) = 3 content tokens
      ];
      // Message 1 (system):
      //   tokensPerMessage = 3
      //   role ("system") = 1 token
      //   content ("System prompt.") = 2 tokens
      //   name ("config") = 1 token
      //   tokensPerName = 1
      //   Subtotal M1 = 3 + 1 + 2 + 1 + 1 = 8
      // Message 2 (user):
      //   tokensPerMessage = 3
      //   role ("user") = 1 token
      //   content ("User input.") = 2 tokens
      //   Subtotal M2 = 3 + 1 + 2 = 6
      // Total = 8 + 6 + 3 (end_of_prompt) = 17
      const tokens = estimateInputTokens(messages, MOCK_MODEL_CONFIG_TIKTOKEN_CHATML);
      expect(tokens).toBe(17);
    });

    it('should apply gpt-3.5-turbo-0301 specific ChatML rules if model name matches', () => {
        const config: AiModelExtendedConfig = {
            ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
            tokenization_strategy: {
                type: 'tiktoken',
                is_chatml_model: true,
                api_identifier_for_tokenization: 'gpt-3.5-turbo-0301' // Specific model
            }
        };
        const messages: MessageForTokenCounting[] = [{ role: 'user', content: 'Hello', name: 'test' }];
        // For gpt-3.5-turbo-0301:
        // tokensPerMessage = 4
        // tokensPerName = -1
        // Message 1:
        //   tokensPerMessage = 4
        //   role ("user") = 1
        //   content ("Hello") = 1
        //   name ("test") = 1
        //   tokensPerName = -1
        //   Subtotal M1 = 4 + 1 + 1 + 1 - 1 = 6
        // Total = 6 + 3 (end_of_prompt) = 9
        const tokens = estimateInputTokens(messages, config);
        expect(tokens).toBe(9);
    });

    it('should use encodingForModel when api_identifier_for_tokenization is provided for ChatML', () => {
        vi.mocked(getEncoding).mockClear(); // Reset call history
        vi.mocked(encodingForModel).mockClear(); // Reset call history

        const config: AiModelExtendedConfig = {
            ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
            tokenization_strategy: {
                type: 'tiktoken',
                is_chatml_model: true,
                api_identifier_for_tokenization: 'gpt-4', // Will use encodingForModel
                tiktoken_encoding_name: undefined, // Ensure this isn't used
            }
        };
        const messages: MessageForTokenCounting[] = [{ role: 'user', content: 'Test content' }];
        // tokensPerMessage = 3
        // role = 1 ("user")
        // content = 2 ("Test", "content")
        // total = 3 + 1 + 2 + 3 (suffix) = 9
        const tokens = estimateInputTokens(messages, config);
        expect(tokens).toBe(9);
        expect(vi.mocked(encodingForModel)).toHaveBeenCalledWith('gpt-4');
        expect(vi.mocked(getEncoding)).not.toHaveBeenCalled();
    });
    
    it('should use getEncoding when only tiktoken_encoding_name is provided for ChatML', () => {
        vi.mocked(getEncoding).mockClear(); // Reset call history
        vi.mocked(encodingForModel).mockClear(); // Reset call history

        const config: AiModelExtendedConfig = {
            ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
            tokenization_strategy: {
                type: 'tiktoken',
                is_chatml_model: true,
                tiktoken_encoding_name: 'cl100k_base',
                api_identifier_for_tokenization: undefined,
            }
        };
        const messages: MessageForTokenCounting[] = [{ role: 'user', content: 'Test content' }];
        const tokens = estimateInputTokens(messages, config);
        expect(tokens).toBe(9); // Same calculation as above test case
        expect(vi.mocked(getEncoding)).toHaveBeenCalledWith('cl100k_base');
        expect(vi.mocked(encodingForModel)).not.toHaveBeenCalled();
    });


  });

  describe('Rough Character Count Strategy', () => {
    it('should estimate tokens based on character count and ratio', () => {
      const text = 'This is a test sentence.'; // 24 chars
      // 24 chars / 4 ratio = 6, Math.ceil = 6
      const tokens = estimateInputTokens(text, MOCK_MODEL_CONFIG_ROUGH_CHAR_COUNT);
      expect(tokens).toBe(6); // Corrected: Was 7, actually 24 chars -> 6 tokens
    });

    it('should handle messages array by joining content', () => {
      const messages: MessageForTokenCounting[] = [
        { role: 'user', content: 'Line one.' }, // 9 chars
        { role: 'assistant', content: 'Line two.' }, // 9 chars
      ];
      // "Line one.\nLine two." = 9 + 1 (newline) + 9 = 19 chars
      // 19 chars / 4 ratio = 4.75, Math.ceil = 5
      const tokens = estimateInputTokens(messages, MOCK_MODEL_CONFIG_ROUGH_CHAR_COUNT);
      expect(tokens).toBe(5);
    });
  });
  
  describe('Fallback and Unknown Strategies', () => {
    it('should fall back to rough estimate if tokenization_strategy is missing', () => {
      const text = 'Test text here.'; // 15 chars
      // 15 chars / 4 (default DEFAULT_CHARS_PER_TOKEN) = 3.75, Math.ceil = 4
      const tokens = estimateInputTokens(text, MOCK_MODEL_CONFIG_NO_STRATEGY);
      expect(tokens).toBe(4);
    });

    it('should fall back to rough estimate for "unknown" strategy', () => {
      const text = 'Another test.'; // 13 chars
      // 13 chars / 4 = 3.25, Math.ceil = 4
      const tokens = estimateInputTokens(text, MOCK_MODEL_CONFIG_UNKNOWN_STRATEGY);
      expect(tokens).toBe(4);
    });

    it('should fall back for "provider_specific_api" strategy', () => {
        const config: AiModelExtendedConfig = {
            ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
            tokenization_strategy: { type: 'provider_specific_api' }
        };
        const text = "Provider specific"; // 17 chars
        // 17 / 4 = 4.25 -> 5
        const tokens = estimateInputTokens(text, config);
        expect(tokens).toBe(5);
    });
  });

  describe('Error Handling and Edge Cases for Tiktoken', () => {
    it('should throw error if tiktoken strategy selected but no encoding name or model ID (string input)', () => {
        const config: AiModelExtendedConfig = {
            ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
            tokenization_strategy: { type: 'tiktoken', is_chatml_model: false } // no encoding name or model id
        };
        expect(() => estimateInputTokens("test", config)).toThrow('Tiktoken strategy selected but no encoding name or model identifier provided.');
    });

    it('should throw error if tiktoken strategy (non-ChatML messages) but no encoding name or model ID', () => {
        const config: AiModelExtendedConfig = {
            ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
            tokenization_strategy: { type: 'tiktoken', is_chatml_model: false }
        };
        const messages: MessageForTokenCounting[] = [{role: 'user', content: 'test'}];
        expect(() => estimateInputTokens(messages, config)).toThrow('Tiktoken strategy (non-ChatML messages) but no encoding name or model ID.');
    });
    
    it('should throw error if tiktoken ChatML strategy selected but no model identifier or encoding name', () => {
        const config: AiModelExtendedConfig = {
            ...MOCK_MODEL_CONFIG_TIKTOKEN_CHATML,
            tokenization_strategy: { type: 'tiktoken', is_chatml_model: true } // No api_identifier_for_tokenization or tiktoken_encoding_name explicitly set to undefined here
        };
        // To properly test this, we need to ensure those fields are undefined in the object passed.
        const faultyConfig = JSON.parse(JSON.stringify(config)); // Deep clone
        delete faultyConfig.tokenization_strategy.api_identifier_for_tokenization;
        delete faultyConfig.tokenization_strategy.tiktoken_encoding_name;

        const messages: MessageForTokenCounting[] = [{role: 'user', content: 'test'}];
        expect(() => estimateInputTokens(messages, faultyConfig)).toThrow('Tiktoken ChatML strategy selected but no model identifier or encoding name for tokenization.');
    });


    it('should fallback to rough estimate if tiktoken encoding fails for string', () => {
      // Reset general mock and set specific mock for this test
      vi.mocked(getEncoding).mockImplementationOnce(() => { 
        throw new Error('Simulated encoding failure');
      });
      const text = 'Will fail encoding.'; // 19 chars
      // 19 / 4 = 4.75 -> 5
      const tokens = estimateInputTokens(text, MOCK_MODEL_CONFIG_TIKTOKEN_NON_CHATML);
      expect(tokens).toBe(5);
    });

    it('should fallback to rough estimate if tiktoken encoding fails for non-ChatML messages', () => {
        vi.mocked(getEncoding).mockImplementationOnce(() => {
            throw new Error('Simulated encoding failure');
        });
        const messages: MessageForTokenCounting[] = [{role: 'user', content: 'Content that fails'}]; // "Content that fails" = 18 chars
        // 18 / 4 = 4.5 -> 5
        const tokens = estimateInputTokens(messages, MOCK_MODEL_CONFIG_TIKTOKEN_NON_CHATML);
        expect(tokens).toBe(5);
    });
    
    it('should fallback to rough estimate if tiktoken encoding fails for ChatML messages', () => {
        // For ChatML, if api_identifier_for_tokenization is present, encodingForModel is used first.
        // If not, or if it fails, then getEncoding is used.
        // We need to decide which path to simulate failure for or mock both if necessary.
        // Let's assume MOCK_MODEL_CONFIG_TIKTOKEN_CHATML uses tiktoken_encoding_name, so mock getEncoding.
        vi.mocked(getEncoding).mockImplementationOnce(() => {
            throw new Error('Simulated encoding failure');
        });
        // If it was using api_identifier_for_tokenization, we would mock:
        // vi.mocked(encodingForModel).mockImplementationOnce(() => { throw new Error('Simulated encoding failure'); });

        const messages: MessageForTokenCounting[] = [{role: 'user', content: 'ChatML content fails'}]; // "ChatML content fails" = 20 chars
        // 20 / 4 = 5
        const tokens = estimateInputTokens(messages, MOCK_MODEL_CONFIG_TIKTOKEN_CHATML);
        expect(tokens).toBe(5);
    });


  });
});

describe('getMaxOutputTokens', () => {
  // Basic valid scenario
  it('should calculate max output tokens correctly with sufficient balance', () => {
    const userBalance = 1000; // wallet tokens
    const promptTokens = 100; // input prompt tokens
    const modelConfig: AiModelExtendedConfig = {
      input_token_cost_rate: 1,    // 1 wallet token per input token
      output_token_cost_rate: 2,   // 2 wallet tokens per output token
      hard_cap_output_tokens: 500, // Model's own hard cap
      tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added to satisfy type
    } as AiModelExtendedConfig;

    // Prompt cost = 100 * 1 = 100 wallet tokens
    // Budget for output = 1000 - 100 = 900 wallet tokens
    // Max spendable output tokens = 900 / 2 = 450 output tokens
    // 20% balance as output tokens = (0.20 * 1000) / 2 = 100 output tokens
    // Dynamic hard cap = min(100, 500) = 100
    // Result = min(450, 100) = 100
    const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig);
    expect(maxOutput).toBe(100);
  });

  // Scenario: Prompt cost exceeds balance
  it('should return 0 if prompt cost exceeds available balance', () => {
    const userBalance = 50;
    const promptTokens = 60;
    const modelConfig: AiModelExtendedConfig = {
      input_token_cost_rate: 1,
      output_token_cost_rate: 2,
      hard_cap_output_tokens: 500,
      tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
    } as AiModelExtendedConfig;
    // Prompt cost = 60 * 1 = 60. Budget for output = 50 - 60 = -10.
    const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig);
    expect(maxOutput).toBe(0);
  });

  // Scenario: Deficit allowed
  it('should allow deficit if specified', () => {
    const userBalance = 50;
    const promptTokens = 70; // cost = 70
    const deficitAllowed = 30; // effective balance = 50 + 30 = 80
    const modelConfig: AiModelExtendedConfig = {
      input_token_cost_rate: 1,
      output_token_cost_rate: 2, // budget for output = 80 - 70 = 10. Max spendable = 10/2 = 5
      hard_cap_output_tokens: 500, // 20% of 50 balance = (0.2 * 50)/2 = 5
      tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
    } as AiModelExtendedConfig;
    // Result = min(5, 5) = 5
    const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig, deficitAllowed);
    expect(maxOutput).toBe(5);
  });
  
    // Scenario: Model hard cap is the limiter
    it('should be limited by provider hard_cap_output_tokens if it is smallest', () => {
        const userBalance = 10000; // Large balance
        const promptTokens = 10;   // Small prompt cost = 10
        const modelConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1,
            output_token_cost_rate: 1, // Budget for output = 9990. Max spendable = 9990
            hard_cap_output_tokens: 50,   // Very small hard cap
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
        } as AiModelExtendedConfig;
        // 20% of 10000 balance = (0.2 * 10000)/1 = 2000. Dynamic cap = min(2000, 50) = 50
        // Result = min(9990, 50) = 50
        const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig);
        expect(maxOutput).toBe(50);
    });

    // Scenario: 20% rule is the limiter
    it('should be limited by the 20% balance rule if it is smallest', () => {
        const userBalance = 200; // Wallet tokens
        const promptTokens = 10;  // Input prompt tokens
        const modelConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1,    // Prompt cost = 10
            output_token_cost_rate: 1,   // Budget for output = 190. Max spendable = 190
            hard_cap_output_tokens: 1000, // Large hard cap
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
        } as AiModelExtendedConfig;
        // 20% of 200 balance = (0.2 * 200)/1 = 40. Dynamic cap = min(40, 1000) = 40
        // Result = min(190, 40) = 40
        const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig);
        expect(maxOutput).toBe(40);
    });


    // Error conditions
    it('should throw error for invalid input_token_cost_rate', () => {
        const baseModelConfig = { output_token_cost_rate: 1, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} } as AiModelExtendedConfig;
        expect(() => getMaxOutputTokens(100, 10, { ...baseModelConfig, input_token_cost_rate: -1 })).toThrow('Invalid input token cost rate.');
        // Test for undefined, though TypeScript should catch this if not for `as AiModelExtendedConfig`
        expect(() => getMaxOutputTokens(100, 10, { ...baseModelConfig, input_token_cost_rate: undefined as any })).toThrow('Invalid input token cost rate.');
    });

    it('should throw error for invalid output_token_cost_rate', () => {
        const baseModelConfig = { input_token_cost_rate: 1, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} } as AiModelExtendedConfig;
        expect(() => getMaxOutputTokens(100, 10, { ...baseModelConfig, output_token_cost_rate: 0 })).toThrow('Invalid output token cost rate.');
        expect(() => getMaxOutputTokens(100, 10, { ...baseModelConfig, output_token_cost_rate: -1 })).toThrow('Invalid output token cost rate.');
        // Test for undefined
        expect(() => getMaxOutputTokens(100, 10, { ...baseModelConfig, output_token_cost_rate: undefined as any })).toThrow('Invalid output token cost rate.');
    });

    it('should handle zero user balance correctly', () => {
        const userBalance = 0;
        const promptTokens = 10;
        const modelConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1, // cost = 10
            output_token_cost_rate: 1,
            hard_cap_output_tokens: 100,
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
        } as AiModelExtendedConfig;
        // Budget for output = 0 - 10 = -10. Returns 0.
        const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig);
        expect(maxOutput).toBe(0);
    });

    it('should handle negative user balance correctly', () => {
        const userBalance = -100;
        const promptTokens = 10; // cost = 10
        const modelConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1,
            output_token_cost_rate: 1,
            hard_cap_output_tokens: 100,
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
        } as AiModelExtendedConfig;
        // Budget for output = -100 - 10 = -110. Returns 0.
        const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig);
        expect(maxOutput).toBe(0);
    });
    
    it('should handle negative user balance with deficit that makes effective balance positive, but 20% rule still limits to 0', () => {
        const userBalance = -50;
        const promptTokens = 10; // cost = 10
        const deficitAllowed = 100; // effective balance = -50 + 100 = 50
        const modelConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1,
            output_token_cost_rate: 1, // budget for output = 50 - 10 = 40. Max spendable = 40
            hard_cap_output_tokens: 500,
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
        } as AiModelExtendedConfig;
        // 20% of -50 balance (non_negative_dynamic_hard_cap makes it 0) = 0. Dynamic cap = min(0, 500) = 0.
        // Result = min(40, 0) = 0
        const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig, deficitAllowed);
        expect(maxOutput).toBe(0); // Because dynamic_hard_cap is based on original balance which is negative
    });

    it('should ensure non_negative_dynamic_hard_cap works if original balance is negative (output 0)', () => {
        const userBalance = -100; // Results in dynamic_hard_cap component being <=0
        const promptTokens = 1;
        const modelConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1,
            output_token_cost_rate: 1,
            hard_cap_output_tokens: 100,
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base'} // Added
        } as AiModelExtendedConfig;
        const deficit = 200; // Effective balance = 100. Prompt cost = 1. Budget for output = 99. Max spendable = 99
        // 20% of -100 = -20. non_negative_dynamic_hard_cap -> 0. provider_hard_cap = 100. min(0,100) = 0
        // result min(99, 0) = 0
        const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig, deficit);
        expect(maxOutput).toBe(0);
    });

    it('should return 0 if hard_cap_output_tokens is 0', () => {
        const userBalance = 1000;
        const promptTokens = 10;
        const modelConfig: AiModelExtendedConfig = {
            input_token_cost_rate: 1,
            output_token_cost_rate: 1,
            hard_cap_output_tokens: 0, // Explicitly 0
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } 
        } as AiModelExtendedConfig;
        // Max spendable = (1000 - 10)/1 = 990
        // 20% balance as output tokens = (0.2 * 1000)/1 = 200
        // Dynamic hard cap = min(200, 0) = 0
        // Result = min(990, 0) = 0
        const maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfig);
        expect(maxOutput).toBe(0);
    });

    it('should use Infinity for hard_cap_output_tokens if not provided or invalid, effectively not limiting beyond affordability/20% rule', () => {
        const userBalance = 1000;
        const promptTokens = 100;
        const modelConfigNoHardCap: AiModelExtendedConfig = {
            input_token_cost_rate: 1,
            output_token_cost_rate: 2,
            // hard_cap_output_tokens: undefined, // Simulate not set
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
        } as AiModelExtendedConfig;
        // Prompt cost = 100, budget = 900, max spendable = 450
        // 20% balance = 100. Dynamic cap = min(100, Infinity) = 100
        // Result = min(450, 100) = 100
        let maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfigNoHardCap);
        expect(maxOutput).toBe(100);

        const modelConfigNegativeHardCap: AiModelExtendedConfig = {
            input_token_cost_rate: 1,
            output_token_cost_rate: 2,
            hard_cap_output_tokens: -100, // Invalid, should be treated as Infinity
            tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
        } as AiModelExtendedConfig;
        maxOutput = getMaxOutputTokens(userBalance, promptTokens, modelConfigNegativeHardCap);
        expect(maxOutput).toBe(100);
    });

}); 