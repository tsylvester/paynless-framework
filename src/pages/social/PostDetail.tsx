import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { PostCard } from '../../components/social/PostCard';
import { CommentsList } from '../../components/social/CommentsList';
import { CreateCommentForm } from '../../components/social/CreateCommentForm';
import { socialService } from '../../services/social.service';
import { Post, Comment } from '../../types/post.types';
import { logger } from '../../utils/logger';
import { ArrowLeft, Loader } from 'lucide-react';

export function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingPost, setIsLoadingPost] = useState(true);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentCursor, setCommentCursor] = useState<string | undefined>(undefined);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  
  // Load post details
  useEffect(() => {
    const loadPost = async () => {
      if (!postId) return;
      
      try {
        setIsLoadingPost(true);
        
        // In a real implementation, we would have a dedicated getPost method
        // Since we're using the existing social service, we'll adapt
        const userPostsResult = await socialService.getUserPosts(postId);
        
        if (userPostsResult && userPostsResult.posts.length > 0) {
          const foundPost = userPostsResult.posts.find(p => p.id === postId);
          if (foundPost) {
            setPost(foundPost);
          } else {
            setError('Post not found');
          }
        } else {
          setError('Failed to load post. Please try again.');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(errorMessage);
        logger.error('Error loading post', {
          error: errorMessage,
          postId,
        });
      } finally {
        setIsLoadingPost(false);
      }
    };
    
    loadPost();
  }, [postId]);
  
  // Load comments
  const loadComments = async (shouldReset = false) => {
    if (!postId) return;
    
    try {
      const fetchCursor = shouldReset ? undefined : commentCursor;
      if (shouldReset) {
        setIsLoadingComments(true);
      } else {
        setIsLoadingMoreComments(true);
      }
      
      const commentsResult = await socialService.getComments(postId, fetchCursor);
      
      if (commentsResult) {
        if (shouldReset) {
          setComments(commentsResult.comments);
        } else {
          setComments(prevComments => [...prevComments, ...commentsResult.comments]);
        }
        
        setCommentCursor(commentsResult.pagination.nextCursor);
        setHasMoreComments(commentsResult.pagination.hasMore);
      } else {
        setError('Failed to load comments. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error loading comments', {
        error: errorMessage,
        postId,
      });
    } finally {
      setIsLoadingComments(false);
      setIsLoadingMoreComments(false);
    }
  };
  
  // Load comments on initial render
  useEffect(() => {
    if (postId) {
      loadComments(true);
    }
  }, [postId]);
  
  // Handle comment created
  const handleCommentCreated = () => {
    loadComments(true);
    // Also refresh the post to update comment count
    if (post) {
      setPost({
        ...post,
        commentCount: post.commentCount + 1,
      });
    }
  };
  
  // Handle post reaction changes
  const handleReactionChange = () => {
    if (postId) {
      // In a real implementation, we would refresh just the post
      const userPostsResult = socialService.getUserPosts(postId);
    }
  };
  
  if (isLoadingPost) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex justify-center items-center py-12">
            <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
          </div>
        </div>
      </Layout>
    );
  }
  
  if (error || !post) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
            {error || 'Post not found'}
          </div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back
          </button>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-indigo-600 hover:text-indigo-800 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back
        </button>
        
        <PostCard post={post} onReactionChange={handleReactionChange} />
        
        <div className="bg-white rounded-lg shadow-md p-4 mt-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Comments</h2>
          
          <div className="mb-6">
            <CreateCommentForm 
              postId={post.id} 
              onCommentCreated={handleCommentCreated} 
            />
          </div>
          
          <CommentsList
            comments={comments}
            isLoading={isLoadingComments}
            hasMore={hasMoreComments}
            onLoadMore={() => loadComments()}
          />
        </div>
      </div>
    </Layout>
  );
}
