import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GetCourseClient } from "../src/index.js";

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const configPath = join(playgroundDir, "config.js");

export async function runPlayground(action) {
  if (!existsSync(configPath)) {
    console.error("Нет playground/config.js. Скопируйте playground/config.example.js в config.js и заполните данные.");
    process.exit(1);
  }

  const { keepOpen = false, ...clientConfig } = (await import("./config.js")).default;

  if (!clientConfig.login || !clientConfig.password) {
    console.error("Заполните login и password в playground/config.js");
    process.exit(1);
  }

  const client = new GetCourseClient(clientConfig);
  await client.start();

  let shouldClose = true;
  try {
    await action(client);

    if (keepOpen) {
      shouldClose = false;
      console.log("Браузер оставлен открытым. Нажмите Ctrl+C для выхода.");
      await new Promise(() => {});
    }
  } finally {
    if (shouldClose) {
      await client.close();
    }
  }
}
