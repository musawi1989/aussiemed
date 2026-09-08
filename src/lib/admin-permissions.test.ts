import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_KEYS,
  ALL_ADMIN_PERMISSIONS,
  canReach,
  canUseSection,
  deniedFrom,
  findAdminPermission,
  permissionForPath,
} from "./admin-permissions.ts";

describe("the catalogue itself", () => {
  it("has no duplicate keys", () => {
    // Two permissions sharing a key means one silently governs the other.
    assert.equal(new Set(ADMIN_PERMISSION_KEYS).size, ADMIN_PERMISSION_KEYS.length);
  });

  it("gives every permission a label, a detail and at least one path", () => {
    for (const permission of ALL_ADMIN_PERMISSIONS) {
      assert.ok(permission.label.trim(), permission.key);
      assert.ok(permission.detail.trim(), permission.key);
      assert.ok(permission.paths.length > 0 || permission.key.endsWith(":write"), permission.key);
    }
  });

  it("claims each path exactly once across the whole catalogue", () => {
    // Two sections claiming the same path is an ambiguity that longest-match
    // would resolve arbitrarily.
    const paths = ALL_ADMIN_PERMISSIONS.flatMap((p) => p.paths);
    assert.equal(new Set(paths).size, paths.length);
  });

  it("finds a permission by key and nothing by a made-up one", () => {
    assert.equal(findAdminPermission("orders")?.label, "Orders");
    assert.equal(findAdminPermission("nope"), undefined);
  });

  it("puts every permission in a group", () => {
    const grouped = ADMIN_PERMISSIONS.flatMap((g) => g.permissions).length;
    assert.equal(grouped, ALL_ADMIN_PERMISSIONS.length);
  });
});

describe("server action permissions", () => {
  it("allows reading without allowing changes", () => {
    const readOnly = { isMaster: false, denied: ["orders:write"] };
    assert.ok(canUseSection("orders", "view", readOnly));
    assert.ok(!canUseSection("orders", "write", readOnly));
  });
  it("denying visibility also denies all writes", () => {
    assert.ok(!canUseSection("orders", "write", { isMaster: false, denied: ["orders"] }));
  });
  it("masters retain known permissions and misspelled sections fail closed", () => {
    assert.ok(canUseSection("orders", "write", { isMaster: true, denied: ["orders"] }));
    assert.ok(!canUseSection("ordres", "write", { isMaster: true, denied: [] }));
  });
  it("retains action denials read from the database", () => {
    assert.deepEqual(deniedFrom([{ key: "orders:write" }]), ["orders:write"]);
  });
});

describe("which permission a path needs", () => {
  it("matches a section and everything under it", () => {
    assert.equal(permissionForPath("/admin/orders"), "orders");
    assert.equal(permissionForPath("/admin/orders/AM-2026-000001"), "orders");
    assert.equal(permissionForPath("/admin/purchasing/backorders"), "purchasing");
  });

  it("does not match a path that merely starts with the same letters", () => {
    // /admin/ordersomething is not /admin/orders. Without the boundary a new
    // screen could fall under a section nobody meant it to.
    assert.equal(permissionForPath("/admin/ordersomething"), null);
  });

  it("leaves an unclaimed path ungoverned", () => {
    // The dashboard, and any one-off screen, keep working without an entry.
    assert.equal(permissionForPath("/admin"), null);
    assert.equal(permissionForPath("/admin/something-new"), null);
  });
});

describe("who may reach what", () => {
  it("lets a plain admin into anything they are not denied", () => {
    assert.ok(canReach("/admin/orders", { isMaster: false, denied: ["reports"] }));
  });

  it("keeps a denied admin out of the section and everything under it", () => {
    const denied = { isMaster: false, denied: ["reports"] };
    assert.ok(!canReach("/admin/reports", denied));
    assert.ok(!canReach("/admin/reports/products", denied));
  });

  it("lets the master admin everywhere, whatever is stored against them", () => {
    // The point of them. A permission screen that can lock the last person out
    // of the permission screen is a bricked system with extra steps.
    const master = { isMaster: true, denied: ADMIN_PERMISSION_KEYS };
    for (const permission of ALL_ADMIN_PERMISSIONS) {
      for (const path of permission.paths) {
        assert.ok(canReach(path, master), path);
      }
    }
  });

  it("lets anybody reach an ungoverned path, denied or not", () => {
    assert.ok(
      canReach("/admin", { isMaster: false, denied: ADMIN_PERMISSION_KEYS })
    );
  });
});

describe("reading stored denials", () => {
  it("keeps the keys it recognises", () => {
    assert.deepEqual(deniedFrom([{ key: "reports" }, { key: "email" }]), [
      "reports",
      "email",
    ]);
  });

  it("ignores a key that is no longer in the catalogue", () => {
    // A permission removed from the code leaves a harmless orphan row rather
    // than silently locking somebody out of something else.
    assert.deepEqual(deniedFrom([{ key: "reports" }, { key: "retired" }]), [
      "reports",
    ]);
  });

  it("treats nothing stored as nothing denied", () => {
    assert.deepEqual(deniedFrom([]), []);
  });
});
