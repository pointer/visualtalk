import assert from "node:assert/strict";
import { test } from "node:test";
import {
  localParticipantTileName,
  normalizeDisplayName,
  remoteParticipantTileName,
} from "./participantNames.js";

test("local tile shows the participant's chosen display name", () => {
  assert.equal(localParticipantTileName("  Jane Doe  "), "Jane Doe");
});

test("local tile keeps its fallback when no display name was supplied", () => {
  assert.equal(localParticipantTileName("  "), "You (Local)");
});

test("remote tile prefers the LiveKit participant name over its identity", () => {
  assert.equal(remoteParticipantTileName("Jane Doe", "guest-123"), "Jane Doe");
  assert.equal(remoteParticipantTileName("", "guest-123"), "guest-123");
});

test("display names are trimmed and bounded before sharing", () => {
  assert.equal(normalizeDisplayName("  Jane Doe  "), "Jane Doe");
  assert.equal(normalizeDisplayName(""), null);
  assert.equal(normalizeDisplayName("x".repeat(81)), null);
  assert.equal(normalizeDisplayName("Jane\nDoe"), null);
});
