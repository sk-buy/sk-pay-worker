# SK Pay Worker

English | [简体中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker)

Cloudflare Workers payment bridge for SKG / sk-buy ecosystem.

This worker lets a small supplier connect their own payment page to SKG without giving payment secrets to SKG.

SKG controls the payment gateway URL and signs each payment request. The worker only stores supplier-side payment parameters such as EPay merchant ID and merchant key.

## One-click Deploy

Click the button above and fill in the values copied from SKG:

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

`SKG_CALLBACK_URL` can usually keep the default value.

After deployment, open:

```text
https://your-worker-name.your-account.workers.dev/health
```

If it returns `{"ok":true}`, copy the Worker URL back to SKG.

## Routes

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...&sig=...
POST /callback/:provider
```

## Required Secret

```bash
wrangler secret put SKG_CALLBACK_SECRET
wrangler secret put EPAY_KEY
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
SUPPLIER_ID       Supplier ID from SKG
SKG_CALLBACK_URL  SKG payment callback endpoint
EPAY_PID          EPay merchant ID
EPAY_TYPE         Default EPay payment type
SITE_NAME         Site name shown on payment page
```

`SKG_CALLBACK_SECRET` and `EPAY_KEY` must be stored as Cloudflare secrets.

## Callback Format Sent To SKG

```json
{
  "order_id": "SKG-O-xxx",
  "supplier_id": "SUP-xxx",
  "amount": "100.00",
  "paid_at": "2026-05-23T12:00:00.000Z",
  "status": "paid",
  "raw_provider": "epay",
  "raw_trade_no": "provider-trade-no"
}
```

The worker signs the JSON body with HMAC-SHA256 and sends it in:

```text
x-skg-signature
```
