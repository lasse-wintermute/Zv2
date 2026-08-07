-- Tower-defense compound: a 16x16 walled settlement with gates, pre-built houses
-- and defensive emplacements, replacing the 7x7 facility yard.
--
-- Structures are deliberately NOT facilities: houses and gates are terrain that
-- shapes the lanes zombies walk, not things that get staffed, upgraded or listed
-- in the build menu. Keeping them in their own table stops every facility query
-- from having to filter them out.

CREATE TABLE IF NOT EXISTS compound_structures (
  id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  userid   INT UNSIGNED NOT NULL,
  kind     VARCHAR(24)  NOT NULL,          -- house | gate_main | gate_side | wall
  grid_x   INT NOT NULL,
  grid_y   INT NOT NULL,
  facing   VARCHAR(8)   NOT NULL DEFAULT '',  -- n | e | s | w, for gates
  hp       INT NOT NULL DEFAULT 100,
  max_hp   INT NOT NULL DEFAULT 100,
  variant  INT NOT NULL DEFAULT 0,          -- picks the sprite/silhouette
  PRIMARY KEY (id),
  UNIQUE KEY uniq_cell (userid, grid_x, grid_y),
  KEY idx_user_kind (userid, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Defensive emplacements. Ids start at 41 so they clear the 1..40 catalogue that
-- src/config.js already defines.
INSERT INTO facilities (id, name, description) VALUES
  (41, 'Sniper nest',        'A raised firing post. Long reach, picks off single walkers before they close.'),
  (42, 'Machine gun tower',  'Short reach, heavy sustained fire. Shreds a packed lane but burns ammunition.'),
  (43, 'Barricade',          'Scrap and rebar piled across a lane. Does no damage; holds walkers still while the guns work.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO facility_costs (facility_id, level, water, food, wood, metal, petrol) VALUES
  (41, 1, 0, 0, 40, 30,  0),
  (42, 1, 0, 0, 20, 60, 20),
  (43, 1, 0, 0, 25, 10,  0)
ON DUPLICATE KEY UPDATE wood = VALUES(wood), metal = VALUES(metal), petrol = VALUES(petrol);
