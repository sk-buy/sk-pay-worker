# SK Pay Worker

[English](README.md) | 简体中文

[![部署到 Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sk-buy/sk-pay-worker)

SKG / sk-buy 生态的 Cloudflare Workers 支付桥接器。

它用于让小型供应方把自己的支付页面接入 SKG，同时不需要把支付密钥交给 SKG。

Worker 自带设置页面。站长部署后，用自己的 `workers.dev` 域名去 EPay 建立新支付通道，再在 Worker 页面填写 EPay 参数和验证文件。

`EPAY_KEY` 会在 Worker 内自动加密后保存到 Cloudflare KV，设置页不会回显明文。

## 一键部署

点击上方按钮部署 Worker。

部署完成后打开：

```text
https://你的-worker-name.你的账号.workers.dev/
https://你的-worker-name.你的账号.workers.dev/health
```

根路径会显示正常网站页面，`/health` 返回 `{"ok":true}` 说明部署成功。然后把 Worker URL 填回 SKG。

## 设置 EPay

打开设置页面：

```text
https://你的-worker-name.你的账号.workers.dev/admin
```

绑定 SKG 前，设置页无需密码。SKG 后台测试连接时，会自动把 SKG 商户 ID 写入 Worker 作为后续管理口令。

填写：

```text
EPAY_PID
EPAY_KEY
EPAY_URL
验证文件路径，例如 /kpay-domain-verification.txt
验证文件内容，例如 kpay-domain-verification=plyjY7phyKZstUuFKx0XtYBh
```

也可以直接上传 EPay 提供的 txt 验证文件，Worker 会自动读取文件名和内容。

EPay 授权域名填写：

```text
你的-worker-name.你的账号.workers.dev
```

保存验证文件后，可以访问：

```text
https://你的-worker-name.你的账号.workers.dev/kpay-domain-verification.txt
```

## 接口

```text
GET  /health
GET  /pay?order_id=...&amount=...&payment_url=...&notify_url=...
POST /callback/:provider
POST /api/bind
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
