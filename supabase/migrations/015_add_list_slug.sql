-- Add slug column to lists
ALTER TABLE lists ADD COLUMN slug TEXT;

-- Function to generate a slug from a name
CREATE OR REPLACE FUNCTION generate_slug(input_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
BEGIN
  -- Lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens, trim hyphens
  base_slug := trim(both '-' from regexp_replace(
    regexp_replace(lower(input_name), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
  IF base_slug = '' THEN
    base_slug := 'untitled';
  END IF;
  RETURN base_slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate a unique slug (appends -2, -3, etc. if needed)
CREATE OR REPLACE FUNCTION generate_unique_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter INT := 1;
BEGIN
  base_slug := generate_slug(NEW.name);
  candidate := base_slug;

  LOOP
    -- Check if this slug is taken by another list
    IF NOT EXISTS (SELECT 1 FROM lists WHERE slug = candidate AND id != NEW.id) THEN
      NEW.slug := candidate;
      RETURN NEW;
    END IF;
    counter := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-generate slug on INSERT or UPDATE of name
CREATE TRIGGER set_list_slug
  BEFORE INSERT OR UPDATE OF name ON lists
  FOR EACH ROW
  EXECUTE FUNCTION generate_unique_slug();

-- Backfill existing lists
UPDATE lists SET slug = NULL WHERE slug IS NULL;
-- The trigger fires on UPDATE, so we need to touch the name column
UPDATE lists SET name = name;

-- Now add unique constraint
ALTER TABLE lists ADD CONSTRAINT lists_slug_unique UNIQUE (slug);
