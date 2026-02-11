-- Rename books table to items (more generic)
ALTER TABLE public.books RENAME TO items;

-- Rename goodreads_url to url
ALTER TABLE public.items RENAME COLUMN goodreads_url TO url;

-- Rename author to creator (works for both author and director)
ALTER TABLE public.items RENAME COLUMN author TO creator;

-- Add type column
ALTER TABLE public.items ADD COLUMN type text NOT NULL DEFAULT 'book';

-- Add source column to track where it came from (goodreads, imdb, etc)
ALTER TABLE public.items ADD COLUMN source text;

-- Update the index name
ALTER INDEX books_goodreads_url_idx RENAME TO items_url_idx;

-- Update foreign key references in list_items
ALTER TABLE public.list_items RENAME COLUMN book_id TO item_id;

-- Rename the index
ALTER INDEX list_items_book_id_idx RENAME TO list_items_item_id_idx;
