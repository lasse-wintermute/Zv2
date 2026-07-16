<?php
require __DIR__ . '/../api/_bootstrap.php';global $db;
$c=$db->query("SHOW COLUMNS FROM building_runs LIKE 'noise'");if(!$c||!$c->num_rows)$db->query("ALTER TABLE building_runs ADD noise INT NOT NULL DEFAULT 0 AFTER reward_tier");
$db->query("CREATE TABLE IF NOT EXISTS squad_cargo (squad_id INT UNSIGNED NOT NULL,item_id INT NOT NULL,amount INT NOT NULL DEFAULT 0,PRIMARY KEY(squad_id,item_id),FOREIGN KEY(squad_id) REFERENCES squads(id) ON DELETE CASCADE,FOREIGN KEY(item_id) REFERENCES items(id)) ENGINE=InnoDB");
$db->query("CREATE TABLE IF NOT EXISTS squad_events (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,squad_id INT UNSIGNED NOT NULL,event_type VARCHAR(24) NOT NULL,message VARCHAR(255) NOT NULL,created_at INT NOT NULL,FOREIGN KEY(squad_id) REFERENCES squads(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
echo "Expeditions migration complete.\n";
