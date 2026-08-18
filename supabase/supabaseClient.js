import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // This is almost certainly the "خطأ" you were seeing: without a .env file
  // containing these two variables, the app can't even create the Supabase
  // client, so nothing (signup, buttons, anything) works.
  throw new Error(
    'إعدادات Supabase ناقصة: تأكد من وجود ملف .env في جذر المشروع فيه VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (خذهم من لوحة تحكم مشروعك فـ Supabase > Project Settings > API).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* -----------------------------------------------------------
   Storage helpers
----------------------------------------------------------- */

// Upload a File (e.g. from an <input type="file">) into a bucket, scoped by
// couple id, and return the storage path to save on the row.
export async function uploadToBucket(bucket, coupleId, file, prefix = '') {
  const ext = file.name?.split('.').pop() || 'bin';
  const path = `${coupleId}/${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

// Upload a raw Blob (e.g. a recorded voice note) the same way.
export async function uploadBlob(bucket, coupleId, blob, ext = 'webm', prefix = '') {
  const path = `${coupleId}/${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: false,
    contentType: blob.type || undefined,
  });
  if (error) throw error;
  return path;
}

// Get a temporary signed URL to display/play a private storage object.
export async function signedUrl(bucket, path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    console.error('signedUrl failed:', error.message);
    return null;
  }
  return data.signedUrl;
}

/* -----------------------------------------------------------
   Notifications
----------------------------------------------------------- */

// Insert a row into `notifications` for the partner. The app listens for
// INSERTs on this table (filtered by recipient_id) to show in-app toasts.
export async function notifyPartner({ coupleId, recipientId, actorId, kind, body }) {
  const { error } = await supabase.from('notifications').insert({
    couple_id: coupleId,
    recipient_id: recipientId,
    actor_id: actorId,
    kind,
    body,
  });
  if (error) console.error('notifyPartner failed:', error.message);
}
