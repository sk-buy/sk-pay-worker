import { md5 } from "js-md5";

export interface Env {
  EPAY_PID: string;
  EPAY_KEY: string;
  PAY_CONFIG: KVNamespace;
}

type ProviderPayload = Record<string, string>;

interface PayConfig {
  adminToken: string;
  epayPid: string;
  encryptedEpayKey: string;
  epayKeyIv: string;
  epayUrl: string;
  verifyPath: string;
  verifyContent: string;
}

interface RuntimePayConfig extends PayConfig {
  epayKey: string;
}

interface NormalizedPayment {
  order_id: string;
  amount: string;
  paid_at: string;
  status: "paid" | "pending" | "failed";
  raw_provider: string;
  raw_trade_no: string;
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-max-age": "86400",
    },
  });
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

function html(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function getRequiredEnv(env: Env, key: keyof Env) {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getOrCreateEncryptionKey(env: Env) {
  const existing = await env.PAY_CONFIG.get("local_encryption_key");
  if (existing) return existing;

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = toBase64(bytes);
  await env.PAY_CONFIG.put("local_encryption_key", key);
  return key;
}

async function importAesKey(rawKey: string) {
  return crypto.subtle.importKey("raw", fromBase64(rawKey), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSecret(env: Env, value: string) {
  const rawKey = await getOrCreateEncryptionKey(env);
  const key = await importAesKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return {
    encrypted: toBase64(encrypted),
    iv: toBase64(iv),
  };
}

async function decryptSecret(env: Env, encrypted: string, iv: string) {
  if (!encrypted || !iv) return "";
  const rawKey = await getOrCreateEncryptionKey(env);
  const key = await importAesKey(rawKey);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(encrypted));
  return new TextDecoder().decode(decrypted);
}

async function getPayConfig(env: Env): Promise<RuntimePayConfig> {
  const stored = await env.PAY_CONFIG.get("pay_config", "json") as Partial<PayConfig> | null;
  const encryptedEpayKey = String(stored?.encryptedEpayKey || "");
  const epayKeyIv = String(stored?.epayKeyIv || "");
  const legacyEpayKey = String((stored as Partial<PayConfig> & { epayKey?: string } | null)?.epayKey || env.EPAY_KEY || "");
  return {
    adminToken: String(stored?.adminToken || ""),
    epayPid: String(stored?.epayPid || env.EPAY_PID || ""),
    encryptedEpayKey,
    epayKeyIv,
    epayKey: encryptedEpayKey ? await decryptSecret(env, encryptedEpayKey, epayKeyIv) : legacyEpayKey,
    epayUrl: String(stored?.epayUrl || ""),
    verifyPath: String(stored?.verifyPath || ""),
    verifyContent: String(stored?.verifyContent || ""),
  };
}

async function savePayConfig(env: Env, config: PayConfig) {
  await env.PAY_CONFIG.put("pay_config", JSON.stringify(config));
}

function isInitialized(config: RuntimePayConfig) {
  return Boolean(config.epayPid && config.epayKey && config.epayUrl);
}

function isBound(config: RuntimePayConfig) {
  return Boolean(config.adminToken);
}

function canManage(request: Request, config: RuntimePayConfig) {
  if (!isBound(config)) return true;
  const url = new URL(request.url);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  return Boolean(token && token === config.adminToken);
}

function renderAdminPage(config: RuntimePayConfig, origin: string, bound: boolean) {
  const escaped = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return html(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SK Pay Worker</title>
  <style>
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
    main{max-width:860px;margin:0 auto;padding:32px 18px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.06);padding:22px}
    h1{font-size:22px;margin:0 0 8px}.muted{color:#64748b;font-size:14px;line-height:1.7}
    label{display:grid;gap:8px;margin-top:16px;font-size:14px;font-weight:700}
    input,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:11px 12px;font:inherit}
    textarea{min-height:120px;resize:vertical}
    button{margin-top:18px;border:0;border-radius:12px;background:#7c3aed;color:#fff;font-weight:800;padding:12px 16px;cursor:pointer}
    code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:2px 6px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:720px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>SK Pay Worker 设置</h1>
      <p class="muted">将 EPay 授权域名填写为：<code>${origin.replace(/^https?:\/\//, "")}</code>。${bound ? "此 Worker 已绑定 SKG，后续访问设置页需要 SKG 后台显示的 Worker 管理密码。" : "绑定 SKG 前，设置页无需密码。"}</p>
      <form method="post" action="/api/config" enctype="multipart/form-data">
        <div class="grid">
          <label>EPAY_PID<input name="epayPid" value="${escaped(config.epayPid)}" required /></label>
          <label>EPAY_KEY<input name="epayKey" value="" placeholder="${config.epayKey ? "已加密保存，留空则不修改" : "请输入 EPAY_KEY"}" ${config.epayKey ? "" : "required"} /></label>
        </div>
        <label>EPAY_URL<input name="epayUrl" value="${escaped(config.epayUrl)}" placeholder="https://pay.example.com/submit.php" required /></label>
        <label>验证文件路径<input name="verifyPath" value="${escaped(config.verifyPath)}" placeholder="/kpay-domain-verification.txt" /></label>
        <label>验证文件内容<textarea name="verifyContent" placeholder="kpay-domain-verification=plyjY7phyKZstUuFKx0XtYBh">${escaped(config.verifyContent)}</textarea></label>
        <label>直接上传验证文件<input name="verifyFile" type="file" accept=".txt,text/plain" /></label>
        <input type="hidden" name="token" value="" />
        <button type="submit">保存设置</button>
      </form>
    </div>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get("token") || "";
    document.querySelector('input[name="token"]').value = token;
    const fileInput = document.querySelector('input[name="verifyFile"]');
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      document.querySelector('input[name="verifyPath"]').value = "/" + file.name.replace(/^\\/+/, "");
      document.querySelector('textarea[name="verifyContent"]').value = await file.text();
    });
  </script>
</body>
</html>`);
}

function renderHomePage(origin: string, configured: boolean) {
  return html(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SK Pay Worker</title>
  <style>
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
    main{max-width:780px;margin:0 auto;padding:42px 18px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 12px 34px rgba(15,23,42,.07);padding:26px}
    .badge{display:inline-flex;border:1px solid #ddd6fe;background:#f5f3ff;color:#6d28d9;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800}
    h1{font-size:28px;margin:18px 0 10px}
    p{color:#475569;line-height:1.75;margin:0 0 14px}
    dl{display:grid;grid-template-columns:120px 1fr;gap:10px 14px;margin-top:20px}
    dt{font-weight:800;color:#334155}dd{margin:0;color:#64748b;word-break:break-all}
    a{color:#6d28d9;text-decoration:none;font-weight:800}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <span class="badge">SK Pay Worker</span>
      <h1>支付桥接服务已运行</h1>
      <p>这是 SKG / sk-buy 生态的支付桥接服务页面。该服务用于供应方独立接入 EPay 支付通道，并将支付结果回传给 SKG。</p>
      <p>当前域名可作为 EPay 授权域名使用。验证文件配置后，也可以通过指定路径直接访问。</p>
      <dl>
        <dt>服务地址</dt><dd>${origin}</dd>
        <dt>配置状态</dt><dd>${configured ? "已配置" : "待配置"}</dd>
        <dt>健康检查</dt><dd><a href="/health">/health</a></dd>
      </dl>
    </div>
  </main>
</body>
</html>`);
}

function renderPaymentReturnPage(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("trade_status") || "";
  const orderId = url.searchParams.get("out_trade_no") || "";
  const tradeNo = url.searchParams.get("trade_no") || "";
  const paid = status === "TRADE_SUCCESS";
  const escaped = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  return html(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SK Pay Worker 支付结果</title>
  <style>
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
    main{max-width:760px;margin:0 auto;padding:42px 18px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 12px 34px rgba(15,23,42,.07);padding:26px}
    h1{font-size:24px;margin:0 0 12px}
    p{color:#475569;line-height:1.75;margin:8px 0}
    code{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:2px 6px;word-break:break-all}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>${paid ? "支付成功" : "支付结果待确认"}</h1>
      <p>订单号：<code>${escaped(orderId)}</code></p>
      <p>平台流水：<code>${escaped(tradeNo)}</code></p>
      <p>该页面是同步返回结果，最终状态以异步通知入账为准。</p>
    </div>
  </main>
</body>
</html>`);
}

function normalizeStatus(value: string): NormalizedPayment["status"] {
  const status = value.toLowerCase();
  if (["paid", "success", "trade_success", "complete", "completed"].includes(status)) return "paid";
  if (["pending", "processing", "wait", "waiting"].includes(status)) return "pending";
  return "failed";
}

function pick(payload: ProviderPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value) return value;
  }
  return "";
}

async function readProviderPayload(request: Request): Promise<ProviderPayload> {
  const url = new URL(request.url);
  const payload: ProviderPayload = {};

  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value;
  }

  const contentType = request.headers.get("content-type") || "";
  if (request.method !== "GET" && contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) payload[key] = String(value);
    }
  }

  if (request.method !== "GET" && contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      payload[key] = String(value);
    }
  }

  return payload;
}

function normalizePayment(provider: string, payload: ProviderPayload): NormalizedPayment {
  const orderId = pick(payload, ["order_id", "out_trade_no", "outTradeNo", "orderNo", "order"]);
  const amount = pick(payload, ["amount", "money", "total_amount", "totalAmount", "price"]);
  const status = pick(payload, ["status", "trade_status", "tradeStatus", "state"]) || "paid";
  const tradeNo = pick(payload, ["trade_no", "tradeNo", "transaction_id", "transactionId", "pay_id"]);
  const paidAt = pick(payload, ["paid_at", "paidAt", "time", "notify_time"]) || new Date().toISOString();

  return {
    order_id: orderId,
    amount,
    paid_at: paidAt,
    status: normalizeStatus(status),
    raw_provider: provider,
    raw_trade_no: tradeNo,
  };
}

function buildEpaySignature(params: Record<string, string>, key: string) {
  const sorted = Object.entries(params)
    .filter(([name, value]) => value !== "" && name !== "sign" && name !== "sign_type")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return md5(`${sorted}${key}`);
}

function normalizeEpaySubmitUrl(paymentUrl: string) {
  const target = new URL(paymentUrl);
  const path = target.pathname.replace(/\/+$/, "");
  if (!path || path === "/epay") {
    target.pathname = `${path || ""}/submit.php`.replace(/^\/?/, "/");
  }
  return target;
}

async function forwardToSkg(payment: NormalizedPayment, skgCallbackUrl: string) {
  const body = JSON.stringify(payment);

  const response = await fetch(skgCallbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "sk-buy-pay-worker/0.1",
    },
    body,
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: text,
  };
}

async function buildPaymentRedirect(request: Request, env: Env) {
  const url = new URL(request.url);
  const config = await getPayConfig(env);
  const orderId = url.searchParams.get("order_id") || "";
  const amount = url.searchParams.get("amount") || "";
  const name = url.searchParams.get("name") || `SKG Order ${orderId}`;
  const notifyUrl = url.searchParams.get("notify_url") || "";
  const returnUrl = url.searchParams.get("return_url") || "";
  const paymentUrl = url.searchParams.get("payment_url") || config.epayUrl;
  const type = url.searchParams.get("type") || "alipay";

  if (!orderId) return badRequest("order_id is required");
  if (!amount) return badRequest("amount is required");
  if (!paymentUrl) return badRequest("payment_url is required");
  if (!notifyUrl) return badRequest("notify_url is required");

  const pid = config.epayPid;
  const key = config.epayKey;
  if (!pid) return badRequest("EPAY_PID is not configured");
  if (!key) return badRequest("EPAY_KEY is not configured");
  const params: Record<string, string> = {
    pid,
    type,
    out_trade_no: orderId,
    notify_url: notifyUrl,
    return_url: returnUrl || notifyUrl,
    name,
    money: amount,
  };
  params.sign = buildEpaySignature(params, key);
  params.sign_type = "MD5";

  const target = normalizeEpaySubmitUrl(paymentUrl);
  for (const [paramKey, value] of Object.entries(params)) {
    target.searchParams.set(paramKey, value);
  }

  return Response.redirect(target.toString(), 302);
}

async function handleCallback(request: Request, env: Env, provider: string) {
  const payload = await readProviderPayload(request);
  const payment = normalizePayment(provider, payload);
  const skgCallbackUrl = pick(payload, ["skg_callback_url", "skgCallbackUrl"]);

  if (!payment.order_id) return badRequest("order_id is required");
  if (!payment.amount) return badRequest("amount is required");
  if (!skgCallbackUrl) return badRequest("skg_callback_url is required");

  const skgResult = await forwardToSkg(payment, skgCallbackUrl);
  if (skgResult.ok) {
    return new Response("success", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return json({
    ok: false,
    status: skgResult.status,
  }, { status: 502 });
}

async function handleSaveConfig(request: Request, env: Env) {
  const current = await getPayConfig(env);
  const form = await request.formData();
  const token = String(form.get("token") || "");
  if (isBound(current) && token !== current.adminToken) return json({ error: "Unauthorized" }, { status: 401 });

  const nextEpayKey = String(form.get("epayKey") || "").trim();
  const encryptedKey = nextEpayKey
    ? await encryptSecret(env, nextEpayKey)
    : { encrypted: current.encryptedEpayKey, iv: current.epayKeyIv };
  const verifyFile = form.get("verifyFile") as unknown;
  const fileCandidate = verifyFile as { size?: number; name?: string; text?: () => Promise<string> } | null;
  const uploadedVerifyFile = fileCandidate?.size && fileCandidate.name && fileCandidate.text
    ? { name: fileCandidate.name, text: fileCandidate.text }
    : null;
  const uploadedVerifyContent = uploadedVerifyFile ? await uploadedVerifyFile.text() : "";
  const uploadedVerifyPath = uploadedVerifyFile ? `/${uploadedVerifyFile.name.replace(/^\/+/, "")}` : "";

  const config: PayConfig = {
    adminToken: current.adminToken,
    epayPid: String(form.get("epayPid") || "").trim(),
    encryptedEpayKey: encryptedKey.encrypted,
    epayKeyIv: encryptedKey.iv,
    epayUrl: String(form.get("epayUrl") || "").trim(),
    verifyPath: uploadedVerifyPath || String(form.get("verifyPath") || "").trim(),
    verifyContent: uploadedVerifyContent || String(form.get("verifyContent") || ""),
  };

  if (!config.epayPid) return badRequest("EPAY_PID is required");
  if (!config.encryptedEpayKey) return badRequest("EPAY_KEY is required");
  if (!config.epayUrl) return badRequest("EPAY_URL is required");

  await savePayConfig(env, config);
  return html(`<script>alert('保存成功');location.href='${config.adminToken ? `/admin?token=${encodeURIComponent(config.adminToken)}` : "/admin"}'</script>`);
}

async function handleBind(request: Request, env: Env) {
  const current = await getPayConfig(env);
  const payload = await request.json().catch(() => ({})) as { admin_token?: unknown; adminToken?: unknown; token?: unknown };
  const token = String(payload.token || "");
  const nextAdminToken = String(payload.admin_token || payload.adminToken || "").trim();

  if (!nextAdminToken) return badRequest("admin_token is required");
  if (isBound(current) && token !== current.adminToken) return json({ error: "Already bound" }, { status: 409 });

  const next: PayConfig = {
    ...current,
    adminToken: nextAdminToken,
  };
  await savePayConfig(env, next);

  return json({
    ok: true,
    bound: true,
  });
}

async function handleAdminToken(request: Request, env: Env) {
  const current = await getPayConfig(env);
  const payload = await request.json().catch(() => ({})) as { token?: unknown; admin_token?: unknown; adminToken?: unknown };
  const token = String(payload.token || "");
  const nextAdminToken = String(payload.admin_token || payload.adminToken || "").trim();

  if (!isBound(current)) return badRequest("Worker is not bound");
  if (token !== current.adminToken) return json({ error: "Unauthorized" }, { status: 401 });
  if (!nextAdminToken) return badRequest("admin_token is required");

  await savePayConfig(env, {
    ...current,
    adminToken: nextAdminToken,
  });

  return json({
    ok: true,
    updated: true,
  });
}

async function handleDebugConfig(request: Request, env: Env) {
  const config = await getPayConfig(env);
  if (!canManage(request, config)) return json({ error: "Unauthorized" }, { status: 401 });

  const key = config.epayKey || "";
  return json({
    ok: true,
    epayPid: config.epayPid,
    epayUrl: config.epayUrl,
    epayKeyLength: key.length,
    epayKeyPrefix: key.slice(0, 5),
    epayKeySuffix: key.slice(-5),
    encrypted: Boolean(config.encryptedEpayKey),
    bound: isBound(config),
    configured: isInitialized(config),
  });
}

async function handleDebugSign(request: Request, env: Env) {
  const config = await getPayConfig(env);
  if (!canManage(request, config)) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const params: Record<string, string> = {};
  for (const [name, value] of url.searchParams.entries()) {
    if (name !== "token") params[name] = value;
  }
  const sorted = Object.entries(params)
    .filter(([name, value]) => value !== "" && name !== "sign" && name !== "sign_type")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");

  return json({
    ok: true,
    sorted,
    sign: md5(`${sorted}${config.epayKey}`),
    epayKeyPrefix: config.epayKey.slice(0, 5),
    epayKeySuffix: config.epayKey.slice(-5),
  });
}

async function maybeServeVerifyFile(request: Request, env: Env) {
  const url = new URL(request.url);
  const config = await getPayConfig(env);
  if (!config.verifyPath || !config.verifyContent) return null;
  const normalizedPath = config.verifyPath.startsWith("/") ? config.verifyPath : `/${config.verifyPath}`;
  if (url.pathname !== normalizedPath) return null;
  return new Response(config.verifyContent, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return corsPreflight();
      }

      const verifyResponse = await maybeServeVerifyFile(request, env);
      if (verifyResponse) return verifyResponse;

      if (url.pathname === "/health") {
        const config = await getPayConfig(env);
        return json({
          ok: true,
          service: "sk-buy/pay-worker",
          configured: Boolean(config.epayPid && config.epayKey && config.epayUrl),
          bound: isBound(config),
        });
      }

      if (url.pathname === "/") {
        const config = await getPayConfig(env);
        return renderHomePage(url.origin, Boolean(config.epayPid && config.epayKey && config.epayUrl));
      }

      if (url.pathname === "/return") {
        return renderPaymentReturnPage(request);
      }

      if (url.pathname === "/admin") {
        const config = await getPayConfig(env);
        if (!canManage(request, config)) return json({ error: "Unauthorized" }, { status: 401 });
        return renderAdminPage(config, url.origin, isBound(config));
      }

      if (url.pathname === "/api/config" && request.method === "POST") {
        return handleSaveConfig(request, env);
      }

      if (url.pathname === "/api/bind" && request.method === "POST") {
        return handleBind(request, env);
      }

      if (url.pathname === "/api/admin-token" && request.method === "POST") {
        return handleAdminToken(request, env);
      }

      if (url.pathname === "/api/debug/config") {
        return handleDebugConfig(request, env);
      }

      if (url.pathname === "/api/debug/sign") {
        return handleDebugSign(request, env);
      }

      if (url.pathname === "/pay") {
        return await buildPaymentRedirect(request, env);
      }

      const callbackMatch = url.pathname.match(/^\/callback\/([^/]+)$/);
      if (callbackMatch) {
        return handleCallback(request, env, callbackMatch[1]);
      }

      return json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Internal error" },
        { status: 500 },
      );
    }
  },
};
