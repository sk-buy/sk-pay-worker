# SK Pay Worker

English | [简体中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker)

Cloudflare Workers payment bridge for SKG / sk-buy ecosystem.

This worker lets a small supplier connect their own payment page to SKG without giving payment secrets to SKG.

The worker only stores two EPay values: `EPAY_PID` and `EPAY_KEY`. The EPay submit URL is stored in SKG and supplied for each payment request.

## One-click Deploy

Click the button above and fill in your own EPay parameters:

```text
EPAY_PID
EPAY_KEY
```

After deployment, open:

```text
https://your-worker-name.your-account.workers.dev/health
```

If it returns `{"ok":true}`, copy the Worker URL back to SKG.

## Routes

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...
POST /callback/:provider
```

## Required Secret

```bash
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
EPAY_PID          EPay merchant ID
```

`EPAY_KEY` must be stored as a Cloudflare secret.

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
