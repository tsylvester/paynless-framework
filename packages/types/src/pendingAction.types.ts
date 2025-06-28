export interface PendingAction<T> {
  endpoint: string; // A unique key identifying the target API, e.g., 'chat', 'dialectic'
  method: string; // The HTTP method, e.g., 'POST'
  body: T; // The payload for the action
  returnPath?: string; // Optional URL to navigate to after successful replay
} 