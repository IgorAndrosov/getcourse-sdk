import { runPlayground } from "./lib.js";

const config = (await import("./config.js")).default;
const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

const email = flag("email") || config.createEmail;
const type = flag("type") || config.createType || "ученик";
const firstName = flag("firstName") || config.createFirstName || "";
const lastName = flag("lastName") || config.createLastName || "";
const groupName = flag("group") || config.createGroupName || "";
const inviteFlag = process.argv.includes("--invite");
const noInviteFlag = process.argv.includes("--no-invite");
const sendInvitationEmail = inviteFlag
  ? true
  : noInviteFlag
    ? false
    : config.sendInvitationEmail;

if (!email) {
  console.error("Укажите email: --email=user@example.com или createEmail в playground/config.js");
  process.exit(1);
}

await runPlayground(async (gc) => {
  const result = await gc.createUser({
    email,
    type,
    firstName,
    lastName,
    sendInvitationEmail,
    groupName: groupName || undefined,
  });
  console.log(result);
});
