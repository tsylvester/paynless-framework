export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  userId?: string;  // Optional user ID for user messages
  userName?: string;  // Optional display name for user messages
  timestamp?: string;  // Optional timestamp for message ordering
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
  conversationId?: string | null;
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
  navigateToAuth: (path?: string) => void;
  conversationId: string | null;
}

// Add a new type for chat participants
export interface ChatParticipant {
  userId: string;
  userName: string;
  joinedAt: string;
  lastActive?: string;
}

// Add a new type for chat sessions
export interface ChatSession {
  sessionId: string;
  participants: ChatParticipant[];
  createdBy: string;
  createdAt: string;
  lastActive: string;
  isActive: boolean;
}