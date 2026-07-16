<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}$host=getenv('ZV2_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('ZV2_DB_PORT')?:3306);$user=getenv('ZV2_DB_USER')?:'root';$pass=getenv('ZV2_DB_PASS')?:'';$name=getenv('ZV2_DB_NAME')?:'zv2';$db=new mysqli($host,$user,$pass,$name,$port);if($db->connect_errno)die("Database connection failed.\n");
$db->query("CREATE TABLE IF NOT EXISTS squad_travel (userid INT UNSIGNED PRIMARY KEY,x INT NOT NULL,y INT NOT NULL,target_x INT NULL,target_y INT NULL,arrives_at INT NOT NULL DEFAULT 0,crew VARCHAR(255) NOT NULL DEFAULT '',FOREIGN KEY(userid) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$db->query("ALTER TABLE squad_travel ADD COLUMN IF NOT EXISTS started_at INT NOT NULL DEFAULT 0 AFTER target_y");
$db->query("ALTER TABLE strongholds DROP COLUMN IF EXISTS actionpoints");
$r=$db->query("SELECT userid,location FROM strongholds");while($r&&($s=$r->fetch_assoc())){$p=explode('|',$s['location']);$uid=(int)$s['userid'];$x=(int)($p[0]??1);$y=(int)($p[1]??1);$db->query("INSERT IGNORE INTO squad_travel(userid,x,y) VALUES($uid,$x,$y)");}echo "Squad travel migration complete.\n";
