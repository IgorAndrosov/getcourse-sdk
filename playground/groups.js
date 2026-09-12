import { runPlayground } from "./lib.js";

await runPlayground(async (gc) => {
  const groups = await gc.getUserGroups();
  console.log(`Групп: ${groups.length}`);
  console.log(groups);
});
