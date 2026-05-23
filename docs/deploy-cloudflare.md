# Deploy To Cloudflare

## One-click Deploy

Open:

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker
```

Set an admin token:

```text
ADMIN_TOKEN
```

After deployment, visit:

```text
https://your-worker-name.your-account.workers.dev/health
```

Then copy the Worker URL back to SKG.

Open the setup page:

```text
https://your-worker-name.your-account.workers.dev/admin?token=YOUR_ADMIN_TOKEN
```

Fill in:

```text
EPAY_PID
EPAY_KEY
EPAY_URL
verification file path
verification file content
```

## Manual Deploy

1. Install dependencies:

```bash
npm install
```

2. Login Cloudflare:

```bash
npx wrangler login
```

3. Create a KV namespace:

```bash
npx wrangler kv namespace create PAY_CONFIG
```

4. Copy the KV id into `wrangler.jsonc`.

5. Set the admin token:

```bash
npx wrangler secret put ADMIN_TOKEN
```

6. Deploy:

```bash
npm run deploy
```

7. Open setup page:

```text
https://your-worker-name.your-account.workers.dev/admin?token=YOUR_ADMIN_TOKEN
```
