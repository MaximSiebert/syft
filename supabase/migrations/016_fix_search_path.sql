-- Fix mutable search_path on all functions

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_list_positions(p_list_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.list_items SET position = position + 1 WHERE list_id = p_list_id;
$$;

CREATE OR REPLACE FUNCTION public.reorder_list_item(p_list_id uuid, p_item_id uuid, p_new_position integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old integer;
BEGIN
  SELECT position INTO v_old FROM public.list_items WHERE id = p_item_id AND list_id = p_list_id;
  IF v_old IS NULL OR v_old = p_new_position THEN RETURN; END IF;

  IF p_new_position < v_old THEN
    UPDATE public.list_items SET position = position + 1
      WHERE list_id = p_list_id AND position >= p_new_position AND position < v_old;
  ELSE
    UPDATE public.list_items SET position = position - 1
      WHERE list_id = p_list_id AND position > v_old AND position <= p_new_position;
  END IF;

  UPDATE public.list_items SET position = p_new_position WHERE id = p_item_id AND list_id = p_list_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_list_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.lists
  SET updated_at = now()
  WHERE id = COALESCE(NEW.list_id, OLD.list_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_slug(input_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
BEGIN
  base_slug := trim(both '-' from regexp_replace(
    regexp_replace(lower(input_name), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
  IF base_slug = '' THEN
    base_slug := 'untitled';
  END IF;
  RETURN base_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter INT := 1;
BEGIN
  base_slug := generate_slug(NEW.name);
  candidate := base_slug;

  LOOP
    IF NOT EXISTS (SELECT 1 FROM lists WHERE slug = candidate AND id != NEW.id) THEN
      NEW.slug := candidate;
      RETURN NEW;
    END IF;
    counter := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;
END;
$$;
