import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditOwnLogo } from "./logo-access.ts";
test("supplier can edit only their supplier logo", () => {
 const user = {role:"Supplier", id:"u1", supplierId:"s1", organisationId:"o1"};
 assert.equal(canEditOwnLogo(user,"supplier","s1"),true);
 for (const [kind,id] of [["supplier","s2"],["organisation","o1"],["user","u1"]]) assert.equal(canEditOwnLogo(user,kind,id),false);
});
test("customer can edit own account and personal logo only", () => {
 const user = {role:"Customer",id:"u1",organisationId:"o1",supplierId:"s1"};
 assert.equal(canEditOwnLogo(user,"organisation","o1"),true);
 assert.equal(canEditOwnLogo(user,"user","u1"),true);
 for (const [kind,id] of [["organisation","o2"],["user","u2"],["supplier","s1"],["invalid","u1"]]) assert.equal(canEditOwnLogo(user,kind,id),false);
});
test("missing account and unknown roles cannot edit logos", () => {
 assert.equal(canEditOwnLogo({role:"Customer",id:"u"},"organisation",""),false);
 assert.equal(canEditOwnLogo({role:"Guest",id:"u"},"user","u"),false);
 assert.equal(canEditOwnLogo({role:"Admin",id:"u"},"user","u"),false);
});
