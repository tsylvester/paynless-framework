import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { AISelectionProps, AIModel, SystemPrompt } from '../../types/ai.types';
import { AIModelCard } from './AIModelCard';
import { SystemPromptCard } from './SystemPromptCard';
import { aiService } from '../../services/ai';
import { logger } from '../../utils/logger';

export function AISelection({
  onModelSelect,
  onPromptSelect,
  selectedModelId,
  selectedPromptId,
  category,
  className = '',
}: AISelectionProps) {
  // Fetch AI models
  const { data: models = [], isLoading: isLoadingModels } = useQuery(
    'ai-models',
    async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai/models`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            },
          }
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch AI models');
        }
        
        const data = await response.json();
        return data.models;
      } catch (error) {
        logger.error('Error fetching AI models', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
      }
    }
  );
  
  // Fetch system prompts
  const { data: prompts = [], isLoading: isLoadingPrompts } = useQuery(
    ['system-prompts', category],
    async () => {
      try {
        let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai/prompts`;
        if (category) {
          url += `?category=${encodeURIComponent(category)}`;
        }
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          },
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch system prompts');
        }
        
        const data = await response.json();
        return data.prompts;
      } catch (error) {
        logger.error('Error fetching system prompts', {
          error: error instanceof Error ? error.message : 'Unknown error',
          category,
        });
        return [];
      }
    }
  );
  
  // Set initial selections
  useEffect(() => {
    if (!selectedModelId && models.length > 0) {
      onModelSelect(models[0]);
    }
    if (!selectedPromptId && prompts.length > 0) {
      onPromptSelect(prompts[0]);
    }
  }, [models, prompts, selectedModelId, selectedPromptId]);
  
  if (isLoadingModels || isLoadingPrompts) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-24 bg-gray-200 rounded-lg"></div>
          <div className="h-24 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`space-y-6 ${className}`}>
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Select AI Model</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {models.map((model) => (
            <AIModelCard
              key={model.id}
              model={model}
              isSelected={model.id === selectedModelId}
              onClick={() => onModelSelect(model)}
            />
          ))}
        </div>
      </div>
      
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Select System Prompt</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {prompts.map((prompt) => (
            <SystemPromptCard
              key={prompt.id}
              prompt={prompt}
              isSelected={prompt.id === selectedPromptId}
              onClick={() => onPromptSelect(prompt)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}