import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. Copy .env.example to .env and fill them in.');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
});

export async function uploadToBucket(bucket, coupleId, file, fileNameHint = '') {
  const ext = file.name?.split('.').pop() || 'bin';
  const path = `${coupleId}/${fileNameHint}${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function signedUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function uploadBlob(bucket, coupleId, blob, ext, fileNameHint = '') {
  const path = `${coupleId}/${fileNameHint}${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: false });
  if (error) throw error;
  return path;
}

export async function notifyPartner({ coupleId, recipientId, actorId, kind, body }) {
  if (!recipientId) return;
  await supabase.from('notifications').insert({
    couple_id: coupleId,
    recipient_id: recipientId,
    actor_id: actorId,
    kind,
    body,
  });
}
