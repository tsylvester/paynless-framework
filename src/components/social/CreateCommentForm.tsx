import React, { useState } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { socialService } from '../../services/social.service';
import { logger } from '../../utils/logger';
import ReactTextareaAutosize from 'react-textarea-autosize';

interface CreateCommentFormProps {
  postId: string;
  onCommentCreated: () => void;
}

export function CreateCommentForm({ postId, onCommentCreated }: CreateCommentFormProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const comment = await socialService.createComment(postId, content);
      
      if (comment) {
        setContent('');
        onCommentCreated();
        logger.info('Comment created successfully');
      } else {
        setError('Failed to create comment. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error creating comment', {
        error: errorMessage,
        postId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="flex space-x-3">
      <div className="flex-shrink-0">
        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
          {user?.avatarUrl ? (
            <img 
              src={user.avatarUrl} 
              alt={user.firstName || user.email} 
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <User className="h-5 w-5 text-gray-500" />
          )}
        </div>
      </div>
      <div className="flex-1">
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-2 text-xs text-red-600">
              {error}
            </div>
          )}
          
          <ReactTextareaAutosize
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a comment..."
            className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            minRows={1}
          />
          
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className={`px-3 py-1 rounded-md text-sm ${
                isSubmitting || !content.trim()
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isSubmitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}