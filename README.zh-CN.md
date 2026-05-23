# SK Pay Worker

[English](README.md) | 简体中文

[![部署到 Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/pay-worker)

SKG / sk-buy 生态的 Cloudflare Workers 支付桥接器。

它用于让小型供应方把自己的支付页面接入 SKG，同时不需要把支付密钥交给 SKG。

Worker 自带设置页面。站长部署后，用自己的 `workers.dev` 域名去 EPay 建立新支付通道，再在 Worker 页面填写 EPay 参数和验证文件。

## 一键部署

点击上方按钮部署 Worker。

部署时只需要设置 `ADMIN_TOKEN`，用于保护设置页面。

部署完成后打开：

```text
https://你的-worker-name.你的账号.workers.dev/health
```

如果返回 `{"ok":true}`，说明部署成功。然后把 Worker URL 填回 SKG。

## 设置 EPay

打开设置页面：

```text
https://你的-worker-name.你的账号.workers.dev/admin?token=你的ADMIN_TOKEN
```

填写：

```text
EPAY_PID
EPAY_KEY
EPAY_URL
验证文件路径
验证文件内容
```

EPay 授权域名填写：

```text
你的-worker-name.你的账号.workers.dev
```

## 接口

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...
POST /callback/:provider
```

## 必填密钥

```bash
wrangler secret put ADMIN_TOKEN
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
ADMIN_TOKEN      设置页面管理口令
```
EPay 参数通过 Worker 设置页面保存到 Cloudflare KV。

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
