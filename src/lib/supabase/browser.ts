/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {createBrowserClient} from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Use placeholders when env is missing so the app can load (e.g. local preview); real calls will fail.
const url = supabaseUrl || "https://placeholder.supabase.co";
const key = supabaseAnonKey || "placeholder";

export const supabaseBrowser = createBrowserClient(url, key);
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

