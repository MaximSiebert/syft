-- Only bump updated_at on item add, not delete
DROP TRIGGER IF EXISTS touch_list_on_item_delete ON public.list_items;
