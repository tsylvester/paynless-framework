// In supabase/functions/_shared/utils/errors.ts
export class ContextWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextWindowError';
  }
}

export class IndexingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IndexingError';
    }
}

export class RagServiceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RagServiceError';
    }
}

export class NotImplementedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotImplementedError';
    }
}

export class RenderJobValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RenderJobValidationError';
    }
}

export class RenderJobEnqueueError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RenderJobEnqueueError';
    }
}