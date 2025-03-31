import React, { useState } from 'react';
import { Send, Bot, X } from 'lucide-react';
import { socialService } from '../../services/social.service';
import { aiService } from '../../services/ai';
import { logger } from '../../utils/logger';
import ReactTextareaAutosize from 'react-textarea-autosize';
import { AISelection } from '../ai/AISelection';
import { AIModel, SystemPrompt } from '../../types/ai.types';

interface SendMessageFormProps {
  recipientId: string;
  onMessageSent: () => void;
}

export function SendMessageForm({ recipientId, onMessageSent }: SendMessageFormProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAIAssist, setShowAIAssist] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPrompt | null>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const message = await socialService.sendMessage(recipientId, content);
      
      if (message) {
        setContent('');
        onMessageSent();
        logger.info('Message sent successfully');
      } else {
        setError('Failed to send message. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error sending message', {
        error: errorMessage,
        recipientId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleAIAssist = async () => {
    if (!selectedModel || !selectedPrompt || !content.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await aiService.generateText(content, selectedModel.id, selectedPrompt.id);
      
      if (response.error) {
        setError(response.error.message);
      } else {
        setContent(response.content);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error getting AI assistance', {
        error: errorMessage,
        modelId: selectedModel.id,
        promptId: selectedPrompt.id,
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 bg-white">
      {error && (
        <div className="mb-2 text-xs text-red-600 p-2 bg-red-50 rounded">
          {error}
        </div>
      )}
      
      {showAIAssist && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-900">AI Assistance</h3>
            <button
              type="button"
              onClick={() => setShowAIAssist(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <AISelection
            onModelSelect={setSelectedModel}
            onPromptSelect={setSelectedPrompt}
            selectedModelId={selectedModel?.id}
            selectedPromptId={selectedPrompt?.id}
            category="chat"
            className="mb-4"
          />
          
          <button
            type="button"
            onClick={handleAIAssist}
            disabled={isSubmitting || !content.trim() || !selectedModel || !selectedPrompt}
            className={`w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm ${
              isSubmitting || !content.trim() || !selectedModel || !selectedPrompt
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'text-white bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isSubmitting ? 'Processing...' : 'Get AI Assistance'}
          </button>
        </div>
      )}
      
      <div className="flex items-end space-x-2">
        <div className="flex-1">
          <ReactTextareaAutosize
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            className="w-full border border-gray-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            minRows={1}
            maxRows={5}
          />
        </div>
        
        <button
          type="button"
          onClick={() => setShowAIAssist(!showAIAssist)}
          className={`p-2 rounded-full ${
            showAIAssist ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Bot className="h-5 w-5" />
        </button>
        
        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          className={`p-2 rounded-full ${
            isSubmitting || !content.trim()
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}