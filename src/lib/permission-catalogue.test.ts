import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SUPPLIER_PERMISSIONS,
  MODE_LABELS,
  MODE_NOTES,
  SUPPLIER_PERMISSIONS,
  findPermission,
  isChangedFromDefault,
  permissionSettingKey,
  resolveMode,
  writableSupplyFields,
  type PermissionMap,
} from "./permission-catalogue.ts";

/** The shipped position, as the panel would hand it over. */
const shipped = (): PermissionMap =>
  Object.fromEntries(ALL_SUPPLIER_PERMISSIONS.map((p) => [p.key, p.default]));

/**
 * The catalogue is data, so most of what can go wrong with it is data being
 * wrong — a key repeated, a default that is not one of the offered modes, a
 * stored value quietly disabling a working feature. All of that is checkable
 * here, and none of it is checkable by reading the file.
 */

describe("the permission catalogue", () => {
  it("has no repeated keys", () => {
    const keys = ALL_SUPPLIER_PERMISSIONS.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("offers every permission at least two modes", () => {
    // A permission with one mode is a sentence pretending to be a control.
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      assert.ok(p.modes.length >= 2, `${p.key} offers ${p.modes.length} mode(s)`);
    }
  });

  it("has a default that is one of the modes it offers", () => {
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      assert.ok(
        p.modes.includes(p.default),
        `${p.key} defaults to ${p.default}, which it does not offer`
      );
    }
  });

  it("never offers approval without also offering off and allowed", () => {
    // "Needs approval" is a middle. A permission with a middle and only one
    // end is a control that cannot be turned all the way either way.
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      if (p.modes.includes("approval")) {
        assert.ok(p.modes.includes("off"), `${p.key} has approval but no off`);
        assert.ok(p.modes.includes("allowed"), `${p.key} has approval but no allowed`);
      }
    }
  });

  it("says where each one takes effect", () => {
    // The panel promises this, and an empty string would render as a gap
    // rather than as an obvious mistake.
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      assert.ok(p.label.trim().length > 0, `${p.key} has no label`);
      assert.ok(p.note.trim().length > 0, `${p.key} has no note`);
      assert.ok(p.where.trim().length > 0, `${p.key} does not say where`);
    }
  });

  it("puts every permission in exactly one group", () => {
    const grouped = SUPPLIER_PERMISSIONS.flatMap((g) => g.permissions.map((p) => p.key));
    assert.equal(grouped.length, ALL_SUPPLIER_PERMISSIONS.length);
    assert.equal(new Set(grouped).size, grouped.length);
  });

  it("has a label and a note for every mode it uses", () => {
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      for (const mode of p.modes) {
        assert.ok(MODE_LABELS[mode], `no label for ${mode}`);
        assert.ok(MODE_NOTES[mode], `no note for ${mode}`);
      }
    }
  });
});

describe("permissionSettingKey", () => {
  it("namespaces the key", () => {
    assert.equal(permissionSettingKey("addItems"), "perm.supplier.addItems");
  });

  it("cannot collide with the settings already in that table", () => {
    // Setting is one flat table shared with vatRateBasisPoints and the rest.
    const existing = ["vatRateBasisPoints", "currency", "catalogVersion", "purchaseAutoSend"];
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      assert.ok(!existing.includes(permissionSettingKey(p.key)));
    }
  });
});

describe("findPermission", () => {
  it("finds one that exists", () => {
    assert.equal(findPermission("changePrice")?.label, "Change what we pay them");
  });

  it("returns undefined rather than throwing for one that does not", () => {
    assert.equal(findPermission("nonsense"), undefined);
  });
});

describe("resolveMode", () => {
  const definition = findPermission("changePrice")!;

  it("uses a stored value it recognises", () => {
    assert.equal(resolveMode(definition, "allowed"), "allowed");
    assert.equal(resolveMode(definition, "off"), "off");
  });

  it("falls back to the default when nothing is stored", () => {
    assert.equal(resolveMode(definition, null), "approval");
    assert.equal(resolveMode(definition, undefined), "approval");
    assert.equal(resolveMode(definition, ""), "approval");
  });

  it("falls back rather than throwing on a value it does not recognise", () => {
    // A hand-typed row, or one surviving a rename, must not take the whole
    // supplier portal down.
    assert.equal(resolveMode(definition, "maybe"), "approval");
    assert.equal(resolveMode(definition, "ALLOWED"), "approval");
  });

  it("falls back when a mode is real but not offered by this permission", () => {
    // editTerms is on/off only. "approval" is a valid mode elsewhere, and
    // storing it here must not create a middle state nothing implements.
    const terms = findPermission("editTerms")!;
    assert.ok(!terms.modes.includes("approval"));
    assert.equal(resolveMode(terms, "approval"), terms.default);
  });
});

