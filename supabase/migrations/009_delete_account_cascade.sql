-- Update delete_user_account to also delete all items belonging to the user's lists
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Delete items that belong to the user's lists
  DELETE FROM public.items
  WHERE id IN (
    SELECT li.item_id FROM public.list_items li
    JOIN public.lists l ON li.list_id = l.id
    WHERE l.user_id = auth.uid()
  );

  -- Cascade handles: lists -> list_items, profiles
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
