import { type TestLogger } from "@paperback/types";

import { Komga } from "../Komga/main.js";
import sourceInfo from "../Komga/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Komga tests", logger);
  registerDefaultTests(suite, Komga, sourceInfo);

  await suite.run();
}
