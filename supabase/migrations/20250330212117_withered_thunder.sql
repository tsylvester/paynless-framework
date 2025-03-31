/*
  # Social Features Implementation

  1. New Tables
    - `user_relationships` - For following, blocking, and muting relationships between users
    - `conversations` - For direct messaging conversations between users
    - `direct_messages` - For storing messages between users
    - `posts` - For user posts with visibility controls
    - `comments` - For comments on posts
    - `reactions` - For likes and other reactions on posts

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own content
    - Add policies for visibility controls on posts and comments

  3. Performance
    - Create indexes for frequently queried columns
    - Add triggers for maintaining counts and updated timestamps
*/

-- Create user_relationships table
CREATE TABLE IF NOT EXISTS user_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  related_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Enforce uniqueness for each relationship type between users
  UNIQUE(user_id, related_user_id, relationship_type)
);

ALTER TABLE user_relationships ENABLE ROW LEVEL SECURITY;

-- Policies for user_relationships
CREATE POLICY "Users can see their own relationships"
  ON user_relationships
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own relationships"
  ON user_relationships
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own relationships"
  ON user_relationships
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participants TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policies for conversations
CREATE POLICY "Users can see conversations they are part of"
  ON conversations
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = ANY(participants));

-- Create direct_messages table
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Policies for direct_messages
CREATE POLICY "Users can see messages they sent or received"
  ON direct_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send messages"
  ON direct_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update status of received messages"
  ON direct_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  attachments TEXT[],
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policies for posts
CREATE POLICY "Users can see their own posts"
  ON posts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can see public posts"
  ON posts
  FOR SELECT
  TO authenticated
  USING (visibility = 'public');

CREATE POLICY "Users can see follower-only posts from people they follow"
  ON posts
  FOR SELECT
  TO authenticated
  USING (
    visibility = 'followers' AND
    EXISTS (
      SELECT 1 FROM user_relationships
      WHERE user_id = posts.user_id
        AND related_user_id = auth.uid()
        AND relationship_type = 'follow'
    )
  );

CREATE POLICY "Users can create their own posts"
  ON posts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON posts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Policies for comments
CREATE POLICY "Users can see comments on visible posts"
  ON comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE id = comments.post_id AND (
        visibility = 'public' OR
        user_id = auth.uid() OR
        (visibility = 'followers' AND EXISTS (
          SELECT 1 FROM user_relationships
          WHERE user_id = posts.user_id
            AND related_user_id = auth.uid()
            AND relationship_type = 'follow'
        ))
      )
    )
  );

CREATE POLICY "Users can create comments on visible posts"
  ON comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM posts
      WHERE id = comments.post_id AND (
        visibility = 'public' OR
        user_id = auth.uid() OR
        (visibility = 'followers' AND EXISTS (
          SELECT 1 FROM user_relationships
          WHERE user_id = posts.user_id
            AND related_user_id = auth.uid()
            AND relationship_type = 'follow'
        ))
      )
    )
  );

CREATE POLICY "Users can update their own comments"
  ON comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create reactions table
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure a user can only have one reaction per post
  UNIQUE(post_id, user_id)
);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

-- Policies for reactions
CREATE POLICY "Users can see reactions on visible posts"
  ON reactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE id = reactions.post_id AND (
        visibility = 'public' OR
        user_id = auth.uid() OR
        (visibility = 'followers' AND EXISTS (
          SELECT 1 FROM user_relationships
          WHERE user_id = posts.user_id
            AND related_user_id = auth.uid()
            AND relationship_type = 'follow'
        ))
      )
    )
  );

CREATE POLICY "Users can create reactions on visible posts"
  ON reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM posts
      WHERE id = reactions.post_id AND (
        visibility = 'public' OR
        user_id = auth.uid() OR
        (visibility = 'followers' AND EXISTS (
          SELECT 1 FROM user_relationships
          WHERE user_id = posts.user_id
            AND related_user_id = auth.uid()
            AND relationship_type = 'follow'
        ))
      )
    )
  );

CREATE POLICY "Users can delete their own reactions"
  ON reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create triggers to update post counts
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create separate triggers to avoid OLD/NEW confusion
CREATE TRIGGER comment_insert_trigger
AFTER INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION update_post_comment_count();

CREATE TRIGGER comment_delete_trigger
AFTER DELETE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_post_comment_count();

-- Create function for like count
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create separate triggers for likes
CREATE TRIGGER reaction_insert_trigger
AFTER INSERT ON reactions
FOR EACH ROW
EXECUTE FUNCTION update_post_like_count();

CREATE TRIGGER reaction_delete_trigger
AFTER DELETE ON reactions
FOR EACH ROW
EXECUTE FUNCTION update_post_like_count();

-- Create indexes for performance
CREATE INDEX idx_user_relationships_user_id ON user_relationships(user_id);
CREATE INDEX idx_user_relationships_related_user_id ON user_relationships(related_user_id);
CREATE INDEX idx_direct_messages_conversation_id ON direct_messages(conversation_id);
CREATE INDEX idx_direct_messages_sender_id ON direct_messages(sender_id);
CREATE INDEX idx_direct_messages_recipient_id ON direct_messages(recipient_id);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_visibility ON posts(visibility);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_reactions_post_id ON reactions(post_id);
CREATE INDEX idx_reactions_user_id ON reactions(user_id);

-- Update the last_updated trigger for conversations
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_updated_at_trigger
AFTER INSERT ON direct_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_updated_at();

-- Add default privacy settings to user_profiles metadata
DO $$
BEGIN
  UPDATE user_profiles
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{privacy}',
    '{"profileVisibility":"public","allowTagging":true,"allowMessaging":{"everyone":true,"followers":true,"none":false},"showOnlineStatus":true,"showActivity":true,"showFollowers":true,"showFollowing":true}'::jsonb
  )
  WHERE metadata IS NULL OR NOT metadata ? 'privacy';
END;
$$;