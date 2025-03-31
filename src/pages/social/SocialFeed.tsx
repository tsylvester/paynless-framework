import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/layout/Layout';
import { CreatePostForm } from '../../components/social/CreatePostForm';
import { PostCard } from '../../components/social/PostCard';
import { socialService } from '../../services/social';
import { Post } from '../../types/post.types';
import { logger } from '../../utils/logger';
import { Loader } from 'lucide-react';

export function SocialFeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Load posts from the timeline
  const loadPosts = async (shouldReset = false) => {
    try {
      const fetchCursor = shouldReset ? undefined : cursor;
      if (shouldReset) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      const timelineResult = await socialService.getTimeline(fetchCursor);
      
      if (timelineResult) {
        if (shouldReset) {
          setPosts(timelineResult.posts || []);
        } else {
          setPosts(prevPosts => [...prevPosts, ...(timelineResult.posts || [])]);
        }
        
        setCursor(timelineResult.pagination?.nextCursor);
        setHasMore(timelineResult.pagination?.hasMore || false);
      } else {
        setError('Failed to load posts. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error loading timeline', {
        error: errorMessage,
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };
  
  // Load posts on initial render
  useEffect(() => {
    loadPosts(true);
  }, []);
  
  // Handle post creation
  const handlePostCreated = () => {
    loadPosts(true);
  };
  
  // Handle loading more posts
  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore) return;
    loadPosts();
  };
  
  // Handle post reaction changes
  const handleReactionChange = () => {
    loadPosts(true);
  };
  
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Social Feed</h1>
        
        <CreatePostForm onPostCreated={handlePostCreated} />
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No posts yet</h3>
            <p className="text-gray-500">
              Create your first post or follow other users to see their posts here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onReactionChange={handleReactionChange}
              />
            ))}
            
            {hasMore && (
              <div className="text-center py-4">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 ${
                    isLoadingMore ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isLoadingMore ? (
                    <span className="flex items-center">
                      <Loader className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}