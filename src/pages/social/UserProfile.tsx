import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { UserProfileHeader } from '../../components/social/UserProfileHeader';
import { PostCard } from '../../components/social/PostCard';
import { socialService } from '../../services/social/index';
import { profileService } from '../../services/profile.service';
import { Post } from '../../types/post.types';
import { UserProfile } from '../../types/auth.types';
import { FollowerCount } from '../../types/relationship.types';
import { logger } from '../../utils/logger';
import { useAuth } from '../../hooks/useAuth';
import { Loader } from 'lucide-react';

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [followerCounts, setFollowerCounts] = useState<FollowerCount | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isCurrentUser, setIsCurrentUser] = useState(false);
  
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Check if this is the current user's profile
  useEffect(() => {
    if (userId && user) {
      setIsCurrentUser(userId === user.id);
    }
  }, [userId, user]);
  
  // Load user profile
  useEffect(() => {
    const loadProfile = async () => {
      if (!userId) return;
      
      try {
        setIsLoadingProfile(true);
        
        const userProfile = await profileService.getProfile(userId);
        
        if (userProfile) {
          setProfile(userProfile);
        } else {
          setError('User profile not found');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(errorMessage);
        logger.error('Error loading user profile', {
          error: errorMessage,
          userId,
        });
      } finally {
        setIsLoadingProfile(false);
      }
    };
    
    loadProfile();
  }, [userId]);
  
  // Load follower counts and check if current user is following
  useEffect(() => {
    const loadFollowerData = async () => {
      if (!userId || !user) return;
      
      try {
        // Load follower counts
        const counts = await socialService.getFollowerCounts(userId);
        if (counts) {
          setFollowerCounts(counts);
        }
        
        // Check if current user is following this user
        if (!isCurrentUser) {
          const following = await socialService.checkIfFollowing(userId);
          setIsFollowing(following);
        }
      } catch (err) {
        logger.error('Error loading follower data', {
          error: err instanceof Error ? err.message : 'Unknown error',
          userId,
        });
      }
    };
    
    loadFollowerData();
  }, [userId, user, isCurrentUser]);
  
  // Load user posts
  const loadPosts = async (shouldReset = false) => {
    if (!userId) return;
    
    try {
      const fetchCursor = shouldReset ? undefined : cursor;
      if (shouldReset) {
        setIsLoadingPosts(true);
      } else {
        setIsLoadingMore(true);
      }
      
      const userPostsResult = await socialService.getUserPosts(userId, fetchCursor);
      
      if (userPostsResult) {
        if (shouldReset) {
          setPosts(userPostsResult.posts);
        } else {
          setPosts(prevPosts => [...prevPosts, ...userPostsResult.posts]);
        }
        
        setCursor(userPostsResult.pagination.nextCursor);
        setHasMore(userPostsResult.pagination.hasMore);
      } else {
        setError('Failed to load posts. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error loading user posts', {
        error: errorMessage,
        userId,
      });
    } finally {
      setIsLoadingPosts(false);
      setIsLoadingMore(false);
    }
  };
  
  // Load posts on initial render
  useEffect(() => {
    if (userId) {
      loadPosts(true);
    }
  }, [userId]);
  
  // Handle follow status change
  const handleFollowChange = async () => {
    if (!userId) return;
    
    // Toggle follow status
    setIsFollowing(!isFollowing);
    
     // Reload follower counts
    const counts = await socialService.getFollowerCounts(userId);
    if (counts) {
      setFollowerCounts(counts);
    }
  };
  
  // Handle post reaction changes
  const handleReactionChange = () => {
    loadPosts(true);
  };
  
  if (isLoadingProfile) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex justify-center items-center py-12">
            <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
          </div>
        </div>
      </Layout>
    );
  }
  
  if (error || !profile) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
            {error || 'User profile not found'}
          </div>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <UserProfileHeader
          profile={profile}
          followerCounts={followerCounts}
          isFollowing={isFollowing}
          isCurrentUser={isCurrentUser}
          onFollowChange={handleFollowChange}
        />
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Posts</h2>
          
          {isLoadingPosts ? (
            <div className="py-8 flex justify-center">
              <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-2">No posts yet</h3>
              <p className="text-gray-500">
                {isCurrentUser 
                  ? 'Create your first post to share with your followers!'
                  : 'This user hasn\'t shared any posts yet.'}
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
                    onClick={() => loadPosts()}
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
      </div>
    </Layout>
  );
}