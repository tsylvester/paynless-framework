import type { AiProvider } from '@paynless/types';

export const DUMMY_PROVIDER_ID = 'dummy-test-provider';
export const DUMMY_MODEL_ID = 'dummy-echo-v1';

export const dummyProviderDefinition: AiProvider = {
    id: DUMMY_PROVIDER_ID,
    name: 'Dummy Test Provider (Echo)',
    api_identifier: DUMMY_PROVIDER_ID, // Or DUMMY_MODEL_ID if api_identifier is model-specific
    provider: 'dummy', // Custom type for categorization
    is_active: true,
    is_enabled: true,
    created_at: new Date().toISOString(), // Mocked timestamp
    updated_at: new Date().toISOString(), // Mocked timestamp
    description: 'Echoes user input for development and testing purposes.',
    config: { // Assuming models are listed in config
        models: [
            {
                id: DUMMY_MODEL_ID,
                name: 'Dummy Echo Model v1',
                // other model properties if your UI expects them from here
            }
        ]
    }
    // Ensure all other non-nullable fields from AiProvider['Row'] are present
    // For AiProvider from types_db.ts, all required fields seem covered or nullable.
}; 