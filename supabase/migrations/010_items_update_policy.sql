-- Allow authenticated users to update items (for inline editing of title/creator)
CREATE POLICY "Authenticated users can update items"
  ON public.items FOR UPDATE TO authenticated
  WITH CHECK (true);