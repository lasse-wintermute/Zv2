-- Original-combat port: the 26 Zombilization zombie types with their exact
-- attribute strings (Health|Stealth|Intelligence|Speed|attack|defense from
-- z.sql zombietypes) plus abandoned world vehicles parked in rooms, matching
-- the original's unmanned-vehicle system. Idempotent.

ALTER TABLE zombietypes
  ADD COLUMN IF NOT EXISTS description VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hp INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS attack INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS defense INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS speed INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stealth INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS intelligence INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS drops VARCHAR(120) NOT NULL DEFAULT '';

-- The original 26 types. hp/attack/defense/speed/stealth/intelligence are the
-- exact original values; drops are the original possessions remapped onto
-- Zv2's item catalogue (weapon-for-weapon where one exists).
DELETE FROM zombietypes;
INSERT INTO zombietypes (id,name,threat,description,hp,attack,defense,speed,stealth,intelligence,drops) VALUES
(1,'Possessed torso',1,'Not much left of this person but it will try to strangle you nonetheless.',10,5,5,1,5,5,'5|1&1|2'),
(2,'Zombie dog',1,'Good doggy! Good doggy, have some of this **BLAM**',10,10,5,1,5,25,'3|1'),
(3,'Female zombie',1,'Ghhhhhrrrrraaarhhaahhhh!',20,10,5,1,5,15,'3|1&2|1'),
(4,'Strip dancer zombie',1,'Yeah, come to daddy, baby. Or rather not.',25,10,5,1,15,15,'4|1&1|2'),
(5,'Shambler',1,'Your off-the-mill garden variety slow zombie. Mow ''em down!',25,10,5,1,5,5,'2|2&1|2'),
(6,'Infected madman',2,'Not a zombie, but a real human who became mad and thinks he is undead.',25,10,10,1,15,15,'5|2'),
(7,'Newscaster zombie',2,'Ever on the foremost front, the newsmen were the first to get infected when the plague hit.',25,10,10,1,15,15,'8|1'),
(8,'Biter',2,'Aggressive and fast. Keep them at arm''s length or, even better, rifle shot lengths.',30,15,10,1,15,15,'3|2&1|2'),
(9,'Zombie biker',2,'Cruising times are over, but these guys are still looking for some (live) ass to kick.',30,20,5,1,10,10,'13|1'),
(10,'Hillbilly zombie',3,'Dumb, deaf, and blind. But be prepared when they spot you, they''re tough as nails!',30,25,10,1,5,5,'12|1&2|3'),
(11,'Policeman zombie',3,'Fully equipped and well-armed, these officers died and respawned in the line of duty.',30,25,5,1,15,25,'17|1&6|4'),
(12,'Boomer',3,'Boom!',30,40,5,1,5,5,'7|1'),
(13,'Shotgun zombie',4,'Too bad this guy died with a dangerous weapon in his hand. Take him out quick!',40,35,15,1,15,15,'19|1&18|2'),
(14,'Witch',5,'Easy to avoid, but when you anger her.. beware!',60,50,15,1,5,5,'20|1'),
(15,'SWAT zombie',4,'Tough, well-protected, and dangerous.',50,35,25,1,15,25,'24|1&6|4'),
(16,'Ghoul',4,'The most human-like enemy; their keen senses reveal all but the best-concealed squads.',50,40,20,1,15,50,'6|4&8|1'),
(17,'Mummy',4,'Very difficult to kill, these oldest of the old have awoken after countless millennia.',100,10,40,1,35,5,'26|1&8|2'),
(18,'Hunter',6,'Watch out for these dangerous foes! They creep up and attack without warning.',80,50,25,1,55,15,'21|1&14|1'),
(19,'Zombie rat king',5,'Strength in numbers! These rats have grown together at their tails.',60,40,25,1,15,15,'1|6'),
(20,'Gary',2,'Gary! Gary! Gary! Gary! Gary!',30,20,5,1,15,5,'12|1&3|2'),
(21,'Zergling',2,'Don''t let ''em rush you. Kekekeke!',40,15,5,1,25,5,'1|4'),
(22,'Cthulhu spawn',9,'They filtered down from the stars to subjugate the Elder Gods.',150,80,50,1,5,45,'8|3&1|10'),
(23,'Shoggot',8,'These nameless, forbidden creatures... I''a! Shub-Niggurath!',150,50,50,1,25,25,'8|3&1|10'),
(24,'Ultrazombie',8,'This ultra-strong mutation is bad news. Avoid at all costs!',120,60,45,1,35,45,'19|1&18|4'),
(25,'Behemoth',9,'This guy will keep looking for humans to eat.',160,65,35,1,15,55,'14|1&1|8'),
(26,'Kraken',10,'Release the Kraken!',250,100,50,1,10,45,'8|5&1|15');

-- Abandoned vehicles parked in world rooms (original: unmanned vehicles with
-- troopid=0 scattered across the map — you just drive off with what you find).
CREATE TABLE IF NOT EXISTS world_vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  x INT NOT NULL, y INT NOT NULL, room_id INT NOT NULL,
  type_id INT NOT NULL, name VARCHAR(80) NOT NULL,
  fuel INT NOT NULL DEFAULT 0,
  claimed_by INT UNSIGNED NULL, claimed_at INT NOT NULL DEFAULT 0,
  UNIQUE KEY one_per_room (room_id),
  FOREIGN KEY (type_id) REFERENCES vehicle_types(id),
  FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Deterministic scatter: ~30 wrecks across the 50x50, weighted toward garage-ish
-- buildings, a quarter tank of fuel left in each.
INSERT IGNORE INTO world_vehicles (x,y,room_id,type_id,name,fuel)
SELECT b.x, b.y, r.id, 1+(r.id MOD 3),
       CONCAT('Abandoned ', vt.name), FLOOR(vt.fuel_capacity/4)
FROM roommap r
JOIN buildings b ON b.id = r.buildingid
JOIN vehicle_types vt ON vt.id = 1+(r.id MOD 3)
WHERE (r.id MOD 397) = 5;
