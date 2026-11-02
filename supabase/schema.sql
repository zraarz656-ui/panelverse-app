-- PanelVerse Complete Supabase Postgres Schema & Storage Setup
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ahizfmtvgrfujoipmtdq/sql

-- 1. Create the public 'content' bucket for HD WebP chapter pages and series covers
insert into storage.buckets (id, name, public)
values ('content', 'content', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Read Access on content bucket" on storage.objects;
create policy "Public Read Access on content bucket"
on storage.objects for select
using ( bucket_id = 'content' );

drop policy if exists "Allow Upload Access on content bucket" on storage.objects;
create policy "Allow Upload Access on content bucket"
on storage.objects for insert
with check ( bucket_id = 'content' );

drop policy if exists "Allow Update Access on content bucket" on storage.objects;
create policy "Allow Update Access on content bucket"
on storage.objects for update
using ( bucket_id = 'content' );

-- 2. Series Catalog Table
create table if not exists public.series (
  id text primary key,
  slug text not null,
  title text not null,
  origin text not null default 'manhwa',
  type text not null default 'webtoon',
  author text not null default 'Unknown',
  artist text not null default 'Unknown',
  status text not null default 'Ongoing',
  release_day text not null default 'Friday',
  synopsis text not null default '',
  cover_image text not null default '/placeholder.jpg',
  genres text[] not null default array['Action'],
  rating numeric(3,2) not null default 4.90,
  total_views integer not null default 100,
  chapters_count integer not null default 0,
  featured boolean not null default false,
  is_deleted boolean not null default false,
  malayalam_title text,
  malayalam_synopsis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Chapters Table
create table if not exists public.chapters (
  id text primary key,
  series_id text not null,
  chapter_number numeric not null,
  title text not null,
  release_date text not null default 'Recent',
  views integer not null default 1,
  page_urls text[] not null default array[]::text[],
  pages jsonb not null default '[]'::jsonb,
  pages_count integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chapters_series_id on public.chapters(series_id);

-- 4. User Reading Progress Table
create table if not exists public.reading_progress (
  id text primary key, -- format: {user_id}__{series_id}
  user_id text not null,
  series_id text not null,
  chapter_id text not null,
  chapter_number numeric not null default 1,
  series_title text not null default 'Series',
  series_slug text not null default '',
  series_type text not null default 'webtoon',
  cover_image text not null default '/placeholder.jpg',
  page_index integer not null default 0,
  total_pages integer not null default 1,
  scroll_percentage integer not null default 0,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, series_id)
);

create index if not exists idx_reading_progress_user_id on public.reading_progress(user_id);

-- 5. Episode Comments Table
create table if not exists public.comments (
  id text primary key,
  chapter_id text not null,
  series_id text not null,
  author_id text not null,
  username text not null default 'Reader',
  content text not null,
  spoiler boolean not null default false,
  upvotes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_comments_chapter_id on public.comments(chapter_id);

-- 6. Community Series Requests Table
create table if not exists public.requests (
  id text primary key,
  title text not null,
  type text not null default 'webtoon',
  author text not null default 'Unknown Studio',
  reason text not null default '',
  requested_by text not null default 'Reader',
  author_id text not null default 'guest',
  votes integer not null default 1,
  status text not null default 'Pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS) with public/anon policies for seamless client + server sync
alter table public.series enable row level security;
alter table public.chapters enable row level security;
alter table public.reading_progress enable row level security;
alter table public.comments enable row level security;
alter table public.requests enable row level security;

drop policy if exists "Public access series" on public.series;
create policy "Public access series" on public.series for all using (true) with check (true);

drop policy if exists "Public access chapters" on public.chapters;
create policy "Public access chapters" on public.chapters for all using (true) with check (true);

drop policy if exists "Public access reading_progress" on public.reading_progress;
create policy "Public access reading_progress" on public.reading_progress for all using (true) with check (true);

drop policy if exists "Public access comments" on public.comments;
create policy "Public access comments" on public.comments for all using (true) with check (true);

drop policy if exists "Public access requests" on public.requests;
create policy "Public access requests" on public.requests for all using (true) with check (true);

-- 7. PanelVerse Studio Pre-Translated Overlays & Panel Cuts Table
create table if not exists public.chapter_edits (
  id text primary key, -- format: "{series_id}_{chapter_id}_{lang}"
  series_id text not null,
  chapter_id text not null,
  language_code text not null default 'en',
  data jsonb not null default '{"version":1,"pages":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_chapter_edits_chapter on public.chapter_edits(series_id, chapter_id);

alter table public.chapter_edits enable row level security;

drop policy if exists "Public access chapter_edits" on public.chapter_edits;
create policy "Public access chapter_edits" on public.chapter_edits for all using (true) with check (true);

