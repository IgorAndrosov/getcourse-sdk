import { runPlayground } from "./lib.js";

const config = (await import("./config.js")).default;
const dealIdFlag = process.argv.find((arg) => arg.startsWith("--dealId="))?.slice("--dealId=".length);
const fieldFlag = process.argv.find((arg) => arg.startsWith("--field="))?.slice("--field=".length);
const valueFlag = process.argv.find((arg) => arg.startsWith("--value="))?.slice("--value=".length);
const clear = process.argv.includes("--clear");
const dealId = dealIdFlag || config.dealId;
const fieldName = fieldFlag || config.dealFieldName || config.fieldName;
const value = valueFlag ?? config.dealFieldValue ?? config.fieldValue;

if (!dealId || !fieldName) {
  console.error("Укажите dealId и fieldName (флаги --dealId= --field=) и --value= или --clear");
  process.exit(1);
}

if (!clear && value === undefined) {
  console.error("Передайте --value=... или --clear");
  process.exit(1);
}

await runPlayground(async (gc) => {
  const result = await gc.setDealCustomField({
    dealId,
    fieldName,
    value: clear ? "" : value,
    clear,
  });
  console.log(result);
});
