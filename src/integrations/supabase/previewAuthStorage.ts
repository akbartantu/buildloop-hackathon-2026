/** Browser auth session storage for Supabase client. */
export function browserAuthStorage() {
  if (typeof window === "undefined") return undefined;
  return localStorage;
}
