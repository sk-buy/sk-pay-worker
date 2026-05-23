# SK Pay Worker

[English](README.md) | 简体中文

[![部署到 Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker)

SKG / sk-buy 生态的 Cloudflare Workers 支付桥接器。

它用于让小型供应方把自己的支付页面接入 SKG，同时不需要把支付密钥交给 SKG。

支付网关链接由 SKG 保存并签名下发，Worker 只保存供应方自己的支付参数，例如易支付商户 ID 和商户密钥。

## 一键部署

点击上方按钮，然后填写从 SKG 复制的参数：

```text
SUPPLIER_ID
SKG_CALLBACK_SECRET
```

再填写你自己的易支付参数：

```text
EPAY_PID
EPAY_KEY
EPAY_TYPE
SITE_NAME
```

`SKG_CALLBACK_URL` 通常保持默认值即可。

部署完成后打开：

```text
https://你的-worker-name.你的账号.workers.dev/health
```

如果返回 `{"ok":true}`，说明部署成功。然后把 Worker URL 填回 SKG。

## 接口

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...&sig=...
POST /callback/:provider
```

## 必填密钥

```bash
wrangler secret put SKG_CALLBACK_SECRET
wrangler secret put EPAY_KEY
```

## 本地开发

```bash
npm install
npm run dev
```

## 手动部署

```bash
npm run deploy
```

## 环境变量

```text
SUPPLIER_ID       SKG 分配的供应方 ID
SKG_CALLBACK_URL  SKG 支付回调地址
EPAY_PID          易支付商户 ID
EPAY_TYPE         默认易支付支付方式
SITE_NAME         支付页面显示的站点名称
```

`SKG_CALLBACK_SECRET` 和 `EPAY_KEY` 必须保存为 Cloudflare Secret。

## 回传给 SKG 的标准格式

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

Worker 会用 HMAC-SHA256 对 JSON 内容签名，并通过下面的请求头发送：

```text
x-skg-signature
```
