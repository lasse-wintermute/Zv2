-- Toolshop production requires at least one rested assigned technician.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS technicians_required INT NOT NULL DEFAULT 1 AFTER toolshop_level;