describe("the defaults reproduce what the code did before the panel existed", () => {
  /*
   * The load-bearing test.
   *
   * Installing the panel had to change nothing: every supplier goes on doing
   * exactly what they did the day before. If one of these ever fails, somebody
   * has changed how the system behaves for every supplier by editing what
   * looks like a list of labels.
   */
  it("lets suppliers add items without waiting", () => {
    assert.equal(findPermission("addItems")!.default, "allowed");
  });

  it("still holds a price change for approval", () => {
    assert.equal(findPermission("changePrice")!.default, "approval");
  });

  it("leaves everything else as they could already do it", () => {
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      if (p.key === "changePrice") continue;
      assert.equal(p.default, "allowed", `${p.key} does not default to allowed`);
    }
  });

  it("has nothing switched off out of the box", () => {
    for (const p of ALL_SUPPLIER_PERMISSIONS) {
      assert.notEqual(p.default, "off", `${p.key} ships switched off`);
    }
  });
});

describe("writableSupplyFields", () => {
  /*
   * The form and the spreadsheet both write these fields, and both ask this
   * one function what they may write. These tests are the closest thing to a
   * test of the enforcement itself: the guards around it are server actions
   * that need a browser, but the decision they act on is here.
   */

  it("allows everything but an outright price change, as it ships", () => {
    const may = writableSupplyFields(shipped());
    assert.deepEqual(may, {
      terms: true,
      price: "request",
      stock: true,
      alternative: true,
    });
  });

  it("turns an agreed price into a request, an apply, or nothing", () => {
    assert.equal(writableSupplyFields({ ...shipped(), changePrice: "approval" }).price, "request");
    assert.equal(writableSupplyFields({ ...shipped(), changePrice: "allowed" }).price, "agree");
    assert.equal(writableSupplyFields({ ...shipped(), changePrice: "off" }).price, "no");
  });

  it("stops an alternative when they may not say they are out of stock", () => {
    // A suggestion only ever appears beside "we cannot supply this". Permitted
    // on its own it would be permitted in a moment that cannot arrive.
    const may = writableSupplyFields({
      ...shipped(),
      markOutOfStock: "off",
      suggestAlternative: "allowed",
    });
    assert.equal(may.stock, false);
    assert.equal(may.alternative, false);
  });

  it("keeps stock without the alternative when only the suggestion is off", () => {
    const may = writableSupplyFields({ ...shipped(), suggestAlternative: "off" });
    assert.equal(may.stock, true);
    assert.equal(may.alternative, false);
  });

  it("leaves the other fields alone when terms are off", () => {
    // The point of the split: refusing a part number must not also refuse a
    // price request or an out-of-stock mark.
    const may = writableSupplyFields({ ...shipped(), editTerms: "off" });
    assert.equal(may.terms, false);
    assert.equal(may.price, "request");
    assert.equal(may.stock, true);
  });

  it("permits nothing at all when every one of them is off", () => {
    const may = writableSupplyFields({
      ...shipped(),
      editTerms: "off",
      changePrice: "off",
      markOutOfStock: "off",
      suggestAlternative: "off",
    });
    assert.deepEqual(may, {
      terms: false,
      price: "no",
      stock: false,
      alternative: false,
    });
  });

  it("is unmoved by the permissions that have nothing to do with a supply row", () => {
    // Purchase-order permissions are guarded separately. Turning them off must
    // not quietly narrow what a supplier can say about their own items.
    const may = writableSupplyFields({
      ...shipped(),
      acknowledgeOrders: "off",
      markDispatched: "off",
      confirmQuantities: "off",
      pauseAccount: "off",
      addItems: "off",
      removeOffers: "off",
    });
    assert.deepEqual(may, writableSupplyFields(shipped()));
  });
});

describe("isChangedFromDefault", () => {
  const definition = findPermission("changePrice")!;

  it("is false at the default", () => {
    assert.equal(isChangedFromDefault(definition, "approval"), false);
  });

  it("is true either side of it", () => {
    assert.equal(isChangedFromDefault(definition, "allowed"), true);
    assert.equal(isChangedFromDefault(definition, "off"), true);
  });
});
