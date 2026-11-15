import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DUPLICATE_IDENTITY,
  describeDisconnect,
  isDuplicateIdentity,
} from "./disconnectReasons.js";

test("a duplicate-identity kick is explained instead of shown as a bare number", () => {
  const message = describeDisconnect(DUPLICATE_IDENTITY);
  assert.match(message, /same identity/);
  assert.match(message, /each guest needs their own link/);
  assert.ok(!message.includes("(2)"), "the raw enum value must not leak into the UI");
  assert.equal(isDuplicateIdentity(DUPLICATE_IDENTITY), true);
});

test("known reasons are translated and unknown ones fall back gracefully", () => {
  assert.match(describeDisconnect(5), /room was deleted/);
  assert.match(describeDisconnect(14), /timed out/);
  assert.equal(isDuplicateIdentity(5), false);
  // Not in the enum, and absent: still a usable sentence, no "(NaN)" / "(null)".
  assert.match(describeDisconnect(999), /^Disconnected from the meeting\. /);
  assert.match(describeDisconnect(undefined), /^Disconnected from the meeting\. /);
  assert.match(describeDisconnect(null), /^Disconnected from the meeting\. /);
});

test("string reasons from either spelling are understood", () => {
  assert.equal(isDuplicateIdentity("2"), true);
  assert.equal(isDuplicateIdentity("DUPLICATE_IDENTITY"), true);
  assert.match(describeDisconnect("DUPLICATE_IDENTITY"), /same identity/);
  assert.match(describeDisconnect("SERVER_SHUTDOWN"), /server shut down/);
});