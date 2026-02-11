-- Fix: add USING clause so rows are visible for update
DROP POLICY "Authenticated users can update items" ON public.items;
CREATE POLICY "Authenticated users can update items"
  ON public.items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
