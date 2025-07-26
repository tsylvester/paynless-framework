export class ContextWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextWindowError';
  }
} 