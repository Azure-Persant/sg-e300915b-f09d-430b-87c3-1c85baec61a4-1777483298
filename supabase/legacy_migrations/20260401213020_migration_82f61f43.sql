-- Add illustrator column to keep the artist information
ALTER TABLE cards ADD COLUMN IF NOT EXISTS illustrator text;