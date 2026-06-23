-- Run this in your Supabase SQL editor

-- 1. Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text not null,
  company text not null,
  role text not null check (role in ('admin', 'shipping_line', 'cha')),
  status text not null default 'pending' check (status in ('active', 'pending', 'rejected')),
  created_at timestamptz default now()
);

-- 2. Manifests table
create table if not exists public.manifests (
  id uuid default gen_random_uuid() primary key,
  vessel_name text not null,
  voyage_no text not null,
  rotation_no text not null,
  file_path text,
  file_name text,
  raw_content text,
  uploaded_by uuid references public.profiles(id),
  uploader_name text,
  uploader_company text,
  status text not null default 'departed' check (status in ('arrived', 'in-transit', 'departed')),
  created_at timestamptz default now()
);

-- 3. Row Level Security

alter table public.profiles enable row level security;
alter table public.manifests enable row level security;

-- Profiles: users can read their own, admin can read all
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Admin reads all profiles" on public.profiles for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Admin updates profiles" on public.profiles for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Insert own profile on signup" on public.profiles for insert with check (auth.uid() = id);

-- Manifests: shipping line sees own, CHA/admin sees all
create policy "Shipping line sees own manifests" on public.manifests for select using (
  uploaded_by = auth.uid() and
  exists (select 1 from public.profiles where id = auth.uid() and role = 'shipping_line')
);
create policy "CHA and admin see all manifests" on public.manifests for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('cha', 'admin'))
);
create policy "Active users can upload manifests" on public.manifests for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
);

-- 4. Storage bucket for manifest JSON files
insert into storage.buckets (id, name, public) values ('manifests', 'manifests', false) on conflict do nothing;

create policy "Active users can upload" on storage.objects for insert with check (
  bucket_id = 'manifests' and
  exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
);
create policy "Own files readable" on storage.objects for select using (
  bucket_id = 'manifests' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Admin reads all files" on storage.objects for select using (
  bucket_id = 'manifests' and
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "CHA reads all files" on storage.objects for select using (
  bucket_id = 'manifests' and
  exists (select 1 from public.profiles where id = auth.uid() and role = 'cha')
);
