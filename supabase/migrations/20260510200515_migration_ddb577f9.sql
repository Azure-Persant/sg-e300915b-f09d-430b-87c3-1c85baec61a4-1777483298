-- Drop old constraint and add new one with image_url
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_set_id_card_number_rarity_key;
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_set_id_card_number_key;
ALTER TABLE cards ADD CONSTRAINT cards_set_id_card_number_rarity_image_key 
  UNIQUE (set_id, card_number, rarity, image_url);