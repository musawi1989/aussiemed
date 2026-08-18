import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsFilter, providerFor } from "./db-search.ts";

describe("providerFor", () => {
  it("reads Postgres out of the connection string", () => {
    for (const url of [
      "postgresql://user:pass@host:5432/aussiemed",
      "postgres://user@host/aussiemed",
      "POSTGRESQL://HOST/db",
    ]) {
      assert.equal(providerFor(url), "postgresql", url);
    }
  });

  it("treats anything else as SQLite, including nothing at all", () => {
    for (const url of ["file:./dev.db", "", undefined]) {
      assert.equal(providerFor(url), "sqlite", String(url));
    }
  });

  it("is not fooled by a database called postgres on a file url", () => {
    assert.equal(providerFor("file:./postgres.db"), "sqlite");
  });
});

describe("containsFilter", () => {
  it("asks Postgres for a case-insensitive match", () => {
    // Without this, searching "dubai" stops finding "Dubai Medical" on the day
    // the site moves — with no error to explain it.
    assert.deepEqual(containsFilter("dubai", "postgresql"), {
      contains: "dubai",
      mode: "insensitive",
    });
  });

  it("sends SQLite a plain contains, because it has no query mode at all", () => {
    // Passing mode to the SQLite provider is an error, not a no-op.
    assert.deepEqual(containsFilter("dubai", "sqlite"), { contains: "dubai" });
    assert.equal("mode" in containsFilter("dubai", "sqlite"), false);
  });

  it("passes the term through untouched", () => {
    assert.equal(containsFilter("AM-2026-000004", "postgresql").contains, "AM-2026-000004");
    assert.equal(containsFilter("", "sqlite").contains, "");
  });
});
