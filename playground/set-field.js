import { runPlayground } from "./lib.js";

const config = (await import("./config.js")).default;
const userIdFlag = process.argv.find((arg) => arg.startsWith("--userId="))?.slice("--userId=".length);
const fieldFlag = process.argv.find((arg) => arg.startsWith("--field="))?.slice("--field=".length);
const valueFlag = process.argv.find((arg) => arg.startsWith("--value="))?.slice("--value=".length);
const clear = process.argv.includes("--clear");
const userId = userIdFlag || config.userId;
const fieldName = fieldFlag || config.fieldName;
const value = valueFlag ?? config.fieldValue;

if (!userId || !fieldName) {
  console.error("Укажите userId и fieldName (флаги --userId= --field=) и --value= или --clear");
  process.exit(1);
}

if (!clear && value === undefined) {
  console.error("Передайте --value=... или --clear");
  process.exit(1);
}

await runPlayground(async (gc) => {
  const result = await gc.setUserCustomField({
    userId,
    fieldName,
    value: clear ? "" : value,
    clear,
  });
  console.log(result);
});
