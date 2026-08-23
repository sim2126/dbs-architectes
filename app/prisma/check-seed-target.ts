import "dotenv/config";
import { assertSafeDemoSeedTarget } from "./seed-safety";

const target = assertSafeDemoSeedTarget();
console.log(`Confirmed destructive demo target: ${target.identifier}`);
