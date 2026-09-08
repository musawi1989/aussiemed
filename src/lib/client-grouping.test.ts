import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientKey, clientWhere } from "./client-grouping.ts";
describe("client grouping", () => {
  it("groups colleagues at the same organisation", () => assert.equal(clientKey({id:"1", organisationId:"o", userId:"a"}), clientKey({id:"2", organisationId:"o", userId:"b"})));
  it("keeps unrelated guests separate", () => assert.notEqual(clientKey({id:"1"}), clientKey({id:"2"})));
  it("does not include company orders in a personal account group", () => assert.deepEqual(clientWhere("user:u"), {organisationId:null,userId:"u"}));
  it("invalid keys match no order rather than all orders", () => assert.deepEqual(clientWhere("bad"), {organisationId:null,userId:null,id:"__invalid__"}));
});

import { clientName } from "./client-grouping.ts";
it("buyer names use guest shipping details with safe fallbacks", () => {
 assert.equal(clientName({shippingSnapshot: JSON.stringify({company:"Clinic",contact:"Buyer"})}),"Clinic");
 assert.equal(clientName({shippingSnapshot: JSON.stringify({contact:"Buyer"})}),"Buyer");
 assert.equal(clientName({shippingSnapshot:"bad",placedByName:"Buyer"}),"Buyer");
 assert.equal(clientName({shippingSnapshot:"null"}),"Guest customer");
});
