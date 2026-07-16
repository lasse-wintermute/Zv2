<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$host=getenv('ZV2_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('ZV2_DB_PORT')?:3306);$user=getenv('ZV2_DB_USER')?:'root';$pass=getenv('ZV2_DB_PASS')?:'';$name=getenv('ZV2_DB_NAME')?:'zv2';
$db=new mysqli($host,$user,$pass,$name,$port);if($db->connect_errno)die("Database connection failed.\n");
$db->query("ALTER TABLE items ADD COLUMN IF NOT EXISTS attack_bonus INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS healing INT NOT NULL DEFAULT 0");
$db->query("INSERT INTO items(id,name,category,attack_bonus,healing) VALUES(9,'Pipe pistol','weapon',3,0),(10,'Machete','weapon',2,0) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),attack_bonus=VALUES(attack_bonus),healing=VALUES(healing)");
$db->query("UPDATE items SET healing=CASE id WHEN 3 THEN 1 WHEN 4 THEN 1 WHEN 5 THEN 5 ELSE healing END WHERE id IN(3,4,5)");
$db->query("CREATE TABLE IF NOT EXISTS survivors (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,userid INT UNSIGNED NOT NULL,name VARCHAR(40) NOT NULL,hp INT NOT NULL DEFAULT 12,max_hp INT NOT NULL DEFAULT 12,attack_stat INT NOT NULL DEFAULT 3,defense_stat INT NOT NULL DEFAULT 1,equipped_weapon INT NULL,FOREIGN KEY(userid) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(equipped_weapon) REFERENCES items(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$users=$db->query('SELECT id,username FROM users');while($users&&($u=$users->fetch_assoc())){$uid=(int)$u['id'];$c=$db->query("SELECT COUNT(*) n FROM survivors WHERE userid=$uid")->fetch_assoc();if((int)$c['n']===0){$base=$db->real_escape_string($u['username']);$db->query("INSERT INTO survivors(userid,name,hp,max_hp,attack_stat,defense_stat,equipped_weapon) VALUES($uid,'$base',14,14,4,2,10),($uid,'Mara',12,12,3,2,NULL),($uid,'Jonah',11,11,5,1,NULL)");$db->query("INSERT INTO inventory(userid,item_id,amount) VALUES($uid,10,1) ON DUPLICATE KEY UPDATE amount=GREATEST(amount,1)");}}
echo "Survivor and equipment migration complete.\n";
