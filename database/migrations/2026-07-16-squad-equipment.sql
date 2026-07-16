CREATE TABLE IF NOT EXISTS squad_equipment (
  squad_id INT UNSIGNED NOT NULL,
  item_id INT NOT NULL,
  amount INT NOT NULL DEFAULT 1,
  PRIMARY KEY(squad_id,item_id),
  FOREIGN KEY(squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
