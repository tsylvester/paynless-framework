import React, { useState } from 'react';
import { User, Lock, Globe, Users, Bot, X } from 'lucide-react';
import { socialService } from '../../services/social.service';
import { aiService } from '../../services/ai';
import { PostVisibility } from '../../types/post.types';
import { AIModel, SystemPrompt } from '../../types/ai.types';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../utils/logger';
import ReactTextareaAutosize from 'react-textarea-autosize';
import { AISelection } from '../ai/AISelection';

interface CreatePostFormProps {
  onPostCreated: () => void;
}

export function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>(PostVisibility.PUBLIC);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAIAssist, setShowAIAssist] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPrompt | null>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      setError('Post content cannot be empty');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const post = await socialService.createPost(content, visibility);
      
      if (post) {
        setContent('');
        onPostCreated();
        logger.info('Post created successfully');
      } else {
        setError('Failed to create post. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error creating post', {
        error: errorMessage,
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
  
  const getVisibilityIcon = () => {
    switch (visibility) {
      case PostVisibility.PUBLIC:
        return <Globe className="h-4 w-4 text-green-500" />;
      case PostVisibility.FOLLOWERS:
        return <Users className="h-4 w-4 text-blue-500" />;
      case PostVisibility.PRIVATE:
        return <Lock className="h-4 w-4 text-gray-500" />;
      default:
        return <Globe className="h-4 w-4 text-green-500" />;
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
          {user?.avatarUrl ? (
            <img 
              src={user.avatarUrl} 
              alt={user.firstName || user.email} 
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <User className="h-6 w-6 text-gray-500" />
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900">
            {user?.firstName} {user?.lastName}
          </p>
          <div 
            className="flex items-center space-x-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-full cursor-pointer"
            onClick={() => {
              const nextVisibility = {
                [PostVisibility.PUBLIC]: PostVisibility.FOLLOWERS,
                [PostVisibility.FOLLOWERS]: PostVisibility.PRIVATE,
                [PostVisibility.PRIVATE]: PostVisibility.PUBLIC,
              }[visibility];
              setVisibility(nextVisibility);
            }}
          >
            {getVisibilityIcon()}
            <span className="capitalize">{visibility}</span>
          </div>
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-3 text-sm text-red-600 p-2 bg-red-50 rounded">
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
              category="writing"
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
        
        <ReactTextareaAutosize
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full border border-gray-300 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          minRows={3}
        />
        
        <div className="flex justify-between items-center mt-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              className="px-3 py-1 text-gray-500 hover:text-gray-700 flex items-center space-x-1"
            >
              <span>Add Photo</span>
            </button>
            
            <button
              type="button"
              onClick={() => setShowAIAssist(!showAIAssist)}
              className={`px-3 py-1 flex items-center space-x-1 rounded-md ${
                showAIAssist 
                  ? 'bg-indigo-100 text-indigo-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Bot className="h-5 w-5" />
              <span>AI Assist</span>
            </button>
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className={`px-4 py-2 rounded-lg ${
              isSubmitting || !content.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isSubmitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}