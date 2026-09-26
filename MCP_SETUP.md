# The Drift MCP setup

The Drift MCP is a single-user Supabase Edge Function. It deliberately does not use an interactive OAuth flow. Instead, a private bearer token protects the endpoint and `DRIFT_USER_ID` fixes every operation to your existing Supabase account.

Do not commit the bearer token, the service-role key, or a populated secrets file. Anyone with the bearer token can use all MCP tools, including creating and deleting records.

## Included tools

- `list_reference_data` — category and project IDs
- `list_entries` — records with date/category/project filters
- `get_drift_summary` — Today, 7-day, 30-day, and all-time summaries
- `create_entry`
- `create_project`
- `delete_entry`
- `get_running_timer`
- `start_timer`
- `stop_timer`

Time summaries clip records to the requested interval, so an overnight activity is split correctly at the interval boundary. Maintenance categories are excluded from discretionary coverage.

## 1. Find your Supabase user ID

Open the Supabase dashboard and go to **Authentication → Users**. Copy the UUID for the account that owns your Drift records. This is the value for `DRIFT_USER_ID`.

## 2. Generate a private MCP token

Generate a random token locally:

```bash
openssl rand -hex 32
```

Keep the result private. This becomes `DRIFT_MCP_TOKEN`.

## 3. Install and connect the Supabase CLI

The current Supabase MCP Edge Function guide requires Supabase CLI 2.117.0 or later.

```bash
npx supabase@latest --version
npx supabase@latest login
npx supabase@latest link --project-ref ujbivvixdkvgiohqvckt
```

If the project reference changes, use the reference displayed under **Supabase → Project Settings → General**.

## 4. Store the server-side secrets

Create a temporary ignored file named `supabase/.env.mcp`:

```dotenv
DRIFT_USER_ID=YOUR_SUPABASE_USER_UUID
DRIFT_MCP_TOKEN=YOUR_RANDOM_64_CHARACTER_TOKEN
```

Upload it to the Edge Function environment:

```bash
npx supabase@latest secrets set --env-file supabase/.env.mcp
```

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. Do not add either value to the MCP client and never use the service-role key as the bearer token.

After uploading the secrets, delete the local `supabase/.env.mcp` file if you do not want to retain it. It is ignored by Git because all `.env*` files are ignored.

## 5. Deploy the MCP function

Push the function configuration and deploy:

```bash
npx supabase@latest config push
npx supabase@latest functions deploy mcp
```

The MCP endpoint will be:

```text
https://ujbivvixdkvgiohqvckt.supabase.co/functions/v1/mcp
```

`verify_jwt = false` in `supabase/config.toml` is intentional. The Supabase gateway cannot validate the custom bearer token; the Edge Function validates it before the MCP handler runs.

## 6. Test the deployed endpoint

An unauthenticated request should return HTTP 401:

```bash
curl -i https://ujbivvixdkvgiohqvckt.supabase.co/functions/v1/mcp
```

Test MCP initialization using your token:

```bash
curl -i \
  -X POST \
  -H 'Authorization: Bearer YOUR_RANDOM_64_CHARACTER_TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0.0"}}}' \
  https://ujbivvixdkvgiohqvckt.supabase.co/functions/v1/mcp
```

A successful response contains MCP server information for `the-drift`.

## 7. Connect an MCP client

Use the deployed URL as a Streamable HTTP MCP server and configure this header:

```text
Authorization: Bearer YOUR_RANDOM_64_CHARACTER_TOKEN
```

For clients that accept JSON MCP configuration, the shape is generally:

```json
{
  "mcpServers": {
    "the-drift": {
      "type": "http",
      "url": "https://ujbivvixdkvgiohqvckt.supabase.co/functions/v1/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_RANDOM_64_CHARACTER_TOKEN"
      }
    }
  }
}
```

Keep client configuration containing the token out of Git. Exact configuration fields vary by MCP client.

## Rotate or revoke access

Generate a new token and upload it:

```bash
openssl rand -hex 32
npx supabase@latest secrets set DRIFT_MCP_TOKEN=THE_NEW_TOKEN
```

Then update the MCP client. The old token stops working as soon as the function sees the updated secret. To disable the server entirely:

```bash
npx supabase@latest functions delete mcp
```
