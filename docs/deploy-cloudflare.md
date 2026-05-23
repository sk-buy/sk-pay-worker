# Deploy To Cloudflare

## One-click Deploy

Open:

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/sk-pay-worker
```

After deployment, visit:

```text
https://your-worker-name.your-account.workers.dev/health
```

Then copy the Worker URL back to SKG.

Open the setup page:

```text
https://your-worker-name.your-account.workers.dev/admin
```

Before binding to SKG, the setup page does not require a password. During SKG connection testing, SKG writes the SKG merchant ID into the Worker as the future admin token.

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

5. Deploy:

```bash
npm run deploy
```

6. Open setup page:

```text
https://your-worker-name.your-account.workers.dev/admin
```
