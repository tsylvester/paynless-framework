/**
 * AI Model Types
 */
export enum AIModelType {
  OPENAI = 'openai',
  PERPLEXITY = 'perplexity',
  CLAUDE = 'claude',
  DEEPSEEK = 'deepseek',
  GEMINI = 'gemini',
  COPILOT = 'copilot',
}

export enum AIModelCapability {
  TEXT = 'text',
  CHAT = 'chat',
  IMAGE = 'image',
  CODE = 'code',
  AUDIO = 'audio',
}

export interface AIProvider {
  id: string;
  name: string;
  type: AIModelType;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AIModel {
  id: string;
  providerId: string;
  modelId: string;
  name: string;
  capabilities: AIModelCapability[];
  maxTokens: number;
  contextWindow: number;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SystemPrompt {
  id: string;
  name: string;
  description: string | null;
  content: string;
  category: string;
  isEnabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AIModelConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  model: AIModel;
  messages: AIMessage[];
  config?: AIModelConfig;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface AIModelProvider {
  getModels(): Promise<AIModel[]>;
  generateText(request: AIRequest): Promise<AIResponse>;
  generateChat(request: AIRequest): Promise<AIResponse>;
  generateImage?(prompt: string, config?: AIModelConfig): Promise<string>;
  generateCode?(prompt: string, config?: AIModelConfig): Promise<string>;
  transcribeAudio?(audioData: Blob): Promise<string>;
}

export interface AIFeatureConfig {
  enabled: boolean;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
}

export interface AIFeatures {
  chat: AIFeatureConfig;
  posts: AIFeatureConfig;
  code: AIFeatureConfig;
  images: AIFeatureConfig;
}

export interface AISelectionProps {
  onModelSelect: (model: AIModel) => void;
  onPromptSelect: (prompt: SystemPrompt) => void;
  selectedModelId?: string;
  selectedPromptId?: string;
  category?: string;
  className?: string;
}

export interface AIModelCardProps {
  model: AIModel;
  isSelected: boolean;
  onClick: () => void;
}

export interface SystemPromptCardProps {
  prompt: SystemPrompt;
  isSelected: boolean;
  onClick: () => void;
}