export type SupabaseSession = { url: string; anonKey: string; accessToken: string; userId: string };
export async function signIn(url: string, anonKey: string, email: string, password: string): Promise<SupabaseSession> {
  const base = url.replace(/\/$/, "");
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error_description || body.msg || "Could not sign in");
  return { url: base, anonKey, accessToken: body.access_token, userId: body.user.id };
}
export async function testConnection(session: SupabaseSession): Promise<number> {
  const response = await fetch(`${session.url}/rest/v1/categories?select=id`, { headers: { apikey: session.anonKey, Authorization: `Bearer ${session.accessToken}` } });
  if (!response.ok) throw new Error("Signed in, but categories could not be read. Run the schema and seed scripts first.");
  return (await response.json()).length;
}
