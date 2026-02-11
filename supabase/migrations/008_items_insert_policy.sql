-- Allow authenticated users to insert items directly (for text items)
CREATE POLICY "Authenticated users can insert items"
  ON public.items FOR INSERT TO authenticated
  WITH CHECK (true);
