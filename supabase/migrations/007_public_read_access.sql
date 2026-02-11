-- ============================================
-- Allow anonymous (logged-out) users to read public data
-- ============================================

-- Lists
CREATE POLICY "Anon can view all lists"
  ON public.lists FOR SELECT TO anon
  USING (true);

-- List items
CREATE POLICY "Anon can view all list items"
  ON public.list_items FOR SELECT TO anon
  USING (true);

-- Items
CREATE POLICY "Anon can view all items"
  ON public.items FOR SELECT TO anon
  USING (true);

-- Profiles
CREATE POLICY "Anon can view all profiles"
  ON public.profiles FOR SELECT TO anon
  USING (true);
