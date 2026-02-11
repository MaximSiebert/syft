-- ============================================
-- EXPLORE PAGE: Open RLS for public reading
-- ============================================

-- Allow any authenticated user to view all lists
CREATE POLICY "Anyone can view all lists"
  ON public.lists FOR SELECT TO authenticated
  USING (true);

-- Allow any authenticated user to view all list items
CREATE POLICY "Anyone can view all list items"
  ON public.list_items FOR SELECT TO authenticated
  USING (true);

-- Allow any authenticated user to view all profiles
CREATE POLICY "Anyone can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- Index for sorting lists by updated_at
CREATE INDEX IF NOT EXISTS lists_updated_at_idx ON public.lists (updated_at DESC);
