-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- ============================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================
-- LISTS TABLE
-- ============================================
create table public.lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index lists_user_id_idx on public.lists(user_id);

alter table public.lists enable row level security;

create policy "Users can view own lists"
  on public.lists for select
  using (auth.uid() = user_id);

create policy "Users can insert own lists"
  on public.lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own lists"
  on public.lists for update
  using (auth.uid() = user_id);

create policy "Users can delete own lists"
  on public.lists for delete
  using (auth.uid() = user_id);

-- ============================================
-- BOOKS TABLE (cached book metadata)
-- ============================================
create table public.books (
  id uuid default uuid_generate_v4() primary key,
  goodreads_url text unique not null,
  title text not null,
  author text,
  cover_image_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index books_goodreads_url_idx on public.books(goodreads_url);

alter table public.books enable row level security;

create policy "Authenticated users can view books"
  on public.books for select
  to authenticated
  using (true);

-- ============================================
-- LIST_ITEMS TABLE (junction table)
-- ============================================
create table public.list_items (
  id uuid default uuid_generate_v4() primary key,
  list_id uuid references public.lists(id) on delete cascade not null,
  book_id uuid references public.books(id) on delete cascade not null,
  added_at timestamptz default now() not null,
  unique(list_id, book_id)
);

create index list_items_list_id_idx on public.list_items(list_id);
create index list_items_book_id_idx on public.list_items(book_id);

alter table public.list_items enable row level security;

create policy "Users can view own list items"
  on public.list_items for select
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
      and lists.user_id = auth.uid()
    )
  );

create policy "Users can insert to own lists"
  on public.list_items for insert
  with check (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
      and lists.user_id = auth.uid()
    )
  );

create policy "Users can delete own list items"
  on public.list_items for delete
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
      and lists.user_id = auth.uid()
    )
  );

-- ============================================
-- FUNCTION: Auto-create profile on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- FUNCTION: Delete user account
-- ============================================
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

-- ============================================
-- FUNCTION: Updated_at trigger
-- ============================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_lists_updated_at
  before update on public.lists
  for each row execute procedure public.set_updated_at();

create trigger set_books_updated_at
  before update on public.books
  for each row execute procedure public.set_updated_at();
