-- Emplacements are placed many times over; facilities are placed once.
--
-- facility_positions is keyed (userid, slot) and the whole facility model assumes
-- slot == facility type: one headquarters, one hospital. That is right for
-- facilities and wrong for guns -- a defence is a dozen towers, not one. Rather
-- than break the slot identity every screen depends on, emplacements get their
-- own table and their own placement path, while still borrowing the facilities
-- rows for name, description and build cost.

CREATE TABLE IF NOT EXISTS emplacements (
  id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  userid   INT UNSIGNED NOT NULL,
  type     INT NOT NULL,                    -- facilities.id (41 sniper, 42 mg, 43 barricade)
  grid_x   INT NOT NULL,
  grid_y   INT NOT NULL,
  level    INT NOT NULL DEFAULT 1,
  built_at INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_cell (userid, grid_x, grid_y),
  KEY idx_user (userid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Anything already placed through the facility path moves across, so the first
-- build of each type is not stranded in the wrong table.
INSERT IGNORE INTO emplacements (userid, type, grid_x, grid_y, level, built_at)
SELECT userid, slot, grid_x, grid_y, 1, 0 FROM facility_positions WHERE slot BETWEEN 41 AND 43;
DELETE FROM facility_positions WHERE slot BETWEEN 41 AND 43;
