-- Original quests_tasks port: achievement-style objective chains (Greenhorn →
-- Old Hand etc.) driving long-term progression, plus the kill counter they need.
-- Requirements are AND-ed where set: facility level, tech recovered, kills,
-- living survivors. Rewards are Zv2 items. Idempotent.

ALTER TABLE strongholds ADD COLUMN IF NOT EXISTS kills INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS objectives (
  id INT PRIMARY KEY,
  chain VARCHAR(32) NOT NULL,
  tier INT NOT NULL DEFAULT 1,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  req_facility INT NULL, req_level INT NULL,
  req_tech INT NULL, req_kills INT NULL, req_survivors INT NULL,
  reward_item INT NOT NULL, reward_amount INT NOT NULL DEFAULT 1,
  prereq_id INT NULL,
  UNIQUE KEY chain_tier (chain, tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_objectives (
  userid INT UNSIGNED NOT NULL, objective_id INT NOT NULL, claimed_at INT NOT NULL,
  PRIMARY KEY (userid, objective_id),
  FOREIGN KEY (userid) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (objective_id) REFERENCES objectives(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELETE FROM player_objectives WHERE objective_id NOT IN (SELECT id FROM objectives);
DELETE FROM objectives;
INSERT INTO objectives (id,chain,tier,name,description,req_facility,req_level,req_tech,req_kills,req_survivors,reward_item,reward_amount,prereq_id) VALUES
-- The original HQ/tech rank chain (Greenhorn → Old Hand)
(1,'rank',1,'Greenhorn','Grow the settlement to 5 living survivors.',NULL,NULL,NULL,NULL,5,3,5,NULL),
(2,'rank',2,'Rookie','Headquarters level 2 and Wood working recovered.',17,2,1,NULL,NULL,2,15,1),
(3,'rank',3,'Practitioner','Headquarters level 4 and Iron working recovered.',17,4,4,NULL,NULL,1,25,2),
(4,'rank',4,'Expert','Headquarters level 6 and Steel working recovered.',17,6,7,NULL,NULL,21,1,3),
(5,'rank',5,'Veteran','Headquarters level 8 and Plastics recovered.',17,8,8,NULL,NULL,20,2,4),
(6,'rank',6,'Old Hand','Headquarters level 10 and Composites recovered.',17,10,9,NULL,NULL,25,1,5),
-- Toolshop chain (Lumberjack → Precision engineer)
(7,'toolshop',1,'Lumberjack','Toolshop level 3.',11,3,NULL,NULL,NULL,2,20,NULL),
(8,'toolshop',2,'Blacksmith','Toolshop level 6.',11,6,NULL,NULL,NULL,1,40,7),
(9,'toolshop',3,'Precision engineer','Toolshop level 9.',11,9,NULL,NULL,NULL,8,3,8),
-- Communication chain (Radio operator → Satellite)
(10,'comms',1,'Radio operator','Radio tower level 3.',18,3,NULL,NULL,NULL,4,10,NULL),
(11,'comms',2,'Wireless','Radio tower level 6.',18,6,NULL,NULL,NULL,8,2,10),
(12,'comms',3,'Satellite','Radio tower level 9.',18,9,NULL,NULL,NULL,8,5,11),
-- Governance chain (Mayor → Big Chief)
(13,'gov',1,'Mayor','Headquarters level 3.',17,3,NULL,NULL,NULL,3,10,NULL),
(14,'gov',2,'Governor','Headquarters level 6.',17,6,NULL,NULL,NULL,4,20,13),
(15,'gov',3,'Big Chief','Headquarters level 9.',17,9,NULL,NULL,NULL,20,3,14),
-- Armory chain (Lieutenant → Warlord)
(16,'armory',1,'Lieutenant','Troop quarters level 3.',10,3,NULL,NULL,NULL,6,6,NULL),
(17,'armory',2,'General','Troop quarters level 6.',10,6,NULL,NULL,NULL,18,4,16),
(18,'armory',3,'Warlord','Troop quarters level 9.',10,9,NULL,NULL,NULL,19,1,17),
-- Single-facility marks
(19,'facility',1,'Waste digger','Scrapyard level 5.',2,5,NULL,NULL,NULL,1,30,NULL),
(20,'facility',2,'Hoarder','Storage level 5.',4,5,NULL,NULL,NULL,2,30,19),
(21,'facility',3,'Car Collector','Garage level 5.',3,5,NULL,NULL,NULL,7,4,20),
(22,'facility',4,'Whiz Kid','Research center level 5.',12,5,NULL,NULL,NULL,8,4,21),
-- Kill chain (the original Zombie killer line, Zv2 scale)
(23,'kills',1,'First blood','Put down 10 of the infected.',NULL,NULL,NULL,10,NULL,5,3,NULL),
(24,'kills',2,'Zombie killer','Put down 100 of the infected.',NULL,NULL,NULL,100,NULL,6,12,23),
(25,'kills',3,'Sharpshooter','Put down 1,000 of the infected.',NULL,NULL,NULL,1000,NULL,19,1,24);
