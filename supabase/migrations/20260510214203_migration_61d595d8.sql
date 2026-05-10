-- Add speed and legality columns if they don't exist
ALTER TABLE cards 
ADD COLUMN IF NOT EXISTS speed INTEGER,
ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT false;