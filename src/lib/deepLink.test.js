import assert from "node:assert/strict";
import { test } from "node:test";
import { pickInviteLink } from "./deepLink.js";

test("picks the invite link out of whatever the OS handed us", () => {
  const link = "visualtalk://join?room=room-1&token=abc";
  assert.equal(pickInviteLink([link]), link);
  assert.equal(pickInviteLink(["https://visualtalk.app/", link]), link);
  assert.equal(pickInviteLink([]), null);
  assert.equal(pickInviteLink(null), null);
  assert.equal(pickInviteLink(undefined), null);
});

test("ignores other schemes and non-strings", () => {
  assert.equal(pickInviteLink(["http://visualtalk://join?room=x"]), null);
  assert.equal(pickInviteLink(["visualtalkx://join?room=x"]), null);
  assert.equal(pickInviteLink([null, 42, {}, "visualtalk://join?room=y"]), "visualtalk://join?room=y");
});