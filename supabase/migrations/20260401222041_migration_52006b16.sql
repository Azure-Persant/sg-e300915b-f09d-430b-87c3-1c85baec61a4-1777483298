-- Add UPDATE policies for sets and cards tables to allow upsert operations
CREATE POLICY "public_update_sets" ON sets
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_update_cards" ON cards
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);