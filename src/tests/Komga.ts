import { type TestLogger } from "@paperback/types";
import { expect } from "chai";

import {
  decodeTagId,
  encodeTagId,
  normaliseBaseUrl,
} from "../Komga/implementations/shared/utils.js";
import { TestSuite } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Komga tests", logger);
  // Task 11 restores registerDefaultTests once every declared capability exists.

  suite.test("normaliseBaseUrl trims and strips trailing slashes", async () => {
    expect(normaliseBaseUrl(" https://k.example/ ")).to.equal("https://k.example");
    expect(normaliseBaseUrl("https://k.example//")).to.equal("https://k.example");
  });

  suite.test("tag ids round-trip", async () => {
    for (const value of ["日本語", "Ação", "Science Fiction", "a:b"]) {
      expect(decodeTagId(encodeTagId("genre", value))).to.deep.equal({ kind: "genre", value });
    }
  });

  suite.test("decodeTagId returns undefined for a malformed id", async () => {
    expect(decodeTagId("genre:%E0%A4%A")).to.equal(undefined);
  });

  await suite.run();
}
