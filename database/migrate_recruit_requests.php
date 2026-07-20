<?php
if(PHP_SAPI==='cli')session_save_path(sys_get_temp_dir());
require __DIR__.'/../api/_bootstrap.php';global $db;
$has=function(string $column)use($db):bool{$c=$db->real_escape_string($column);$r=$db->query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='recruit_encounters' AND COLUMN_NAME='$c'");return$r&&$r->num_rows>0;};
if(!$has('met_at'))$db->query("ALTER TABLE recruit_encounters ADD COLUMN met_at INT NOT NULL DEFAULT 0 AFTER defense_stat");
if(!$has('required_item'))$db->query("ALTER TABLE recruit_encounters ADD COLUMN required_item INT NULL AFTER met_at, ADD KEY recruit_required_item(required_item), ADD CONSTRAINT recruit_required_item_fk FOREIGN KEY(required_item) REFERENCES items(id) ON DELETE SET NULL");
$db->query("UPDATE recruit_encounters SET required_item=CASE MOD(id+attack_stat*2+defense_stat,6) WHEN 0 THEN 3 WHEN 1 THEN 4 WHEN 2 THEN 5 WHEN 3 THEN 6 WHEN 4 THEN 7 ELSE 8 END WHERE found_at=0 AND required_item IS NULL");
echo "Recruit request migration complete.\n";
