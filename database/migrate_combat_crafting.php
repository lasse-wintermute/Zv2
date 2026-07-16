<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$host=getenv('ZV2_DB_HOST')?:'127.0.0.1';$port=(int)(getenv('ZV2_DB_PORT')?:3306);$user=getenv('ZV2_DB_USER')?:'root';$pass=getenv('ZV2_DB_PASS')?:'';$name=getenv('ZV2_DB_NAME')?:'zv2';
$db=new mysqli($host,$user,$pass,$name,$port);if($db->connect_errno)die("Database connection failed.\n");
$db->query("ALTER TABLE items ADD COLUMN IF NOT EXISTS ammo_item INT NULL, ADD COLUMN IF NOT EXISTS max_durability INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS repair_amount INT NOT NULL DEFAULT 0");
$db->query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS durability INT NULL");
$db->query("INSERT INTO items(id,name,category,attack_bonus,healing,ammo_item,max_durability,repair_amount) VALUES(11,'Repair kit','repair',0,0,NULL,0,8) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),repair_amount=VALUES(repair_amount)");
$db->query("UPDATE items SET ammo_item=6,max_durability=12 WHERE id=9");
$db->query("UPDATE items SET ammo_item=NULL,max_durability=18 WHERE id=10");
$db->query("UPDATE inventory v JOIN items i ON i.id=v.item_id SET v.durability=i.max_durability WHERE i.max_durability>0 AND v.durability IS NULL");
$db->query("CREATE TABLE IF NOT EXISTS recipes (id INT PRIMARY KEY,name VARCHAR(100) NOT NULL,result_item INT NOT NULL,result_amount INT NOT NULL DEFAULT 1,ap_cost INT NOT NULL DEFAULT 1,FOREIGN KEY(result_item) REFERENCES items(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$db->query("CREATE TABLE IF NOT EXISTS recipe_ingredients (recipe_id INT NOT NULL,item_id INT NOT NULL,amount INT NOT NULL,PRIMARY KEY(recipe_id,item_id),FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,FOREIGN KEY(item_id) REFERENCES items(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$db->query("INSERT INTO recipes(id,name,result_item,result_amount,ap_cost) VALUES(1,'Hand-load 9mm rounds',6,6,1),(2,'Build pipe pistol',9,1,3),(3,'Forge machete',10,1,2),(4,'Make bandages',5,2,1),(5,'Assemble repair kit',11,1,2) ON DUPLICATE KEY UPDATE name=VALUES(name),result_item=VALUES(result_item),result_amount=VALUES(result_amount),ap_cost=VALUES(ap_cost)");
$db->query("INSERT INTO recipe_ingredients(recipe_id,item_id,amount) VALUES(1,1,2),(2,1,4),(2,8,2),(3,1,3),(3,2,1),(4,2,1),(4,4,1),(5,1,2),(5,2,1) ON DUPLICATE KEY UPDATE amount=VALUES(amount)");
echo "Combat resources and crafting migration complete.\n";
