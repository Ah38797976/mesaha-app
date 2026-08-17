-- ============================================================
-- مساحتنا (Mesaha) — Supabase schema
-- Run this whole file once in Supabase SQL editor on a fresh project.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. profiles  (one row per auth.users user)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  country text,
  lang text not null default 'ar' check (lang in ('ar','fr','en')),
  dark_mode boolean not null default true,
  avatar_path text,
  last_seen_at timestamptz not null default now(),
  is_online boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. couples  (one row per pair/space)
-- ------------------------------------------------------------
create table if not exists public.couples (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default substr(replace(uuid_generate_v4()::text,'-',''),1,8),
  start_date date,
  couple_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. couple_members  (links a user to a couple; max 2 members enforced by trigger)
-- ------------------------------------------------------------
create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create or replace function public.enforce_two_members()
returns trigger language plpgsql as $$
declare cnt int;
begin
  select count(*) into cnt from public.couple_members where couple_id = new.couple_id;
  if cnt >= 2 then
    raise exception 'هذه المساحة مكتملة بالفعل — شخصين فقط';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_two_members on public.couple_members;
create trigger trg_enforce_two_members
  before insert on public.couple_members
  for each row execute function public.enforce_two_members();

-- helper: is the current user a member of this couple?
create or replace function public.is_couple_member(cid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.couple_members m
    where m.couple_id = cid and m.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- 4. messages
-- ------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'text' check (type in ('text','image','voice')),
  text text,
  media_path text,
  voice_duration_seconds int,
  reply_to_id uuid references public.messages(id) on delete set null,
  status text not null default 'sent' check (status in ('sent','delivered','read')),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_couple on public.messages(couple_id, created_at desc);

-- ------------------------------------------------------------
-- 5. secret_messages
-- ------------------------------------------------------------
create table if not exists public.secret_messages (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  unlock_at timestamptz not null,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_secret_couple on public.secret_messages(couple_id, unlock_at);

-- ------------------------------------------------------------
-- 6. memories
-- ------------------------------------------------------------
create table if not exists public.memories (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  memory_date date not null,
  note text,
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists idx_memories_couple on public.memories(couple_id, memory_date);

-- ------------------------------------------------------------
-- 7. occasions
-- ------------------------------------------------------------
create table if not exists public.occasions (
  id uuid primary key default uuid_generate_v4(),
  added_by uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null,
  occasion_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_occasions_couple on public.occasions(couple_id);

-- ------------------------------------------------------------
-- 8. phrases (الحسانية)
-- ------------------------------------------------------------
create table if not exists public.phrases (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_phrases_couple on public.phrases(couple_id);

-- ------------------------------------------------------------
-- 9. stories (قصص زوين)
-- ------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_stories_couple on public.stories(couple_id);

-- ------------------------------------------------------------
-- 10. majlis_questions (static catalog, seeded once — shared read-only reference)
-- ------------------------------------------------------------
create table if not exists public.majlis_questions (
  id serial primary key,
  question text not null
);

-- ------------------------------------------------------------
-- 11. majlis_answers
-- ------------------------------------------------------------
create table if not exists public.majlis_answers (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  question_id int not null references public.majlis_questions(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_text text not null,
  created_at timestamptz not null default now(),
  unique (couple_id, question_id, user_id)
);
create index if not exists idx_majlis_answers on public.majlis_answers(couple_id, question_id);

-- ------------------------------------------------------------
-- 12. giffan_progress (one row per couple; tracks the shared game state)
-- ------------------------------------------------------------
create table if not exists public.giffan_progress (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  word_order jsonb not null default '[]'::jsonb,
  current_index int not null default 0,
  score_by_user jsonb not null default '{}'::jsonb,
  finished boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 13. notifications
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient on public.notifications(recipient_id, created_at desc);

-- ------------------------------------------------------------
-- updated_at trigger helper
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_couples_updated on public.couples;
create trigger trg_couples_updated before update on public.couples
  for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.messages enable row level security;
alter table public.secret_messages enable row level security;
alter table public.memories enable row level security;
alter table public.occasions enable row level security;
alter table public.phrases enable row level security;
alter table public.stories enable row level security;
alter table public.majlis_answers enable row level security;
alter table public.giffan_progress enable row level security;
alter table public.notifications enable row level security;
alter table public.majlis_questions enable row level security;

create policy "profiles_self_select" on public.profiles for select
  using (id = auth.uid());
create policy "profiles_partner_select" on public.profiles for select
  using (exists (
    select 1 from public.couple_members m1
    join public.couple_members m2 on m1.couple_id = m2.couple_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  ));
create policy "profiles_self_update" on public.profiles for update
  using (id = auth.uid());
create policy "profiles_self_insert" on public.profiles for insert
  with check (id = auth.uid());

create policy "couples_member_select" on public.couples for select
  using (public.is_couple_member(id) or created_by = auth.uid());
create policy "couples_insert_self" on public.couples for insert
  with check (created_by = auth.uid());
create policy "couples_member_update" on public.couples for update
  using (public.is_couple_member(id));

create policy "members_select" on public.couple_members for select
  using (public.is_couple_member(couple_id));
create policy "members_insert_self" on public.couple_members for insert
  with check (user_id = auth.uid());

create policy "messages_rw" on public.messages for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and sender_id = auth.uid());
create policy "messages_status_update" on public.messages for update
  using (public.is_couple_member(couple_id));

create policy "secret_rw" on public.secret_messages for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and sender_id = auth.uid());

create policy "memories_rw" on public.memories for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and added_by = auth.uid());

create policy "occasions_rw" on public.occasions for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and added_by = auth.uid());

create policy "phrases_rw" on public.phrases for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and added_by = auth.uid());

create policy "stories_rw" on public.stories for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and added_by = auth.uid());

create policy "majlis_answers_rw" on public.majlis_answers for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and user_id = auth.uid());

create policy "giffan_rw" on public.giffan_progress for all
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));

