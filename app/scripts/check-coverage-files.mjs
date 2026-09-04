// A coverage gate that measures zero files reports 100 % and passes. This makes
// that failure loud: the include globs must have matched a meaningful set.
import { readFileSync } from "node:fs";
const lcov = readFileSync("coverage/lcov.info", "utf8");
const files = (lcov.match(/^SF:/gm) ?? []).length;
if (files < 10) {
  console.error(`coverage measured only ${files} file(s): the include globs matched nothing`);
  process.exit(1);
}
console.log(`coverage measured ${files} files`);
