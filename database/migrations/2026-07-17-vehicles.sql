CREATE TABLE IF NOT EXISTS vehicle_types (
  id INT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  garage_level INT NOT NULL DEFAULT 1,
  seats INT NOT NULL,
  cargo_bonus INT NOT NULL,
  speed_bonus INT NOT NULL,
  fuel_capacity INT NOT NULL,
  fuel_per_tile INT NOT NULL,
  metal_cost INT NOT NULL,
  wood_cost INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO vehicle_types(id,name,description,garage_level,seats,cargo_bonus,speed_bonus,fuel_capacity,fuel_per_tile,metal_cost,wood_cost) VALUES
(1,'Trail motorcycle','Fast and economical, but only suitable for a small scouting team.',1,3,12,45,18,1,45,20),
(2,'Utility van','A balanced expedition vehicle with room for a full fireteam and salvage.',2,4,32,30,32,2,90,40),
(3,'Armored truck','Slow, thirsty and tough; built to carry a large crew and a heavy haul.',3,6,55,20,48,3,160,70)
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),garage_level=VALUES(garage_level),seats=VALUES(seats),cargo_bonus=VALUES(cargo_bonus),speed_bonus=VALUES(speed_bonus),fuel_capacity=VALUES(fuel_capacity),fuel_per_tile=VALUES(fuel_per_tile),metal_cost=VALUES(metal_cost),wood_cost=VALUES(wood_cost);

CREATE TABLE IF NOT EXISTS vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  userid INT UNSIGNED NOT NULL,
  type_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  fuel INT NOT NULL DEFAULT 0,
  seats_upgrade INT NOT NULL DEFAULT 0,
  cargo_upgrade INT NOT NULL DEFAULT 0,
  assigned_squad INT UNSIGNED NULL,
  created_at INT NOT NULL,
  UNIQUE KEY one_vehicle_per_squad(assigned_squad),
  FOREIGN KEY(userid) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(type_id) REFERENCES vehicle_types(id),
  FOREIGN KEY(assigned_squad) REFERENCES squads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
