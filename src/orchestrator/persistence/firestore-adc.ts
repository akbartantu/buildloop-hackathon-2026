import { GoogleAuth } from "google-auth-library";

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

let cachedAuth: GoogleAuth | null = null;

function googleAuth(): GoogleAuth {
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth({ scopes: [FIRESTORE_SCOPE] });
  }
  return cachedAuth;
}

/** Application Default Credentials — Cloud Run metadata or local gcloud ADC. */
export async function getFirestoreAccessToken(): Promise<string> {
  const client = await googleAuth().getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Firestore ADC token unavailable.");
  }
  return token.token;
}

/** Reset cached client — test hook only. */
export function resetFirestoreAuthCacheForTests(): void {
  cachedAuth = null;
}
