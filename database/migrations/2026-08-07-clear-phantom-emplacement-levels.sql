-- Emplacements built through the old facility path left a level behind in
-- strongholds.buildings. The previous migration moved their positions into the
-- emplacements table but not those levels, so slots 41-43 kept rendering as
-- facilities -- with no position row they all defaulted to the middle of the map
-- and stacked three labels on one cell ("MaclBarricadeow...").
--
-- buildings is a pipe-delimited list indexed by facility id, so trimming it back
-- to 40 fields drops exactly the emplacement entries and nothing else.

UPDATE strongholds
   SET buildings = SUBSTRING_INDEX(buildings, '|', 40)
 WHERE LENGTH(buildings) - LENGTH(REPLACE(buildings, '|', '')) + 1 > 40;
