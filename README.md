# SK Pay Worker

English | [简体中文](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/sk-pay-worker)

Cloudflare Workers payment bridge for SKG / sk-buy ecosystem.

This worker lets a small supplier connect their own payment page to SKG without giving payment secrets to SKG.

The worker includes a setup page. After deployment, the supplier creates a new EPay channel for their `workers.dev` domain, then fills EPay settings and verification file content in the worker setup page.

`EPAY_KEY` is encrypted inside the worker before being saved to Cloudflare KV. The setup page does not display the plaintext key after saving.

## One-click Deploy

Click the button above and deploy the worker.

After deployment, open:

```text
https://your-worker-name.your-account.workers.dev/
https://your-worker-name.your-account.workers.dev/health
```

The root path renders a normal website page. If `/health` returns `{"ok":true}`, copy the Worker URL back to SKG.

## EPay Setup

Open:

```text
https://your-worker-name.your-account.workers.dev/admin
```

Before binding to SKG, the setup page does not require a password. During SKG connection testing, SKG writes the SKG merchant ID into the Worker as the future admin token.

Fill in:

```text
EPAY_PID
EPAY_KEY
EPAY_URL
verification file path, for example /kpay-domain-verification.txt
verification file content, for example kpay-domain-verification=plyjY7phyKZstUuFKx0XtYBh
```

You can also upload the txt verification file directly. The worker will read the file name and content automatically.

Use this as the EPay authorized domain:

```text
your-worker-name.your-account.workers.dev
```

After saving the verification file, open:

```text
https://your-worker-name.your-account.workers.dev/kpay-domain-verification.txt
```

## Routes

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...
POST /callback/:provider
POST /api/bind
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
