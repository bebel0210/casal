// Vercel serverless function: validates the form and relays approved leads to Google Apps Script.
// Required server environment variables:
//   GOOGLE_APPS_SCRIPT_URL              Deployed Apps Script web app URL.
//   GOOGLE_APPS_SCRIPT_SHARED_SECRET   Same value as Apps Script SHARED_SECRET.
//   TURNSTILE_SITE_KEY                 Cloudflare Turnstile public site key.
//   TURNSTILE_SECRET_KEY               Cloudflare Turnstile secret key.
// Optional:
//   TURNSTILE_HOSTNAME      Expected host, e.g. ebook.casaltkshop.com.br.
//   ALLOWED_ORIGIN          Exact browser origin, e.g. https://ebook.casaltkshop.com.br.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function send(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const siteKey = process.env.TURNSTILE_SITE_KEY;
    if (!siteKey) return send(res, 503, { message: "Turnstile não configurado." });
    return send(res, 200, { turnstileSiteKey: siteKey });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { message: "Método não permitido." });
  }

  const expectedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = req.headers.origin;
  if (expectedOrigin && origin !== expectedOrigin) {
    return send(res, 403, { message: "Origem não autorizada." });
  }

  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().includes("application/json")) {
    return send(res, 415, { message: "Formato de envio inválido." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return send(res, 400, { message: "Dados inválidos." }); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return send(res, 400, { message: "Dados inválidos." });
  }

  // Silent success for the honeypot field; do not forward automated submissions.
  if (String(body.website || "").trim()) {
    return send(res, 202, { message: "Cadastro recebido." });
  }

  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const phoneDigits = phone.replace(/\D/g, "");
  const ebookConsent = body.ebookConsent === true;
  const marketingConsent = body.marketingConsent === true;
  const turnstileToken = String(body.turnstileToken || "").trim();

  if (name.length < 2 || !EMAIL_RE.test(email) || phoneDigits.length < 10 || phoneDigits.length > 13 || !ebookConsent) {
    return send(res, 400, { message: "Confira os dados e aceite o recebimento do ebook." });
  }
  const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const sharedSecret = process.env.GOOGLE_APPS_SCRIPT_SHARED_SECRET;
  if (!appsScriptUrl || !sharedSecret || !process.env.TURNSTILE_SECRET_KEY || !turnstileToken) {
    return send(res, 503, { message: "O cadastro ainda está sendo configurado. Tente novamente mais tarde." });
  }

  let endpoint;
  try { endpoint = new URL(appsScriptUrl); }
  catch { return send(res, 500, { message: "Configuração do cadastro inválida." }); }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com") {
    return send(res, 500, { message: "Configuração do cadastro inválida." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const verifyBody = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: turnstileToken
    });
    if (req.headers["x-forwarded-for"]) {
      verifyBody.set("remoteip", String(req.headers["x-forwarded-for"]).split(",")[0].trim());
    }
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyBody,
      signal: controller.signal
    });
    if (!verification.ok) return send(res, 502, { message: "Não foi possível validar a segurança do cadastro." });
    const verified = await verification.json();
    if (!verified.success || (process.env.TURNSTILE_HOSTNAME && verified.hostname !== process.env.TURNSTILE_HOSTNAME)) {
      return send(res, 400, { message: "Verificação de segurança expirada. Tente novamente." });
    }

    const appsScriptResponse = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        ebookConsent,
        marketingConsent,
        sharedSecret,
        source: "landing-page-ebook",
        submittedAt: new Date().toISOString()
      }),
      signal: controller.signal
    });
    if (!appsScriptResponse.ok) return send(res, 502, { message: "Não foi possível concluir o cadastro agora. Tente novamente." });
    const automationResult = await appsScriptResponse.json().catch(() => ({}));
    if (automationResult.ok !== true) {
      return send(res, 502, { message: "Não foi possível concluir o cadastro agora. Tente novamente." });
    }
    return send(res, 202, { message: "Cadastro recebido e ebook enviado." });
  } catch {
    return send(res, 502, { message: "Não foi possível concluir o cadastro agora. Tente novamente." });
  } finally {
    clearTimeout(timeout);
  }
};
