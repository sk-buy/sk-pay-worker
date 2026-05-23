# SK Pay Worker

[English](README.md) | 简体中文

[![部署到 Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker)

SKG / sk-buy 生态的 Cloudflare Workers 支付桥接器。

它用于让小型供应方把自己的支付页面接入 SKG，同时不需要把支付密钥交给 SKG。

Worker 只保存两个易支付参数：`EPAY_PID`、`EPAY_KEY`。易支付提交地址填在 SKG，由 SKG 每次发起支付时传入。

## 一键部署

点击上方按钮，然后填写你自己的易支付参数：

```text
EPAY_PID
EPAY_KEY
```

部署完成后打开：

```text
https://你的-worker-name.你的账号.workers.dev/health
```

如果返回 `{"ok":true}`，说明部署成功。然后把 Worker URL 填回 SKG。

## 接口

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...
POST /callback/:provider
```

## 必填密钥

```bash
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
EPAY_PID          易支付商户 ID
```

`EPAY_KEY` 必须保存为 Cloudflare Secret。

## 回传给 SKG 的标准格式

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

SKG 收到回调后负责校验订单归属和金额。
