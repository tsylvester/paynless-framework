import React from 'react';
import { SystemPromptCardProps } from '../../types/ai.types';
import { MessageSquare, Check } from 'lucide-react';

export function SystemPromptCard({ prompt, isSelected, onClick }: SystemPromptCardProps) {
  return (
    <div
      className={`relative p-4 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-100' : 'bg-gray-100'}`}>
            <MessageSquare className={`h-5 w-5 ${isSelected ? 'text-indigo-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">{prompt.name}</h3>
            <p className="text-xs text-gray-500">{prompt.category}</p>
          </div>
        </div>
        
        {isSelected && (
          <div className="absolute top-2 right-2">
            <Check className="h-5 w-5 text-indigo-600" />
          </div>
        )}
      </div>
      
      {prompt.description && (
        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{prompt.description}</p>
      )}
    </div>
  );
}