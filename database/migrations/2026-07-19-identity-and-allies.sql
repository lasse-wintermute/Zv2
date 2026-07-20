-- Identity (renaming + emblems) and the ally system, ported from the OG:
--   * strongholds/squads keep player-chosen names (OG rename forms)
--   * emblems replace the OG's uploaded banners (troop banner / ally banner /
--     profilbild) with a curated preset set — same role, no file uploads
--   * allys + membership, gated on the Communication centre like the original
-- Idempotent.

-- Emblem columns keep an EMPTY default (emoji defaults are not portable across
-- client charsets); the API substitutes the default emblem when blank.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS emblem VARCHAR(8) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ally_id INT UNSIGNED NULL;

ALTER TABLE strongholds
  ADD COLUMN IF NOT EXISTS emblem VARCHAR(8) NOT NULL DEFAULT '';

ALTER TABLE squads
  ADD COLUMN IF NOT EXISTS emblem VARCHAR(8) NOT NULL DEFAULT '';

-- Communication centre: the OG gate for founding/holding an ally (facility 6).
INSERT INTO facilities (id,name,description,maxlevel) VALUES
  (6,'Communication center','Radio net that lets you found and hold an alliance.',10)
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description);
INSERT IGNORE INTO facility_costs (facility_id,level,water,food,wood,metal,petrol,duration)
SELECT 6,level,water,food,wood,metal,petrol,duration FROM facility_costs WHERE facility_id=18;

-- Mirrors the OG `allies` table: name + banner(emblem) + description + founder
-- + member count + summed points. The OG had NO tag/abbreviation concept.
CREATE TABLE IF NOT EXISTS allys (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  emblem VARCHAR(8) NOT NULL DEFAULT '',
  description VARCHAR(1000) NOT NULL DEFAULT '',
  founder INT UNSIGNED NOT NULL,
  members INT NOT NULL DEFAULT 1,
  allypoints INT NOT NULL DEFAULT 0,
  open_applications TINYINT(1) NOT NULL DEFAULT 1,
  created_at INT NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (founder) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE allys
  DROP COLUMN IF EXISTS tag,
  ADD COLUMN IF NOT EXISTS members INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allypoints INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted TINYINT(1) NOT NULL DEFAULT 0;

-- rank: 2 = founder, 1 = admin, 0 = member (OG admins/regular split)
CREATE TABLE IF NOT EXISTS ally_members (
  userid INT UNSIGNED PRIMARY KEY,
  ally_id INT UNSIGNED NOT NULL,
  rank_level TINYINT NOT NULL DEFAULT 0,
  joined_at INT NOT NULL,
  FOREIGN KEY (userid) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ally_id) REFERENCES allys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- state: 0 = pending application, 1 = invitation from the ally
CREATE TABLE IF NOT EXISTS ally_applications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ally_id INT UNSIGNED NOT NULL,
  userid INT UNSIGNED NOT NULL,
  state TINYINT NOT NULL DEFAULT 0,
  message VARCHAR(255) NOT NULL DEFAULT '',
  created_at INT NOT NULL,
  UNIQUE KEY one_per_pair (ally_id, userid),
  FOREIGN KEY (ally_id) REFERENCES allys(id) ON DELETE CASCADE,
  FOREIGN KEY (userid) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ally_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ally_id INT UNSIGNED NOT NULL,
  message VARCHAR(255) NOT NULL,
  created_at INT NOT NULL,
  FOREIGN KEY (ally_id) REFERENCES allys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
