-- Add position column
ALTER TABLE public.list_items ADD COLUMN position integer;

-- Backfill positions from current added_at DESC order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY list_id ORDER BY added_at DESC) - 1 AS pos
  FROM public.list_items
)
UPDATE public.list_items SET position = ranked.pos FROM ranked WHERE list_items.id = ranked.id;

ALTER TABLE public.list_items ALTER COLUMN position SET NOT NULL;
ALTER TABLE public.list_items ALTER COLUMN position SET DEFAULT 0;

CREATE INDEX list_items_position_idx ON public.list_items (list_id, position);

-- UPDATE RLS policy (currently missing)
CREATE POLICY "Users can update own list items"
  ON public.list_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.lists WHERE lists.id = list_items.list_id AND lists.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lists WHERE lists.id = list_items.list_id AND lists.user_id = auth.uid()));

-- Atomic position shift for new item insertion at top
CREATE OR REPLACE FUNCTION shift_list_positions(p_list_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.list_items SET position = position + 1 WHERE list_id = p_list_id;
$$;

-- Atomic reorder function
CREATE OR REPLACE FUNCTION reorder_list_item(p_list_id uuid, p_item_id uuid, p_new_position integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
