<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$host=getenv('ZV2_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('ZV2_DB_PORT')?:3306);$user=getenv('ZV2_DB_USER')?:'root';$pass=getenv('ZV2_DB_PASS')?:'';$name=getenv('ZV2_DB_NAME')?:'zv2';
$db=new mysqli($host,$user,$pass,$name,$port);if($db->connect_errno)die("Database connection failed.\n");
$db->query("CREATE TABLE IF NOT EXISTS room_progress (userid INT UNSIGNED NOT NULL,room_id INT NOT NULL,discovered TINYINT(1) NOT NULL DEFAULT 0,intel INT NOT NULL DEFAULT 0,approach VARCHAR(16) NOT NULL DEFAULT '',discovered_at INT NOT NULL DEFAULT 0,PRIMARY KEY(userid,room_id),FOREIGN KEY(userid) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(room_id) REFERENCES roommap(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$db->query("CREATE TABLE IF NOT EXISTS building_runs (userid INT UNSIGNED NOT NULL,building_id INT NOT NULL,momentum INT NOT NULL DEFAULT 0,reward_tier INT NOT NULL DEFAULT 0,PRIMARY KEY(userid,building_id),FOREIGN KEY(userid) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(building_id) REFERENCES buildings(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
echo "Room discovery and momentum migration complete.\n";
