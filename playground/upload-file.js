import { runPlayground } from "./lib.js";

const config = (await import("./config.js")).default;
const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

const filePath = flag("file") || config.uploadFilePath;

if (!filePath) {
  console.error("Укажите файл: --file=./photo.jpg или uploadFilePath в playground/config.js");
  process.exit(1);
}

await runPlayground(async (gc) => {
  const result = await gc.uploadFile({ filePath });
  console.log(result);
});
