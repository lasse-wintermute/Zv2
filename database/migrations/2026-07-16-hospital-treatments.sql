CREATE TABLE IF NOT EXISTS hospital_treatments (
  survivor_id INT UNSIGNED PRIMARY KEY,
  userid INT UNSIGNED NOT NULL,
  started_at INT NOT NULL,
  due INT NOT NULL,
  soldier_level INT NOT NULL,
  hospital_level INT NOT NULL,
  FOREIGN KEY(userid) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(survivor_id) REFERENCES survivors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE facilities SET name='Hospital',description='Treats critical squad casualties and restores them to duty.' WHERE id=16;
