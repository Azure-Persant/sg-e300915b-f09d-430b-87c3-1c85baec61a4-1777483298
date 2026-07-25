-- Add INSERT policies for sets and cards tables to allow sync operations
-- These are public card databases, so allowing public inserts for card data is appropriate

-- Allow anonymous inserts into sets (for sync operations)
CREATE POLICY "public_insert_sets" ON sets
  FOR INSERT 
  TO public
  WITH CHECK (true);

-- Allow anonymous inserts into cards (for sync operations)  
CREATE POLICY "public_insert_cards" ON cards
  FOR INSERT
  TO public
  WITH CHECK (true);