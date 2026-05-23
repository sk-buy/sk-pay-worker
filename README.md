# SK Pay Worker

English | [简体中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker)

Cloudflare Workers payment bridge for SKG / sk-buy ecosystem.

This worker lets a small supplier connect their own payment page to SKG without giving payment secrets to SKG.

The worker includes a setup page. After deployment, the supplier creates a new EPay channel for their `workers.dev` domain, then fills EPay settings and verification file content in the worker setup page.

## One-click Deploy

Click the button above and deploy the worker.

Only `ADMIN_TOKEN` is required during deployment. It protects the setup page.

After deployment, open:

```text
https://your-worker-name.your-account.workers.dev/health
```

If it returns `{"ok":true}`, copy the Worker URL back to SKG.

## EPay Setup

Open:

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

Use this as the EPay authorized domain:

```text
your-worker-name.your-account.workers.dev
```

## Routes

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...
POST /callback/:provider
```

## Required Secret

```bash
wrangler secret put ADMIN_TOKEN
```

## Local Dev

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Environment Variables

```text
ADMIN_TOKEN       Admin token for the setup page
```

EPay settings are saved into Cloudflare KV from the worker setup page.

## Callback Format Sent To SKG

```json
{
  "order_id": "SKG-O-xxx",
  "amount": "100.00",
  "paid_at": "2026-05-23T12:00:00.000Z",
  "status": "paid",
  "raw_provider": "epay",
  "raw_trade_no": "provider-trade-no"
}
```

SKG validates payment amount and order ownership after receiving the callback.
