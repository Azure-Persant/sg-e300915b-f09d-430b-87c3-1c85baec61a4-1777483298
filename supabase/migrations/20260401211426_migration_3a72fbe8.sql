-- Create sets table for card expansions
CREATE TABLE sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  release_date DATE,
  total_cards INTEGER,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cards table
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID REFERENCES sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  card_number TEXT NOT NULL,
  element TEXT,
  card_type TEXT NOT NULL,
  class TEXT,
  rarity TEXT NOT NULL,
  cost INTEGER,
  power INTEGER,
  life INTEGER,
  effect_text TEXT,
  flavor_text TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(set_id, card_number)
);

-- Create card_locations table (user-defined storage locations)
CREATE TABLE card_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Create user_collections table (tracks card ownership with locations)
CREATE TABLE user_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  location_id UUID REFERENCES card_locations(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  foil_quantity INTEGER NOT NULL DEFAULT 0 CHECK (foil_quantity >= 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, card_id, location_id)
);

-- Create decks table
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create deck_cards table (junction table for deck composition)
CREATE TABLE deck_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(deck_id, card_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_cards_set_id ON cards(set_id);
CREATE INDEX idx_cards_name ON cards(name);
CREATE INDEX idx_cards_rarity ON cards(rarity);
CREATE INDEX idx_cards_element ON cards(element);
CREATE INDEX idx_cards_card_type ON cards(card_type);
CREATE INDEX idx_user_collections_user_id ON user_collections(user_id);
CREATE INDEX idx_user_collections_card_id ON user_collections(card_id);
CREATE INDEX idx_user_collections_location_id ON user_collections(location_id);
CREATE INDEX idx_decks_user_id ON decks(user_id);
CREATE INDEX idx_deck_cards_deck_id ON deck_cards(deck_id);
CREATE INDEX idx_deck_cards_card_id ON deck_cards(card_id);
CREATE INDEX idx_card_locations_user_id ON card_locations(user_id);

-- Enable RLS on all tables
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sets (public read)
CREATE POLICY "public_read_sets" ON sets FOR SELECT USING (true);

-- RLS Policies for cards (public read)
CREATE POLICY "public_read_cards" ON cards FOR SELECT USING (true);

-- RLS Policies for card_locations (private to user)
CREATE POLICY "select_own_locations" ON card_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_locations" ON card_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_locations" ON card_locations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own_locations" ON card_locations FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for user_collections (private to user)
CREATE POLICY "select_own_collection" ON user_collections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_collection" ON user_collections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_collection" ON user_collections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own_collection" ON user_collections FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for decks (own decks + public decks)
CREATE POLICY "select_own_or_public_decks" ON decks FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "insert_own_decks" ON decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_decks" ON decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_own_decks" ON decks FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for deck_cards (via deck ownership)
CREATE POLICY "select_deck_cards" ON deck_cards FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM decks WHERE decks.id = deck_cards.deck_id AND (decks.user_id = auth.uid() OR decks.is_public = true)
  )
);
CREATE POLICY "insert_own_deck_cards" ON deck_cards FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM decks WHERE decks.id = deck_cards.deck_id AND decks.user_id = auth.uid()
  )
);
CREATE POLICY "update_own_deck_cards" ON deck_cards FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM decks WHERE decks.id = deck_cards.deck_id AND decks.user_id = auth.uid()
  )
);
CREATE POLICY "delete_own_deck_cards" ON deck_cards FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM decks WHERE decks.id = deck_cards.deck_id AND decks.user_id = auth.uid()
  )
);

-- Insert sample Grand Archive sets
INSERT INTO sets (name, code, release_date, total_cards) VALUES
('Dawn of Ashes Prelude', 'DOA', '2022-01-01', 215),
('Fractured Crown', 'FTC', '2022-09-01', 234),
('Mercurial Heart', 'MHP', '2023-03-01', 228),
('Alchemical Revolution', 'ALC', '2023-09-01', 245),
('Tales of Aria', 'TOA', '2024-03-01', 251);

