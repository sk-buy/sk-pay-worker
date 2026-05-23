# Deploy To Cloudflare

## One-click Deploy

Open:

```text
https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker
```

Fill in the values copied from SKG:

```text
SUPPLIER_ID
SKG_CALLBACK_SECRET
```

Then fill in your own EPay parameters:

```text
EPAY_PID
EPAY_KEY
EPAY_TYPE
SITE_NAME
```

Keep `SKG_CALLBACK_URL` unchanged unless SKG gives you another callback URL.

After deployment, visit:

```text
https://your-worker-name.your-account.workers.dev/health
```

Then copy the Worker URL back to SKG.

## Manual Deploy

1. Install dependencies:

```bash
npm install
```

2. Login Cloudflare:

```bash
npx wrangler login
```

3. Set the SKG callback secret:

```bash
npx wrangler secret put SKG_CALLBACK_SECRET
```

4. Edit `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "SUPPLIER_ID": "your-skg-supplier-id",
    "SKG_CALLBACK_URL": "https://skg.sk-buy.com/api/skg/payment/callback",
    "EPAY_PID": "your-epay-pid",
    "EPAY_TYPE": "alipay",
    "SITE_NAME": "SKG"
  }
}
```

5. Deploy:

```bash
npm run deploy
```
