-- ============================================================================
-- StateFlow Cloud Sync Database Schema (Supabase)
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. Create the notes table
create table if not exists public.notes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null default 'Untitled Note',
  content text default '',
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Create index for fast user queries
create index if not exists idx_notes_user_id on public.notes(user_id);
create index if not exists idx_notes_pinned on public.notes(pinned);

-- 3. Enable Row-Level Security (RLS) so each user can ONLY access their own notes
alter table public.notes enable row level security;

-- 4. Create RLS Policies
drop policy if exists "Users can view their own notes" on public.notes;
create policy "Users can view their own notes"
  on public.notes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notes" on public.notes;
create policy "Users can insert their own notes"
  on public.notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes"
  on public.notes for delete
  using (auth.uid() = user_id);

-- Optional: Enable Realtime for live cross-device sync
alter publication supabase_realtime add table public.notes;
