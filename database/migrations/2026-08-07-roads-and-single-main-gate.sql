-- Shaping the ingress: one main gate, and player-placed roads and houses.
--
-- The main gate was two cells wide, which produced two independent lanes and
-- split the pressure that was supposed to concentrate at the front. One cell,
-- one lane. Side gates stay one cell each, so the compound has exactly four ways
-- in and every one of them is a place worth defending.

DELETE s FROM compound_structures s
  JOIN (SELECT userid, MAX(grid_x) mx FROM compound_structures
         WHERE kind='gate_main' GROUP BY userid HAVING COUNT(*) > 1) d
    ON d.userid = s.userid AND s.grid_x = d.mx
 WHERE s.kind = 'gate_main';

-- Roads and houses are placed like emplacements -- repeatedly, instantly -- but
-- they are terrain, so they live in compound_structures. They borrow facilities
-- rows for name and cost the same way the guns do.
INSERT INTO facilities (id, name, description) VALUES
  (44, 'Road',           'Packed gravel. Walkers follow the easiest ground, so a road is bait — lay it where your guns can see it.'),
  (45, 'Settler house',  'Another home for the settlement. Solid: it blocks a route and pushes the walkers onto the next one.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO facility_costs (facility_id, level, water, food, wood, metal, petrol) VALUES
  (44, 1, 0, 0,  8,  2, 0),
  (45, 1, 0, 0, 35, 15, 0)
ON DUPLICATE KEY UPDATE wood = VALUES(wood), metal = VALUES(metal);