-- Insert sample Grand Archive cards
INSERT INTO cards (set_id, name, card_number, element, card_type, class, rarity, cost, power, effect_text, image_url) VALUES
-- Dawn of Ashes cards
((SELECT id FROM sets WHERE code = 'DOA'), 'Lorraine, Wandering Warrior', 'DOA-001', 'Fire', 'Champion', 'Warrior', 'Rare', 0, 27, 'At the start of your turn, look at the top card of your deck. You may put it on the bottom of your deck.', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400'),
((SELECT id FROM sets WHERE code = 'DOA'), 'Fireball', 'DOA-015', 'Fire', 'Action', 'Mage', 'Common', 2, NULL, 'Deal 3 damage to target unit or champion.', 'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=400'),
((SELECT id FROM sets WHERE code = 'DOA'), 'Blaze Spirit', 'DOA-032', 'Fire', 'Ally', 'Mage', 'Uncommon', 3, 4, 'Fast. When this enters play, deal 1 damage to target unit.', 'https://images.unsplash.com/photo-1553702446-a39d6fbee6cb?w=400'),
((SELECT id FROM sets WHERE code = 'DOA'), 'Steel Blade', 'DOA-087', 'Norm', 'Item', 'Warrior', 'Common', 1, NULL, 'Your champion gets +2 power until end of turn.', 'https://images.unsplash.com/photo-1589519160732-57fc498494f8?w=400'),
((SELECT id FROM sets WHERE code = 'DOA'), 'Meditation', 'DOA-112', 'Norm', 'Action', NULL, 'Common', 1, NULL, 'Draw 2 cards.', 'https://images.unsplash.com/photo-1545389336-cf090694435e?w=400'),

-- Fractured Crown cards
((SELECT id FROM sets WHERE code = 'FTC'), 'Silvie, Wilds Whisperer', 'FTC-001', 'Wind', 'Champion', 'Ranger', 'Rare', 0, 25, 'Your allies with cost 2 or less cost 1 less to play.', 'https://images.unsplash.com/photo-1566438480900-0609be27a4be?w=400'),
((SELECT id FROM sets WHERE code = 'FTC'), 'Gale Force', 'FTC-023', 'Wind', 'Action', 'Ranger', 'Common', 2, NULL, 'Return target unit to its owner''s hand.', 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=400'),
((SELECT id FROM sets WHERE code = 'FTC'), 'Forest Guardian', 'FTC-045', 'Wind', 'Ally', 'Ranger', 'Uncommon', 4, 5, 'Ambush. When this enters play, you may put a card from your graveyard on top of your deck.', 'https://images.unsplash.com/photo-1511497584788-876760111969?w=400'),
((SELECT id FROM sets WHERE code = 'FTC'), 'Thornweave Armor', 'FTC-098', 'Norm', 'Item', 'Ranger', 'Uncommon', 2, NULL, 'Your champion gets +3 life until end of turn.', 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400'),

-- Mercurial Heart cards
((SELECT id FROM sets WHERE code = 'MHP'), 'Diana, Chant Caller', 'MHP-001', 'Water', 'Champion', 'Cleric', 'Rare', 0, 24, 'When you play a Spirit action, your champion gets +1 life.', 'https://images.unsplash.com/photo-1583996630025-b3c3e0c20f48?w=400'),
((SELECT id FROM sets WHERE code = 'MHP'), 'Tidal Wave', 'MHP-019', 'Water', 'Action', 'Mage', 'Uncommon', 3, NULL, 'Banish target unit. Its controller draws a card.', 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400'),
((SELECT id FROM sets WHERE code = 'MHP'), 'Aqua Sprite', 'MHP-037', 'Water', 'Ally', 'Mage', 'Common', 2, 3, 'When this enters play, draw a card, then discard a card.', 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?w=400');