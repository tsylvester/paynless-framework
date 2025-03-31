import React from 'react';
import { User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Comment } from '../../types/post.types';
import { Link } from 'react-router-dom';

interface CommentsListProps {
  comments: Comment[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function CommentsList({ comments, isLoading, hasMore, onLoadMore }: CommentsListProps) {
  if (isLoading && comments.length === 0) {
    return (
      <div className="py-4 text-center text-gray-500">
        <div className="animate-pulse flex flex-col space-y-4">
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }
  
  if (comments.length === 0) {
    return (
      <div className="py-4 text-center text-gray-500">
        No comments yet. Be the first to comment!
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <div key={comment.id} className="flex space-x-3">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
              {comment.user?.avatarUrl ? (
                <img
                  src={comment.user.avatarUrl}
                  alt={`${comment.user.firstName} ${comment.user.lastName}`}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <User className="h-5 w-5 text-gray-500" />
              )}
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex items-center mb-1">
                <Link
                  to={`/social/profile/${comment.userId}`}
                  className="font-medium text-gray-900 text-sm hover:underline"
                >
                  {comment.user 
                    ? `${comment.user.firstName} ${comment.user.lastName}` 
                    : 'Anonymous User'}
                </Link>
                <span className="ml-2 text-xs text-gray-500">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-gray-800 text-sm">{comment.content}</p>
            </div>
          </div>
        </div>
      ))}
      
      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className={`px-4 py-2 text-sm text-indigo-600 hover:text-indigo-800 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Loading...' : 'Load more comments'}
          </button>
        </div>
      )}
    </div>
  );
}