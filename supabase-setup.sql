-- CampusSync Noticeboard: database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.

-- 1. The table that holds notices
create table if not exists notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  body        text not null default '',
  category    text not null default 'General',
  event_date  date,
  author      text not null default '',
  image_url   text,
  image_path  text,
  starred     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 2. Rules: anyone with the link can read, add, edit and delete notices
alter table notices enable row level security;

create policy "anyone can read notices"   on notices for select using (true);
create policy "anyone can add notices"    on notices for insert with check (true);
create policy "anyone can edit notices"   on notices for update using (true) with check (true);
create policy "anyone can delete notices" on notices for delete using (true);

-- 3. Live updates: other people's changes appear without refreshing
alter publication supabase_realtime add table notices;

-- 4. A public storage bucket for flyer images
insert into storage.buckets (id, name, public)
values ('flyers', 'flyers', true)
on conflict (id) do nothing;

create policy "anyone can view flyers"   on storage.objects for select using (bucket_id = 'flyers');
create policy "anyone can upload flyers" on storage.objects for insert with check (bucket_id = 'flyers');
create policy "anyone can delete flyers" on storage.objects for delete using (bucket_id = 'flyers');
