import { runPlayground } from "./lib.js";

const config = (await import("./config.js")).default;
const emailFlag = process.argv.find((arg) => arg.startsWith("--email="))?.slice("--email=".length);
const phoneFlag = process.argv.find((arg) => arg.startsWith("--phone="))?.slice("--phone=".length);
const email = emailFlag || config.searchEmail;
const phone = phoneFlag || config.searchPhone;

if (!email && !phone) {
  console.error("Укажите searchEmail/searchPhone в playground/config.js или флаги --email= / --phone=");
  process.exit(1);
}

await runPlayground(async (gc) => {
  const id = await gc.getUserId(email ? { email } : { phone });
  console.log(id);
});
