-- Create covers bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('covers', 'covers', true)
ON CONFLICT (id) DO NOTHING;

-- Create avatars bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read covers" ON storage.objects FOR SELECT USING (bucket_id = 'covers');
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- Insert/update/delete for covers (service role bypasses RLS, but needed for completeness)
CREATE POLICY "Insert covers" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'covers');
CREATE POLICY "Update covers" ON storage.objects FOR UPDATE USING (bucket_id = 'covers');
CREATE POLICY "Delete covers" ON storage.objects FOR DELETE USING (bucket_id = 'covers');

-- Insert/update/delete for avatars
CREATE POLICY "Insert avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Update avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');
CREATE POLICY "Delete avatars" ON storage.objects FOR DELETE USING (bucket_id = 'avatars');
