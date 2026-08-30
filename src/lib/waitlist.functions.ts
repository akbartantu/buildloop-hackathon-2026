import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PAIN_POINT_MAX, waitlistSchema, type WaitlistResult } from "./waitlist-schema";
import { isDisposableEmailDomain } from "@/lib/auth/disposable-email";

export const submitWaitlist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => waitlistSchema.parse(input))
  .handler(async ({ data }): Promise<WaitlistResult> => {
    // Honeypot terisi: respons sukses tanpa menyimpan apa pun.
    if (data.trap && data.trap.trim().length > 0) {
      return { status: "ok" };
    }

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    // Batas pain point ditolak di server, tanpa memotong payload.
    if (data.painPoint && data.painPoint.length > PAIN_POINT_MAX) {
      return { status: "error" };
    }

    // Pemeriksaan domain email temporer di server (daftar domain tidak pernah dikirim ke client).
    try {
      if (await isDisposableEmailDomain(data.email)) {
        return { status: "disposable_email" };
      }
    } catch {
      return { status: "error" };
    }

    const { error } = await supabase.from("pilot_waitlist").insert({
      email: data.email,
      role: data.role,
      pain_point: data.painPoint && data.painPoint.length > 0 ? data.painPoint : null,
      consent: true,
    });

    if (error) {
      // 23505 = unique_violation → email sudah terdaftar.
      if (error.code === "23505") {
        return { status: "duplicate" };
      }
      // P0001 = trigger database menolak domain email temporer.
      if (error.code === "P0001") {
        return { status: "disposable_email" };
      }
      console.error("waitlist insert failed", error.code);
      return { status: "error" };
    }

    return { status: "ok" };
  });
