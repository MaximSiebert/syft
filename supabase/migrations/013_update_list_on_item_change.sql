-- Bump lists.updated_at when items are added or removed
CREATE OR REPLACE FUNCTION public.touch_list_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.lists
  SET updated_at = now()
  WHERE id = COALESCE(NEW.list_id, OLD.list_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER touch_list_on_item_insert
  AFTER INSERT ON public.list_items
  FOR EACH ROW EXECUTE PROCEDURE public.touch_list_updated_at();

CREATE TRIGGER touch_list_on_item_delete
  AFTER DELETE ON public.list_items
  FOR EACH ROW EXECUTE PROCEDURE public.touch_list_updated_at();
