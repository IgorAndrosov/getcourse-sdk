/**
 * Живой прогон всех методов SDK.
 * Логин/пароль — playground/config.js (не в git).
 * Школа по умолчанию: https://igorandrosov-test.getcourse.ru
 *
 *   npm test
 *   HEADED=1 npm test
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetCourseClient,
  UserNotFoundError,
  UserExistsError,
  GroupNotFoundError,
  CustomFieldNotFoundError,
} from "../src/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const configPath = join(root, "../playground/config.js");
const TEST_BASE_URL = process.env.GC_BASE_URL || "https://igorandrosov-test.getcourse.ru";
const TIMEOUT = 120_000;

if (!existsSync(configPath)) {
  throw new Error("Нет playground/config.js — скопируйте config.example.js и заполните login/password");
}

const fileConfig = (await import("../playground/config.js")).default;
const stamp = Date.now();
const ctx = {
  email: `e2e.${stamp}@gmail.com`,
  groupName: `e2e-${stamp}`,
  userField: "gc_system_user_utm_source",
  dealField: "gc_system_deal_utm_source",
  userId: "",
  dealId: "",
};

const gc = new GetCourseClient({
  login: process.env.GC_LOGIN || fileConfig.login,
  password: process.env.GC_PASSWORD || fileConfig.password,
  baseUrl: TEST_BASE_URL,
  headless: process.env.HEADED === "1" ? false : true,
  timeoutMs: 45_000,
});

function parseIdFromUrl(url) {
  const pathMatch = String(url).match(/\/id\/(\d+)/);
  if (pathMatch) {
    return pathMatch[1];
  }
  const queryMatch = String(url).match(/[?&]id=(\d+)/);
  return queryMatch ? queryMatch[1] : "";
}

async function ensureGroup(name) {
  await gc.goto("/pl/user/group/index");
  const existing = await gc.page.locator("ol.group-tree div.dd-handle").allTextContents();
  const hit = existing.some((text) => text.replace(/\s+/g, " ").trim().includes(name));
  if (hit) {
    return;
  }
  await gc.page.getByRole("button", { name: "Добавить группу" }).click();
  const nameInput = gc.page.locator('input[name="UserGroup[name]"]').first();
  await nameInput.waitFor({ state: "visible" });
  await nameInput.click();
  await nameInput.fill("");
  await nameInput.pressSequentially(name, { delay: 20 });
  await nameInput.evaluate((el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const add = gc.page.locator("#submit-new-group").first();
  await gc.page.waitForFunction(() => {
    const btn = document.querySelector("#submit-new-group");
    return Boolean(btn && !btn.disabled);
  }, { timeout: 15_000 });
  const saved = gc.page.waitForResponse((res) => res.url().includes("save-group"), { timeout: 20_000 });
  await add.click({ force: true });
  await saved.catch(() =>
    gc.page.locator("#group-save-form").evaluate((form) => {
      if (form.requestSubmit) {
        form.requestSubmit();
      } else {
        form.submit();
      }
    }),
  );
  await gc.page.waitForFunction(
    (target) => {
      const tree = document.querySelector("ol.group-tree");
      return Boolean(tree && tree.innerText.replace(/\s+/g, " ").includes(target));
    },
    name,
    { timeout: 30_000 },
  );
}

async function attachFirstOffer() {
  const block = gc.page.locator("#addPositionBlock").first();
  if (!(await block.count())) {
    return;
  }
  await block.waitFor({ state: "attached" });
  await gc.page.evaluate(() => {
    const el = document.querySelector("#addPositionBlock .rd-btn, #addPositionBlock .rd-empty-text, #addPositionBlock .select-object-widget");
    if (el) {
      el.click();
    }
  });
  const choose = gc.page.locator("a.choose-row-button").first();
  await choose.waitFor({ state: "visible", timeout: 30_000 });
  await choose.click();
  const confirm = gc.page.getByRole("button", { name: /^Добавить$/i }).first();
  await confirm.waitFor({ state: "visible" });
  await confirm.click();
}

async function ensureDeal(userId) {
  await gc.goto("/pl/sales/deal/index");
  const existing = gc.page.locator('table.kv-grid-table tbody tr a[href*="/update/id/"]').first();
  if (await existing.count()) {
    const href = (await existing.getAttribute("href")) ?? "";
    const id = parseIdFromUrl(href);
    if (id) {
      return id;
    }
  }

  await gc.goto(`/sales/control/deal/new?userId=${userId}`);
  await gc.page
    .locator("#addPositionBlock, form#dealForm")
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });

  let id = parseIdFromUrl(gc.page.url());
  if (id && /deal\/update/.test(gc.page.url())) {
    return id;
  }

  await attachFirstOffer();

  const create = gc.page
    .locator('input[name="create"], .page-header input[value="Создать"], .page-header button:has-text("Создать")')
    .filter({ visible: true })
    .first();
  if (await create.isEnabled().catch(() => false)) {
    await Promise.all([
      gc.page.waitForLoadState("domcontentloaded"),
      create.click(),
    ]);
    id = parseIdFromUrl(gc.page.url());
  }

  if (!id) {
    const save = gc.page
      .locator("form#dealForm input[name=save], form#dealForm button.btn-primary.save, .page-header button:has-text('Сохранить')")
      .filter({ visible: true })
      .first();
    if (await save.isVisible().catch(() => false)) {
      await Promise.all([
        gc.page.waitForLoadState("domcontentloaded"),
        save.click(),
      ]);
      id = parseIdFromUrl(gc.page.url());
    }
  }
  if (!id) {
    throw new Error("Не удалось создать заказ на пустой школе (нет сделки и «Создать заказ» не открыл карточку)");
  }
  return id;
}

let loggedIn = false;

function requireLogin(t) {
  if (!loggedIn) {
    t.skip("login не прошёл");
    return false;
  }
  return true;
}

describe("getcourse-sdk methods", { concurrency: 1, timeout: 900_000 }, () => {
  before(async () => {
    await gc.start();
  });

  after(async () => {
    await gc.close();
  });

  test("login()", { timeout: TIMEOUT }, async () => {
    const result = await gc.login();
    assert.equal(result.success, true);
    assert.equal(result.twoFactorRequired, false);
    loggedIn = true;
  });

  test("getUserGroups()", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    const groups = await gc.getUserGroups();
    assert.ok(Array.isArray(groups));
  });

  test("createUser()", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    const created = await gc.createUser({
      email: ctx.email,
      type: "ученик",
      firstName: "E2E",
      lastName: "User",
      sendInvitationEmail: false,
    });
    assert.equal(created.success, true);
    assert.ok(created.userId);
    ctx.userId = created.userId;
  });

  test("createUser() duplicate email → UserExistsError", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    await assert.rejects(
      () => gc.createUser({ email: ctx.email, type: "ученик", sendInvitationEmail: false }),
      UserExistsError,
    );
  });

  test("getUserId({ email })", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    const id = await gc.getUserId({ email: ctx.email });
    assert.equal(id, ctx.userId);
  });

  test("getUserId() missing → UserNotFoundError", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    await assert.rejects(
      () => gc.getUserId({ email: `missing.${stamp}@gmail.com` }),
      UserNotFoundError,
    );
  });

  test("setUserCustomField() write + clear", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    const written = await gc.setUserCustomField({
      userId: ctx.userId,
      fieldName: ctx.userField,
      value: `utm-${stamp}`,
    });
    assert.equal(written.success, true);
    assert.equal(written.cleared, false);

    const cleared = await gc.setUserCustomField({
      userId: ctx.userId,
      fieldName: ctx.userField,
      clear: true,
    });
    assert.equal(cleared.cleared, true);
  });

  test("setUserCustomField() missing field → CustomFieldNotFoundError", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    await assert.rejects(
      () => gc.setUserCustomField({ userId: ctx.userId, fieldName: `__no_field_${stamp}`, value: "x" }),
      CustomFieldNotFoundError,
    );
  });

  test("addUserToGroup() + alreadyInGroup", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    await ensureGroup(ctx.groupName);
    const added = await gc.addUserToGroup({ userId: ctx.userId, groupName: ctx.groupName });
    assert.equal(added.success, true);
    assert.equal(added.alreadyInGroup, false);

    const again = await gc.addUserToGroup({ userId: ctx.userId, groupName: ctx.groupName });
    assert.equal(again.alreadyInGroup, true);
  });

  test("addUserToGroup() missing group → GroupNotFoundError", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    await assert.rejects(
      () => gc.addUserToGroup({ userId: ctx.userId, groupName: `__no_group_${stamp}` }),
      GroupNotFoundError,
    );
  });

  test("removeUserFromGroup() + already out", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    const removed = await gc.removeUserFromGroup({ userId: ctx.userId, groupName: ctx.groupName });
    assert.equal(removed.success, true);
    assert.equal(removed.removed, true);

    const again = await gc.removeUserFromGroup({ userId: ctx.userId, groupName: ctx.groupName });
    assert.equal(again.removed, false);
  });

  test("setDealCustomField() write + clear", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    ctx.dealId = await ensureDeal(ctx.userId);
    const written = await gc.setDealCustomField({
      dealId: ctx.dealId,
      fieldName: ctx.dealField,
      value: `deal-${stamp}`,
    });
    assert.equal(written.success, true);

    const cleared = await gc.setDealCustomField({
      dealId: ctx.dealId,
      fieldName: ctx.dealField,
      clear: true,
    });
    assert.equal(cleared.cleared, true);
  });

  test("addDealPayment()", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    assert.ok(ctx.dealId, "Нужен dealId из предыдущего теста");
    const result = await gc.addDealPayment({
      dealId: ctx.dealId,
      type: "Счет на оплату",
      amount: 1,
      currency: "RUB",
      status: "Получен",
      comment: `e2e ${stamp}`,
    });
    assert.equal(result.success, true);
    assert.equal(result.amount, "1");
  });

  test("uploadFile()", { timeout: TIMEOUT }, async (t) => {
    if (!requireLogin(t)) {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "gc-e2e-"));
    const filePath = join(dir, `e2e-${stamp}.png`);
    writeFileSync(
      filePath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const uploaded = await gc.uploadFile({ filePath });
    assert.equal(uploaded.success, true);
    assert.match(uploaded.url, /^https:\/\/fs\d*\.getcourse\.ru\/fileservice\/file\/download\//);
    assert.ok(uploaded.hash);
    assert.equal(uploaded.fileName, `e2e-${stamp}.png`);
  });
});
