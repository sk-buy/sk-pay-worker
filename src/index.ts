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
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
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
      <p class="muted">将 EPay 授权域名填写为：<code>${origin.replace(/^https?:\/\//, "")}</code>。${bound ? "此 Worker 已绑定 SKG，后续访问设置页需要 SKG 商户 ID。" : "绑定 SKG 前，设置页无需密码。"}</p>
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

function md5Hex(input: string) {
  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }
  function rol(num: number, cnt: number) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return add32(rol(add32(add32(a, q), add32(x, t)), s), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function bytesToWords(value: string) {
    const bytes = new TextEncoder().encode(value);
    const words: number[] = [];
    for (let index = 0; index < bytes.length; index += 1) {
      words[index >> 2] |= bytes[index] << ((index % 4) << 3);
    }
    words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) << 3);
    words[(((bytes.length + 8) >> 6) << 4) + 14] = bytes.length * 8;
    return words;
  }
  function hex(value: number) {
    let output = "";
    for (let index = 0; index < 4; index += 1) {
      output += ((value >> (index * 8 + 4)) & 0x0f).toString(16) + ((value >> (index * 8)) & 0x0f).toString(16);
    }
    return output;
  }

  const words = bytesToWords(input);
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    a = ff(a, b, c, d, words[i], 7, -680876936); d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819); b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897); d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341); b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416); d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063); b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682); d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290); b = ff(b, c, d, a, words[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, words[i + 1], 5, -165796510); d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713); b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691); d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335); b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438); d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961); b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467); d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473); b = gg(b, c, d, a, words[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, words[i + 5], 4, -378558); d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562); b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060); d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632); b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174); d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979); b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487); d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520); b = hh(b, c, d, a, words[i + 2], 23, -995338651);

    a = ii(a, b, c, d, words[i], 6, -198630844); d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905); b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571); d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523); b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359); d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380); b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070); d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259); b = ii(b, c, d, a, words[i + 9], 21, -343485551);

    a = add32(a, olda);
    b = add32(b, oldb);
    c = add32(c, oldc);
    d = add32(d, oldd);
  }

  return `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`;
}

function buildEpaySignature(params: Record<string, string>, key: string) {
  const sorted = Object.entries(params)
    .filter(([name, value]) => value !== "" && name !== "sign" && name !== "sign_type")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return md5Hex(`${sorted}${key}`);
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
  const siteName = url.searchParams.get("sitename") || "SKG";

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
    sitename: siteName,
  };
  params.sign = buildEpaySignature(params, key);
  params.sign_type = "MD5";

  const target = new URL(paymentUrl);
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
  return json({
    ok: skgResult.ok,
    status: skgResult.status,
  }, { status: skgResult.ok ? 200 : 502 });
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
  const payload = await request.json().catch(() => ({})) as { merchant_id?: unknown; merchantId?: unknown; token?: unknown };
  const token = String(payload.token || "");
  const merchantId = String(payload.merchant_id || payload.merchantId || "").trim();

  if (!merchantId) return badRequest("merchant_id is required");
  if (isBound(current) && token !== current.adminToken) return json({ error: "Already bound" }, { status: 409 });

  const next: PayConfig = {
    ...current,
    adminToken: merchantId,
  };
  await savePayConfig(env, next);

  return json({
    ok: true,
    bound: true,
    merchant_id: merchantId,
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
