-- Drop the existing user_collections table and recreate with correct structure
DROP TABLE IF EXISTS user_collections CASCADE;

CREATE TABLE user_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

CREATE INDEX idx_user_collections_user_id ON user_collections(user_id);
CREATE INDEX idx_user_collections_card_id ON user_collections(card_id);

ALTER TABLE user_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collection" ON user_collections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own collection" ON user_collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collection" ON user_collections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own collection" ON user_collections
  FOR DELETE USING (auth.uid() = user_id);