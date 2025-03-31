import React from 'react';
import { AIModel, AIModelCardProps } from '../../types/ai.types';
import { Bot, Check } from 'lucide-react';

export function AIModelCard({ model, isSelected, onClick }: AIModelCardProps) {
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
            <Bot className={`h-5 w-5 ${isSelected ? 'text-indigo-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">{model.name}</h3>
            <p className="text-xs text-gray-500">{model.modelId}</p>
          </div>
        </div>
        
        {isSelected && (
          <div className="absolute top-2 right-2">
            <Check className="h-5 w-5 text-indigo-600" />
          </div>
        )}
      </div>
      
      <div className="mt-3 space-y-2">
        <div className="flex items-center text-xs text-gray-500">
          <span>Max Tokens: {model.maxTokens.toLocaleString()}</span>
          <span className="mx-2">•</span>
          <span>Context: {model.contextWindow.toLocaleString()}</span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {model.capabilities.map((capability) => (
            <span
              key={capability}
              className={`px-2 py-0.5 text-xs rounded-full ${
                isSelected
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {capability}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}