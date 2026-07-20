<?php
// CLI installer for the standalone Zv2 database. Safe to rerun only after dropping zv2.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$host=getenv('ZV2_DB_HOST')?:'127.0.0.1'; $port=(int)(getenv('ZV2_DB_PORT')?:3306);
$user=getenv('ZV2_DB_USER')?:'root'; $pass=getenv('ZV2_DB_PASS')?:''; $name=getenv('ZV2_DB_NAME')?:'zv2';
$db=new mysqli($host,$user,$pass,'',$port); if($db->connect_errno) die("Database connection failed: {$db->connect_error}\n");
$safe=preg_replace('/[^a-zA-Z0-9_]/','',$name); $db->query("CREATE DATABASE IF NOT EXISTS `$safe` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); $db->select_db($safe);
if($db->query("SHOW TABLES LIKE 'users'")->num_rows){ echo "Database $safe already installed.\n"; exit; }
$sql=file_get_contents(__DIR__.'/schema.sql'); if(!$db->multi_query($sql)) die("Schema failed: {$db->error}\n"); while($db->more_results()&&$db->next_result()){}
$types=range(1,10); $roomTypes=range(1,9);
for($y=1;$y<=50;$y++) for($x=1;$x<=50;$x++){
  $type=$types[(($x*17+$y*31)%count($types))]; $rooms=2+(($x*7+$y*11)%7);
  $db->query("INSERT INTO buildings(x,y,typ,count_rooms) VALUES($x,$y,$type,$rooms)"); $bid=$db->insert_id;
  for($n=0;$n<$rooms;$n++){
    $rt=$roomTypes[(($x+$y+$n*3)%count($roomTypes))]; $item=1+(($x*3+$y+$n)%10); $qty=1+(($x+$y+$n)%3);
    $z=(($x+$y+$n)%4===0)?(string)(1+(($x+$n)%3)).'|'.(1+(($y+$n)%3)):'';
    $db->query("INSERT INTO roommap(buildingid,type,inventory,zombies) VALUES($bid,$rt,'$item|$qty','$z')");
  }
}
for($f=1;$f<=18;$f++) for($lvl=1;$lvl<=10;$lvl++){
  $wood=10*$lvl*$lvl; $metal=8*$lvl*$lvl; $duration=15*$lvl;
  $db->query("INSERT INTO facility_costs(facility_id,level,wood,metal,duration) VALUES($f,$lvl,$wood,$metal,$duration)");
}
$migrations=glob(__DIR__.'/migrations/*.sql'); sort($migrations);
foreach($migrations as $mf){
  $sql=file_get_contents($mf);
  if(!$db->multi_query($sql)) die('Migration '.basename($mf)." failed: {$db->error}\n");
  while($db->more_results()&&$db->next_result()){}
  if($db->errno) die('Migration '.basename($mf)." failed: {$db->error}\n");
}
echo "Standalone database $safe installed with 2,500 locations and ".count($migrations)." migrations.\n";
