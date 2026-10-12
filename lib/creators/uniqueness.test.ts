import assert from "node:assert/strict";
import test from "node:test";
import { campaignTagClash, handleOwner, pickHandle, takenHandles, type CreatorDoc } from "./uniqueness";

const docs: CreatorDoc[] = [
  { id: "a1", data: { name: "Anya Agrawal", assigned_handle: "anya.keshah", tiktok_handle: "@Anya.Keshah", instagram_handle: "anya.keshah", campaign_tags: ["Anya"] } },
  { id: "a2", data: { name: "Anya Smith", assigned_handle: "anya.keshah2", campaign_tags: [] } },
  { id: "i1", data: { name: "Isai Trujillo", tiktok_handle: "isai.keshah", campaign_tags: ["isai", "isai-ig"] } },
];

test("pickHandle: first gets the clean name, repeats get the next number", () => {
  assert.equal(pickHandle("Jen Lee", takenHandles(docs, "new")), "jen.keshah");
  assert.equal(pickHandle("Anya Patel", takenHandles(docs, "new")), "anya.keshah3");
  // their own handles never count against them
  assert.equal(pickHandle("Anya Agrawal", takenHandles(docs, "a1")), "anya.keshah");
});

test("handleOwner: another creator's handle (any case, with @) is caught; your own isn't", () => {
  assert.equal(handleOwner(docs, "new", "@ANYA.keshah"), "Anya Agrawal");
  assert.equal(handleOwner(docs, "new", "anya.keshah2"), "Anya Smith");
  assert.equal(handleOwner(docs, "a1", "anya.keshah"), null);
  assert.equal(handleOwner(docs, "new", "jen.keshah"), null);
  assert.equal(handleOwner(docs, "new", ""), null);
});

test("campaignTagClash: case-insensitive, ignores the creator's own tags", () => {
  assert.deepEqual(campaignTagClash(docs, "new", ["ISAI"]), { tag: "ISAI", owner: "Isai Trujillo" });
  assert.equal(campaignTagClash(docs, "i1", ["isai"]), null);
  assert.equal(campaignTagClash(docs, "new", ["jen"]), null);
});
