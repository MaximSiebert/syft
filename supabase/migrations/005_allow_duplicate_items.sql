-- Allow duplicate items with the same URL
-- Drop the unique constraint on items.url so different users/lists can have their own item records
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS books_goodreads_url_key;

-- Drop the unique index if it exists
DROP INDEX IF EXISTS items_url_idx;

-- Re-create a non-unique index for URL lookups
CREATE INDEX IF NOT EXISTS items_url_idx ON public.items (url);
