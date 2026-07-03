-- SRZ Editor — Supabase schema
-- Run this in the Supabase SQL Editor

-- Plantillas (conceptos reutilizables)
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  aspect_ratio text default '9:16',
  fps int default 60,
  resolution text default '1080p',
  total_duration numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Slots de clip dentro de una plantilla
create table if not exists template_clip_slots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  slot_order int not null,
  label text not null,
  duration numeric not null,
  start_at numeric not null
);

-- Librería de textos (referenciada por template_text_slots, pero también independiente)
create table if not exists text_library (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  tags text[],
  created_at timestamptz default now()
);

-- Librería de canciones
create table if not exists song_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  duration numeric,
  created_at timestamptz default now()
);

-- Posiciones/timing de texto dentro de una plantilla
create table if not exists template_text_slots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  position_x numeric not null,
  position_y numeric not null,
  start_at numeric not null,
  end_at numeric not null,
  default_text_id uuid references text_library(id) on delete set null
);

-- Timing de audio dentro de una plantilla
create table if not exists template_audio_slot (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  start_at numeric not null,
  default_song_id uuid references song_library(id) on delete set null
);

-- Proyectos de vídeo (instancias editadas a partir de una plantilla)
create table if not exists video_projects (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete set null,
  status text default 'draft' check (status in ('draft', 'rendering', 'done', 'failed')),
  final_video_path text,
  created_at timestamptz default now()
);

-- Clips subidos para un proyecto concreto
create table if not exists project_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references video_projects(id) on delete cascade,
  slot_id uuid references template_clip_slots(id) on delete set null,
  storage_path text not null,
  duration_override numeric
);

-- Textos elegidos/editados para un proyecto concreto
create table if not exists project_texts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references video_projects(id) on delete cascade,
  text_slot_id uuid references template_text_slots(id) on delete set null,
  final_text text not null,
  position_override_x numeric,
  position_override_y numeric
);

-- Canción elegida para un proyecto concreto
create table if not exists project_audio (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references video_projects(id) on delete cascade,
  song_id uuid references song_library(id) on delete set null,
  start_at_override numeric
);

-- Storage bucket (ejecutar por separado en Supabase Storage o via API)
-- Nombre: srz-media
-- Public: true (para acceder a URLs directas de clips y canciones)
-- Allowed MIME types: video/*, audio/*

-- RLS: desactivado (uso personal, sin auth)
alter table templates disable row level security;
alter table template_clip_slots disable row level security;
alter table template_text_slots disable row level security;
alter table template_audio_slot disable row level security;
alter table text_library disable row level security;
alter table song_library disable row level security;
alter table video_projects disable row level security;
alter table project_clips disable row level security;
alter table project_texts disable row level security;
alter table project_audio disable row level security;
