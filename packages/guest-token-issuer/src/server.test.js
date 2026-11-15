import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { clampTtl, createIssuerServer, createParticipantToken, verifyInvite } from "./server.js";

const apiKey = "test-key";
const apiSecret = "test-secret";

function makeInvite(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", apiSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test("accepts an invite for its signed room", () => {
  const invite = makeInvite({
    iss: apiKey,
    purpose: "visualtalk-invite",
    room: "room-1",
    exp: 2_000_000_000,
  });
  assert.deepEqual(verifyInvite(invite, apiKey, apiSecret, 1_900_000_000), {
    room: "room-1",
    exp: 2_000_000_000,
  });
});

test("rejects expired, tampered, and differently scoped invites", () => {
  const claims = {
    iss: apiKey,
    purpose: "visualtalk-invite",
    room: "room-1",
    exp: 1_800_000_000,
  };
  const valid = makeInvite(claims);
  assert.throws(() => verifyInvite(valid, apiKey, apiSecret, 1_800_000_000), /expired/);
  assert.throws(() => verifyInvite(`${valid.slice(0, -1)}x`, apiKey, apiSecret), /invite/);
  assert.throws(() => verifyInvite(makeInvite({ ...claims, room: "" }), apiKey, apiSecret), /invite/);
});

test("mints unique participant identities while retaining the display name", async () => {
  const first = await createParticipantToken("room-1", "Jane Doe", apiKey, apiSecret);
  const second = await createParticipantToken("room-1", "Jane Doe", apiKey, apiSecret);
  assert.notEqual(first.identity, second.identity);

  const claims = JSON.parse(Buffer.from(first.token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.sub, first.identity);
  assert.equal(claims.name, "Jane Doe");
  assert.equal(claims.video.room, "room-1");
  assert.equal(claims.video.roomJoin, true);
});

test("clamps the minted token lifetime", () => {
  assert.equal(clampTtl(3600), 3600);
  assert.equal(clampTtl(0), 60, "never mint a token that is already dead");
  assert.equal(clampTtl(10 * 24 * 60 * 60), 24 * 60 * 60, "never exceed 24 h");
  assert.equal(clampTtl(Number.NaN), 24 * 60 * 60);
});

// End-to-end over a real socket: this is the path the guest app takes, so the
// limits (participant cap, rate limit) and the response shape are asserted here
// rather than trusted from the unit tests above.
test("the HTTP endpoint mints one identity per request and enforces its limits", async () => {
  const clock = { value: 1_900_000_000 };
  const server = createIssuerServer({
    apiKey,
    apiSecret,
    maxTokensPerInvite: 2,
    rateLimitPerMinute: 3,
    now: () => clock.value,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const invite = makeInvite({
    iss: apiKey,
    purpose: "visualtalk-invite",
    room: "room-1",
    exp: clock.value + 3600,
  });
  const post = (body) =>
    fetch(`${base}/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);

    const first = await post({ invite, display_name: "Jane Doe" });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.match(firstBody.identity, /^guest-[0-9a-f-]{36}$/);
    const claims = JSON.parse(Buffer.from(firstBody.token.split(".")[1], "base64url").toString());
    assert.equal(claims.sub, firstBody.identity);
    assert.equal(claims.name, "Jane Doe");
    assert.equal(claims.video.room, "room-1");
    assert.ok(claims.exp - claims.nbf <= 3600, "the token must not outlive the invitation");

    const second = await post({ invite, display_name: "Someone Else" });
    assert.equal(second.status, 200);
    assert.notEqual((await second.json()).identity, firstBody.identity);

    // Third use of the same invitation hits the participant cap.
    assert.equal((await post({ invite, display_name: "Third" })).status, 403);

    // A rejected display name never reaches the rate limiter or the HMAC.
    assert.equal((await post({ invite, display_name: "" })).status, 400);
    assert.equal((await fetch(`${base}/v1/nope`)).status, 404);
    const wrongType = await fetch(`${base}/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "nope",
    });
    assert.equal(wrongType.status, 415);

    // Same minute window, so the per-address budget (3) is now exhausted.
    clock.value += 1;
    let throttled = false;
    for (let attempt = 0; attempt < 6 && !throttled; attempt += 1) {
      throttled = (await post({ invite, display_name: "Flood" })).status === 429;
    }
    assert.ok(throttled, "expected a 429 once the per-minute window is exhausted");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
