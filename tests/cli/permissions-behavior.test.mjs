import test from "node:test";
import { scenarios } from "./permissions-scenarios.mjs";
import { memoryFixture } from "./permissions-memory.mjs";
await scenarios(test,memoryFixture);
