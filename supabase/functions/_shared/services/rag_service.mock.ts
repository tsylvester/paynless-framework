// supabase/functions/_shared/services/rag_service.mock.ts
import type { IRagService, IRagContextResult, IRagSourceDocument } from './rag_service.interface.ts';
import type { AiModelExtendedConfig } from '../types.ts';
import { RagServiceError } from '../utils/errors.ts';

export interface MockRagServiceConfig {
    mockContextResult?: string;
    shouldThrowError?: boolean;
    errorMessage?: string;
}

export class MockRagService implements IRagService {
    private config: MockRagServiceConfig;

    constructor(config: MockRagServiceConfig = {}) {
        this.config = {
            mockContextResult: 'Mocked RAG context',
            shouldThrowError: false,
            errorMessage: 'Mock RAG service error',
            ...config,
        };
    }

    public async getContextForModel(
        _sourceDocuments: IRagSourceDocument[],
        _modelConfig: AiModelExtendedConfig,
        _sessionId: string,
    ): Promise<IRagContextResult> {
        if (this.config.shouldThrowError) {
            return {
                context: null,
                error: new RagServiceError(this.config.errorMessage!),
            };
        }

        return Promise.resolve({
            context: this.config.mockContextResult!,
        });
    }

    public setConfig(newConfig: MockRagServiceConfig): void {
        this.config = { ...this.config, ...newConfig };
    }
}