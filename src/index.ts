export interface Env {
  EPAY_PID: string;
  EPAY_KEY: string;
}

type ProviderPayload = Record<string, string>;

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

function getRequiredEnv(env: Env, key: keyof Env) {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
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

function normalizePayment(provider: string, payload: ProviderPayload, env: Env): NormalizedPayment {
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

function buildPaymentRedirect(request: Request, env: Env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id") || "";
  const amount = url.searchParams.get("amount") || "";
  const name = url.searchParams.get("name") || `SKG Order ${orderId}`;
  const notifyUrl = url.searchParams.get("notify_url") || "";
  const returnUrl = url.searchParams.get("return_url") || "";
  const paymentUrl = url.searchParams.get("payment_url") || "";
  const type = url.searchParams.get("type") || "alipay";
  const siteName = url.searchParams.get("sitename") || "SKG";

  if (!orderId) return badRequest("order_id is required");
  if (!amount) return badRequest("amount is required");
  if (!paymentUrl) return badRequest("payment_url is required");
  if (!notifyUrl) return badRequest("notify_url is required");

  const pid = getRequiredEnv(env, "EPAY_PID");
  const key = getRequiredEnv(env, "EPAY_KEY");
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
  const payment = normalizePayment(provider, payload, env);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return json({ ok: true, service: "sk-buy/pay-worker" });
      }

      if (url.pathname === "/pay") {
        return buildPaymentRedirect(request, env);
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
