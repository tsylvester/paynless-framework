// supabase/functions/_shared/services/rag_service.mock.ts
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { IRagService, IRagContextResult, IRagSourceDocument } from './rag_service.interface.ts';
import type { AiModelExtendedConfig } from '../types.ts';
import { RagServiceError } from '../utils/errors.ts';

export interface MockRagServiceConfig {
    mockContextResult?: string;
    shouldThrowError?: boolean;
    errorMessage?: string;
}

export class MockRagService implements IRagService {
    // Let TypeScript infer the complex type of the spy.
    // The `implements IRagService` clause already enforces the method's signature.
    public getContextForModelSpy;
    private config: MockRagServiceConfig;

    constructor(config: MockRagServiceConfig = {}) {
        this.config = {
            mockContextResult: 'Mocked RAG context',
            shouldThrowError: false,
            errorMessage: 'Mock RAG service error',
            ...config,
        };
        this.getContextForModelSpy = spy(this, 'getContextForModel');
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

        return {
            context: this.config.mockContextResult!,
        };
    }

    public setConfig(newConfig: MockRagServiceConfig): void {
        this.config = { ...this.config, ...newConfig };
    }
}
