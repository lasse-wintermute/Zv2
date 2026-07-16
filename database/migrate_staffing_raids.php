<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$host=getenv('ZV2_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('ZV2_DB_PORT')?:3306);$user=getenv('ZV2_DB_USER')?:'root';$pass=getenv('ZV2_DB_PASS')?:'';$name=getenv('ZV2_DB_NAME')?:'zv2';
$db=new mysqli($host,$user,$pass,$name,$port);if($db->connect_errno)die("Database connection failed.\n");$now=time();
$db->query("ALTER TABLE strongholds ADD COLUMN IF NOT EXISTS world_started INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS last_raid_cycle INT NOT NULL DEFAULT 0");
$db->query("UPDATE strongholds SET world_started=$now WHERE world_started=0");
$db->query("ALTER TABLE survivors ADD COLUMN IF NOT EXISTS job_facility INT NULL, ADD COLUMN IF NOT EXISTS fatigue DECIMAL(5,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS recovery_progress DECIMAL(8,3) NOT NULL DEFAULT 0");
$db->query("CREATE TABLE IF NOT EXISTS raids (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,userid INT UNSIGNED NOT NULL,day_number INT NOT NULL,threat INT NOT NULL,defense INT NOT NULL,success TINYINT(1) NOT NULL,resource_loss INT NOT NULL DEFAULT 0,wounded_survivor INT UNSIGNED NULL,damage INT NOT NULL DEFAULT 0,created_at INT NOT NULL,UNIQUE KEY user_day(userid,day_number),FOREIGN KEY(userid) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$rows=$db->query('SELECT userid,buildings FROM strongholds');while($rows&&($row=$rows->fetch_assoc())){$levels=explode('|',$row['buildings']);foreach([8,9,16]as$slot)if((int)($levels[$slot]??0)<1)$levels[$slot]=1;$encoded=$db->real_escape_string(implode('|',$levels));$db->query("UPDATE strongholds SET buildings='$encoded' WHERE userid=".(int)$row['userid']);}
echo "Staffing, fatigue, day/night, and raid migration complete.\n";
