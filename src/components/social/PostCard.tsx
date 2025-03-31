import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, MoreHorizontal, User, ThumbsUp, HeartCrack } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Post, ReactionType } from '../../types/post.types';
import { useAuth } from '../../hooks/useAuth';
import { socialService } from '../../services/social.service';
import { logger } from '../../utils/logger';

interface PostCardProps {
  post: Post;
  onReactionChange?: () => void;
}

export function PostCard({ post, onReactionChange }: PostCardProps) {
  const { user } = useAuth();
  const [isReacting, setIsReacting] = useState(false);
  const [hasReacted, setHasReacted] = useState(false);
  const [reactionType, setReactionType] = useState<ReactionType | null>(null);
  const [showReactionOptions, setShowReactionOptions] = useState(false);
  
  // Check if the user has already reacted to this post
  React.useEffect(() => {
    const checkReaction = async () => {
      try {
        const response = await socialService.checkIfReacted(post.id);
        if (response) {
          setHasReacted(response.hasReacted);
          if (response.hasReacted && response.reaction) {
            setReactionType(response.reaction.type as ReactionType);
          }
        }
      } catch (error) {
        logger.error('Error checking reaction', {
          error: error instanceof Error ? error.message : 'Unknown error',
          postId: post.id,
        });
      }
    };
    
    checkReaction();
  }, [post.id]);
  
  const handleReaction = async (type: ReactionType) => {
    if (isReacting) return;
    
    setIsReacting(true);
    setShowReactionOptions(false);
    
    try {
      if (hasReacted && reactionType === type) {
        // Remove reaction if clicking the same type
        await socialService.unreactToPost(post.id);
        setHasReacted(false);
        setReactionType(null);
      } else {
        // Add or change reaction
        const reaction = await socialService.reactToPost(post.id, type);
        if (reaction) {
          setHasReacted(true);
          setReactionType(type);
        }
      }
      
      // Notify parent component to refresh
      if (onReactionChange) {
        onReactionChange();
      }
    } catch (error) {
      logger.error('Error handling reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId: post.id,
      });
    } finally {
      setIsReacting(false);
    }
  };
  
  const getReactionIcon = () => {
    if (!hasReacted) return <Heart className="h-5 w-5 text-gray-500" />;
    
    switch (reactionType) {
      case ReactionType.LIKE:
        return <ThumbsUp className="h-5 w-5 text-blue-500" />;
      case ReactionType.LOVE:
        return <Heart className="h-5 w-5 text-red-500" />;
      case ReactionType.CELEBRATE:
        return <Heart className="h-5 w-5 text-yellow-500" />;
      case ReactionType.SUPPORT:
        return <Heart className="h-5 w-5 text-purple-500" />;
      default:
        return <Heart className="h-5 w-5 text-gray-500" />;
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden mb-4">
      {/* Post header */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
            {post.user?.avatarUrl ? (
              <img 
                src={post.user.avatarUrl} 
                alt={`${post.user.firstName} ${post.user.lastName}`} 
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <User className="h-6 w-6 text-gray-500" />
            )}
          </div>
          <div>
            <Link to={`/social/profile/${post.userId}`} className="font-medium text-gray-900 hover:underline">
              {post.user ? `${post.user.firstName} ${post.user.lastName}` : 'Anonymous User'}
            </Link>
            <p className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              {post.visibility !== 'public' && (
                <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                  {post.visibility}
                </span>
              )}
            </p>
          </div>
        </div>
        
        {user && user.id === post.userId && (
          <div className="relative">
            <button className="p-1 rounded-full hover:bg-gray-100">
              <MoreHorizontal className="h-5 w-5 text-gray-500" />
            </button>
            {/* Dropdown menu would go here */}
          </div>
        )}
      </div>
      
      {/* Post content */}
      <div className="p-4">
        <Link to={`/social/post/${post.id}`} className="block hover:opacity-95">
          <p className="text-gray-800 whitespace-pre-line">{post.content}</p>
          
          {/* Post attachments would go here */}
          {post.attachments && post.attachments.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {post.attachments.map((attachment, index) => (
                <img 
                  key={index}
                  src={attachment}
                  alt={`Attachment ${index + 1}`}
                  className="rounded-lg max-h-96 w-auto object-cover"
                />
              ))}
            </div>
          )}
        </Link>
      </div>
      
      {/* Post metrics */}
      <div className="px-4 py-2 border-t border-b border-gray-100 flex justify-between text-sm text-gray-500">
        <div>
          <span>{post.likeCount} {post.likeCount === 1 ? 'reaction' : 'reactions'}</span>
        </div>
        <div>
          <span>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</span>
        </div>
      </div>
      
      {/* Post actions */}
      <div className="px-4 py-2 flex justify-between">
        <div className="relative">
          <button
            onClick={() => setShowReactionOptions(!showReactionOptions)}
            className={`flex items-center space-x-1 px-3 py-1 rounded-md ${
              hasReacted ? 'text-indigo-600' : 'text-gray-500 hover:bg-gray-100'
            }`}
            disabled={isReacting}
          >
            {getReactionIcon()}
            <span>{hasReacted ? 'Reacted' : 'React'}</span>
          </button>
          
          {/* Reaction options */}
          {showReactionOptions && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-10">
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleReaction(ReactionType.LIKE)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <ThumbsUp className="h-6 w-6 text-blue-500" />
                </button>
                <button 
                  onClick={() => handleReaction(ReactionType.LOVE)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <Heart className="h-6 w-6 text-red-500" />
                </button>
                <button 
                  onClick={() => handleReaction(ReactionType.CELEBRATE)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <Heart className="h-6 w-6 text-yellow-500" />
                </button>
                <button 
                  onClick={() => handleReaction(ReactionType.SUPPORT)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <Heart className="h-6 w-6 text-purple-500" />
                </button>
              </div>
            </div>
          )}
        </div>
        
        <Link
          to={`/social/post/${post.id}`}
          className="flex items-center space-x-1 px-3 py-1 rounded-md text-gray-500 hover:bg-gray-100"
        >
          <MessageCircle className="h-5 w-5" />
          <span>Comment</span>
        </Link>
        
        <button className="flex items-center space-x-1 px-3 py-1 rounded-md text-gray-500 hover:bg-gray-100">
          <Share2 className="h-5 w-5" />
          <span>Share</span>
        </button>
      </div>
    </div>
  );
}