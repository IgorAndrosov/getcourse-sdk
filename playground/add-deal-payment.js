import { runPlayground } from "./lib.js";

const config = (await import("./config.js")).default;
const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

const dealId = flag("dealId") || config.dealId;
const type = flag("type") || config.paymentType;
const amount = flag("amount") ?? config.paymentAmount;
const currency = flag("currency") || config.paymentCurrency || "";
const status = flag("status") || config.paymentStatus || "Получен";
const comment = flag("comment") || config.paymentComment || "";
const notifyUser = process.argv.includes("--notify-user") || Boolean(config.paymentNotifyUser);
const notifyAdmin = process.argv.includes("--notify-admin") || Boolean(config.paymentNotifyAdmin);

if (!dealId || !type || amount === undefined || amount === "") {
  console.error("Укажите --dealId= --type= --amount= (или dealId / paymentType / paymentAmount в config.js)");
  process.exit(1);
}

await runPlayground(async (gc) => {
  const result = await gc.addDealPayment({
    dealId,
    type,
    amount,
    currency: currency || undefined,
    status,
    notifyUser,
    notifyAdmin,
    comment: comment || undefined,
  });
  console.log(result);
});
