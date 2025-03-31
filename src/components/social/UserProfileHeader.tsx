import React from 'react';
import { UserProfile } from '../../types/auth.types';
import { FollowerCount, RelationshipType } from '../../types/relationship.types';
import { User, Loader, UserPlus, UserMinus, UserX, MessageCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { socialService } from '../../services/social/index';
import { logger } from '../../utils/logger';
import { Link } from 'react-router-dom';

interface UserProfileHeaderProps {
  profile: UserProfile;
  followerCounts: FollowerCount | null;
  isFollowing: boolean;
  isCurrentUser: boolean;
  onFollowChange: () => void;
}

export function UserProfileHeader({
  profile,
  followerCounts,
  isFollowing,
  isCurrentUser,
  onFollowChange,
}: UserProfileHeaderProps) {
  const { user } = useAuth();
  const [isUpdating, setIsUpdating] = React.useState(false);
  
  const handleFollowToggle = async () => {
    if (!user || isUpdating) return;
    
    setIsUpdating(true);
    
    try {
      if (isFollowing) {
        await socialService.unfollowUser(profile.id);
      } else {
        await socialService.followUser(profile.id);
      }
      
      onFollowChange();
    } catch (error) {
      logger.error('Error toggling follow status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: profile.id,
      });
    } finally {
      setIsUpdating(false);
    }
  };
  
  const coverImageUrl = "https://images.unsplash.com/photo-1500964757637-c85e8a162699?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1203&q=80";
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
      {/* Cover photo */}
      <div 
        className="h-48 bg-gradient-to-r from-indigo-100 to-purple-100 relative" 
        style={{ backgroundImage: `url(${coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
      </div>
      
      {/* Profile details */}
      <div className="relative px-6 pb-6">
        {/* Profile photo */}
        <div className="absolute -top-16 left-6 h-32 w-32 rounded-full border-4 border-white bg-white shadow-md overflow-hidden">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={`${profile.firstName} ${profile.lastName}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gray-200 flex items-center justify-center">
              <User className="h-16 w-16 text-gray-400" />
            </div>
          )}
        </div>
        
        {/* Action buttons */}
        <div className="flex justify-end mt-4 space-x-3">
          {!isCurrentUser && (
            <>
              <button
                onClick={handleFollowToggle}
                disabled={isUpdating}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
                  isFollowing
                    ? 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isUpdating ? (
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                ) : isFollowing ? (
                  <UserMinus className="h-4 w-4 mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                {isFollowing ? 'Unfollow' : 'Follow'}
              </button>
              <Link
                to={`/messages?userId=${profile.id}`}
                className="flex items-center px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Message
              </Link>
            </>
          )}
          {isCurrentUser && (
            <Link
              to="/profile"
              className="flex items-center px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Edit Profile
            </Link>
          )}
        </div>
        
        {/* Profile info */}
        <div className="mt-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {profile.firstName} {profile.lastName}
          </h1>
          <p className="text-gray-500 mt-1">{profile.role}</p>
          
          {/* Follower stats */}
          <div className="flex space-x-4 mt-4">
            <div className="text-sm">
              <span className="font-semibold text-gray-900">{followerCounts?.followerCount || 0}</span>
              <span className="text-gray-500 ml-1">followers</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-gray-900">{followerCounts?.followingCount || 0}</span>
              <span className="text-gray-500 ml-1">following</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}