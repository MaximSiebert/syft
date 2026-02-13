-- Update existing items to use Supabase Storage URLs
-- Joins items table with storage.objects to find matching covers
UPDATE public.items i
SET cover_image_url =
  'https://xwlcndsfhlrzhywvygbn.supabase.co/storage/v1/object/public/covers/' || o.name
FROM storage.objects o
WHERE o.bucket_id = 'covers'
  AND o.name LIKE i.id::text || '.%'
  AND i.cover_image_url IS NOT NULL
  AND i.cover_image_url NOT LIKE '%/storage/v1/object/public/covers/%';
