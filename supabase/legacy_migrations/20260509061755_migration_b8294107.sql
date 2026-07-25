-- Update unique constraint to allow same card number with different rarities in same set
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_set_id_card_number_key;
ALTER TABLE cards ADD CONSTRAINT cards_set_id_card_number_rarity_key UNIQUE (set_id, card_number, rarity);