create policy "notifications_select_own" on public.notifications for select
  using (recipient_id = auth.uid());
create policy "notifications_insert_couple" on public.notifications for insert
  with check (public.is_couple_member(couple_id));
create policy "notifications_update_own" on public.notifications for update
  using (recipient_id = auth.uid());

create policy "majlis_questions_read_all" on public.majlis_questions for select
  using (true);

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.secret_messages;
alter publication supabase_realtime add table public.memories;
alter publication supabase_realtime add table public.occasions;
alter publication supabase_realtime add table public.phrases;
alter publication supabase_realtime add table public.stories;
alter publication supabase_realtime add table public.majlis_answers;
alter publication supabase_realtime add table public.giffan_progress;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.profiles;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('memories', 'memories', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('chat-media', 'chat-media', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('voice-notes', 'voice-notes', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('couple-photos', 'couple-photos', false)
  on conflict (id) do nothing;

create or replace function public.storage_couple_member(object_name text)
returns boolean language sql stable as $$
  select public.is_couple_member((split_part(object_name, '/', 1))::uuid);
$$;

create policy "storage_select_couple" on storage.objects for select
  using (bucket_id in ('avatars','memories','chat-media','voice-notes','couple-photos')
    and public.storage_couple_member(name));
create policy "storage_insert_couple" on storage.objects for insert
  with check (bucket_id in ('avatars','memories','chat-media','voice-notes','couple-photos')
    and public.storage_couple_member(name));
create policy "storage_delete_couple" on storage.objects for delete
  using (bucket_id in ('avatars','memories','chat-media','voice-notes','couple-photos')
    and public.storage_couple_member(name));

-- ============================================================
-- SEED: majlis question catalog
-- ============================================================
insert into public.majlis_questions (question) values
('شنهو أصعب شي فعلاقتنا و كيف نتغلبو اعليه؟'),
('آخر شي عدلتولك واشيان عندك 😢'),
('منين اتشوف علاقتنا بعد 5 سنوات 🥹'),
('شنهي الغيرة بالنسبة لك 🙃'),
('گط ارگدت منفگع اعليَ؟'),
('ازين گاف گط اسمعتو، شنهو وگولولي'),
('گط مرة أقصدت اتغيرني 🙂'),
('كط اتوحشتني وگير اجحدتها عني؟'),
('اينت ايعود الإهتمام مزعج بالنسبة لك؟'),
('شنهي اسرع طريقة ايگد حد يفگعك بيها؟'),
('شنهو أصعب شعور گط عشتو؟'),
('اعيت تتكلم مع راصك نين تبگ وحدك؟'),
('شنهي الطريقة اللي تبقيني نتم نعتذر بيها؟'),
('سولني سؤال مذالك تبقي تعرف جوابُ'),
('شنهي أفضل كلمة سمعتها مني ومستحيل تنساها؟'),
('منه اكثر حد يفهم الثاني؟'),
('شنهو اول إنطباع اگبظتو عني؟'),
('شنهي اكثر نقطة مشتركة بينا؟'),
('أغنية اتذكرك فيَ'),
('ايهم أجمل: ماضيك ولا حاضرك؟'),
('شنهي رواية فحياتنا اتخليك سعيد؟'),
('آخر شي عدلتو وگر فيك حتى الآن؟'),
('شنهومه الروايات اللي كنا نعدلوهم وتبقينا نرجعو نعدلوهم؟'),
('شنهو اول شي جذبك فيَ؟'),
('ازين سنة تتمناها تنعاد؟ وعلاش؟'),
('كم نسبة صراحتك امعايَ؟'),
('شنهو أكبر تغير اخلگلك نين عدت أنا شريكتك؟'),
('اتحس عني: نسامح ولا ننتقم؟'),
('اعترف لي اعتراف ما گط اسمعتو'),
('شنهو حدودك بأي علاقة؟'),
('شنهي اكثر ذكرى بينا اتظحكك؟'),
('ازين صفة تبقيها فيَ؟'),
('أوصفني ب 3 كلمات'),
('شنهي الحركة اللي نين نعدلها اتخليك اتعدل ذلي اندور؟'),
('تبقي تسافر للمستقبل ولا ترجع للماضي 10 سنوات؟'),
('شنهي رواية شفتها فهاذ الجيل مستحيل اتخلي اولادنا يعدلوها؟'),
('اغرب إشاعة گط اسمعتها عن نفسك؟'),
('منه اكثر حد حنين فحياتك؟')
on conflict do nothing;
