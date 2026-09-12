import { runPlayground } from "./lib.js";

await runPlayground(async (gc) => {
  const result = await gc.login();
  console.log(result);
});
