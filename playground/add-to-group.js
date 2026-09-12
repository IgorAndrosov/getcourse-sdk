import { runPlayground } from "./lib.js";

const config = (await import("./config.js")).default;
const userIdFlag = process.argv.find((arg) => arg.startsWith("--userId="))?.slice("--userId=".length);
const groupFlag = process.argv.find((arg) => arg.startsWith("--group="))?.slice("--group=".length);
const userId = userIdFlag || config.userId;
const groupName = groupFlag || config.groupName;

if (!userId || !groupName) {
  console.error("Укажите userId и groupName в playground/config.js или флаги --userId= и --group=");
  process.exit(1);
}

await runPlayground(async (gc) => {
  const result = await gc.addUserToGroup({ userId, groupName });
  console.log(result);
});
