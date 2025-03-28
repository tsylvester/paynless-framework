export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SystemPrompt {
  prompt_id: string;
  name: string;
  description: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  tag?: string;
}

export interface ChatRequest {
  prompt: string;
  systemPromptName?: string;
  previousMessages?: ChatMessage[];
}

export interface ChatResponse {
  response: string;
  messages: ChatMessage[];
}

export interface UserEvent {
  event_id: string;
  user_id: string;
  event_type: string;
  created_at: string;
  event_description: string;
  event_details: ChatEventDetails;
}

export interface ChatEventDetails {
  prompt: string;
  systemPromptName: string;
  response: string;
  timestamp: string;
  messages?: ChatMessage[];
}

// In src/types/chat.types.ts
export interface ChatContextType {
  messages: ChatMessage[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (message: string, systemPromptName?: string) => Promise<void>;
  clearChat: () => void;
  systemPrompts: SystemPrompt[];
  selectedPrompt: string;
  setSelectedPrompt: (promptName: string) => void;
  navigateToAuth: (path?: string) => void; // Add this new function
}