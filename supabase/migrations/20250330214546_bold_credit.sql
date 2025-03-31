/*
  # Unify Posts and Comments

  1. Changes
    - Add parent_id to posts table
    - Migrate comments to posts
    - Drop comments table
    - Update triggers and policies
  
  2. Data Migration
    - Convert all comments to posts with parent_id
    - Preserve all relationships
  
  3. Security
    - Update RLS policies to handle nested posts
*/

-- Add parent_id to posts
ALTER TABLE posts 
ADD COLUMN parent_id UUID REFERENCES posts(id) ON DELETE CASCADE;

-- Create index for parent_id
CREATE INDEX idx_posts_parent_id ON posts(parent_id);

-- Migrate comments to posts
INSERT INTO posts (
  user_id,
  content,
  visibility,
  parent_id,
  created_at,
  updated_at
)
SELECT 
  user_id,
  content,
  'public', -- Set default visibility for migrated comments
  post_id as parent_id,
  created_at,
  updated_at
FROM comments;

-- Update post counts to include replies
CREATE OR REPLACE FUNCTION update_post_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment reply count on parent post
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE posts 
      SET comment_count = comment_count + 1 
      WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement reply count on parent post
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE posts 
      SET comment_count = GREATEST(comment_count - 1, 0)
      WHERE id = OLD.parent_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for reply count
CREATE TRIGGER post_reply_insert_trigger
AFTER INSERT ON posts
FOR EACH ROW
WHEN (NEW.parent_id IS NOT NULL)
EXECUTE FUNCTION update_post_reply_count();

CREATE TRIGGER post_reply_delete_trigger
AFTER DELETE ON posts
FOR EACH ROW
WHEN (OLD.parent_id IS NOT NULL)
EXECUTE FUNCTION update_post_reply_count();

-- Update RLS policies for nested posts
CREATE POLICY "Users can see replies to visible posts"
  ON posts
  FOR SELECT
  TO authenticated
  USING (
    parent_id IS NULL OR
    EXISTS (
      SELECT 1 FROM posts parent
      WHERE parent.id = posts.parent_id AND (
        parent.visibility = 'public' OR
        parent.user_id = auth.uid() OR
        (parent.visibility = 'followers' AND EXISTS (
          SELECT 1 FROM user_relationships
          WHERE user_id = parent.user_id
            AND related_user_id = auth.uid()
            AND relationship_type = 'follow'
        ))
      )
    )
  );

-- Drop old comments table and related objects
DROP TABLE comments CASCADE;