import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
/** Test-only loader: compile actual source; replace infrastructure boundaries explicitly. */
export function loadSource(filename, stubs = {}, cache = new Map()) {
  const absolute = path.resolve(filename);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const source = readFileSync(absolute, "utf8");
  const compiled = ts.transpileModule(source, {fileName: absolute, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  }}).outputText;
  const compiledModule = {exports: {}};
  cache.set(absolute, compiledModule);
  function dependency(name) {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.startsWith(".")) {
      const resolved = path.resolve(path.dirname(absolute), name) + ".ts";
      for (const [key,value] of Object.entries(stubs)) {
        if (key.startsWith("@/") && path.resolve("src",key.slice(2)) + ".ts" === resolved) return value;
      }
    }
    if (name.startsWith("@/")) return loadSource(path.resolve("src", name.slice(2)) + ".ts", stubs, cache);
    if (name.startsWith(".")) return loadSource(path.resolve(path.dirname(absolute), name) + ".ts", stubs, cache);
    return require(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {filename: absolute})(dependency, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
