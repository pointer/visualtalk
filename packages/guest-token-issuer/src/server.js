import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { AccessToken } from "livekit-server-sdk";

const BODY_LIMIT = 8192;
const DISPLAY_NAME_LIMIT = 80;
// An invitation link is a bearer capability: whoever holds it can exchange it
// for participant tokens. These limits bound that, and are deliberately sized
// for one meeting rather than for abuse resistance — the counters are
// per-process, so a multi-instance deployment needs a shared store.
const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const MIN_TOKEN_TTL_SECONDS = 60;
const DEFAULT_MAX_TOKENS_PER_INVITE = 50; // matches MAX_INVITEES in the app
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;

/** Token lifetime: at most 24 h, at least a minute, never past the invite. */
export function clampTtl(seconds) {
  const value = Number.isFinite(seconds) ? Math.floor(seconds) : DEFAULT_TOKEN_TTL_SECONDS;
  return Math.max(MIN_TOKEN_TTL_SECONDS, Math.min(DEFAULT_TOKEN_TTL_SECONDS, value));
}

export function verifyInvite(invite, apiKey, apiSecret, now = Math.floor(Date.now() / 1000)) {
  if (typeof invite !== "string") throw new Error("invalid invite");
  const separator = invite.indexOf(".");
  if (separator <= 0 || separator !== invite.lastIndexOf(".")) throw new Error("invalid invite");

  const payload = invite.slice(0, separator);
  const encodedSignature = invite.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)) {
    throw new Error("invalid invite");
  }

  const expected = createHmac("sha256", apiSecret).update(payload).digest();
  const received = Buffer.from(encodedSignature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("invalid invite");
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid invite");
  }
  if (
    claims?.iss !== apiKey ||
    claims?.purpose !== "visualtalk-invite" ||
    typeof claims?.room !== "string" ||
    claims.room.length === 0 ||
    claims.room.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(claims.room) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= now
  ) {
    throw new Error("invalid or expired invite");
  }

  return { room: claims.room, exp: claims.exp };
}

export async function createParticipantToken(
  room,
  displayName,
  apiKey,
  apiSecret,
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
) {
  const identity = `guest-${randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    ttl: clampTtl(ttlSeconds),
  });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return { token: await token.toJwt(), identity };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error("request too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

export function createIssuerServer({
  apiKey,
  apiSecret,
  maxTokensPerInvite = DEFAULT_MAX_TOKENS_PER_INVITE,
  rateLimitPerMinute = DEFAULT_RATE_LIMIT_PER_MINUTE,
  now = () => Math.floor(Date.now() / 1000),
}) {
  // Invite payload (base64url, without the signature) -> tokens minted so far.
  const issuedPerInvite = new Map();
  // Source address -> fixed one-minute window counter.
  const hitsPerAddress = new Map();

  const pruneExpired = (reference) => {
    for (const [key, entry] of issuedPerInvite) {
      if (entry.exp <= reference) issuedPerInvite.delete(key);
    }
    for (const [key, entry] of hitsPerAddress) {
      if (entry.windowStart < reference - 120) hitsPerAddress.delete(key);
    }
  };

  const allowRequest = (address) => {
    const current = now();
    const windowStart = current - (current % 60);
    const entry = hitsPerAddress.get(address);
    if (!entry || entry.windowStart !== windowStart) {
      hitsPerAddress.set(address, { windowStart, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= rateLimitPerMinute;
  };

  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");

    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end('{"status":"ok"}');
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/token") {
      response.writeHead(404);
      response.end();
      return;
    }

    let body;
    try {
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        throw Object.assign(new Error("JSON required"), { status: 415 });
      }
      body = await readJson(request);
    } catch (error) {
      response.writeHead(error.status || 400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
      return;
    }

    const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : "";
    if (
      displayName.length === 0 ||
      [...displayName].length > DISPLAY_NAME_LIMIT ||
      /[\u0000-\u001f\u007f]/.test(displayName)
    ) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end('{"error":"Display name must contain between 1 and 80 characters."}');
      return;
    }

    // Cheap check first: rate limiting runs before any HMAC verification so a
    // flood of forged invitations cannot burn CPU on crypto.
    const address = request.socket?.remoteAddress || "unknown";
    if (!allowRequest(address)) {
      response.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
      response.end('{"error":"Too many requests. Try again in a minute."}');
      return;
    }

    let room;
    let expiresAt;
    try {
      ({ room, exp: expiresAt } = verifyInvite(body?.invite, apiKey, apiSecret, now()));
    } catch {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end('{"error":"Invalid or expired invitation."}');
      return;
    }

    const inviteKey = String(body.invite).split(".", 1)[0];
    // Prune against the current time, not this invite's expiry: verifyInvite
    // has just proved `expiresAt > now`, so the tally for *this* invite always
    // survives, while dead ones are dropped.
    pruneExpired(now());
    const tally = issuedPerInvite.get(inviteKey) || { count: 0, exp: expiresAt };
    if (tally.count >= maxTokensPerInvite) {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end('{"error":"This invitation has reached its participant limit."}');
      return;
    }

    try {
      // The token never outlives the invitation that produced it.
      const issued = await createParticipantToken(
        room,
        displayName,
        apiKey,
        apiSecret,
        expiresAt - now(),
      );
      tally.count += 1;
      issuedPerInvite.set(inviteKey, tally);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(issued));
    } catch {
      console.error("Guest token issuance failed.");
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end('{"error":"Token issuance failed."}');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = process.env;
  const port = Number(process.env.PORT || 8080);
  const maxTokensPerInvite = Number(
    process.env.MAX_TOKENS_PER_INVITE || DEFAULT_MAX_TOKENS_PER_INVITE,
  );
  const rateLimitPerMinute = Number(
    process.env.RATE_LIMIT_PER_MINUTE || DEFAULT_RATE_LIMIT_PER_MINUTE,
  );
  if (
    !apiKey ||
    !apiSecret ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(maxTokensPerInvite) ||
    maxTokensPerInvite < 1 ||
    !Number.isInteger(rateLimitPerMinute) ||
    rateLimitPerMinute < 1
  ) {
    console.error(
      "LIVEKIT_API_KEY, LIVEKIT_API_SECRET and a valid PORT are required; " +
        "MAX_TOKENS_PER_INVITE and RATE_LIMIT_PER_MINUTE must be positive integers when set.",
    );
    process.exit(1);
  }

  createIssuerServer({ apiKey, apiSecret, maxTokensPerInvite, rateLimitPerMinute }).listen(
    port,
    "0.0.0.0",
    () => {
      console.log(`VisualTalk guest token issuer listening on port ${port}.`);
    },
  );
}
