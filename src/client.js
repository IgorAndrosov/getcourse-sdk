import { chromium, errors } from "playwright";
import { createConfig } from "./config.js";
import {
  GetCourseError,
  LoginError,
  UserNotFoundError,
  UserExistsError,
  GroupNotFoundError,
  CustomFieldNotFoundError,
} from "./errors.js";
import {
  LOGIN_EMAIL_ANY,
  LOGIN_PASSWORD_ANY,
  LOGIN_PATH,
  TWO_FACTOR_PATH,
  USER_GUEST,
  USER_LOGINED,
  USER_GROUPS_PATH,
  GROUP_TREE,
  GROUP_ITEM,
  GROUP_HANDLE,
  GROUP_COUNT_LOADING,
  USER_INDEX_PATH,
  USER_CREATE_PATH,
  USER_CREATE_EMAIL,
  USER_CREATE_TYPE,
  USER_CREATE_FIRST_NAME,
  USER_CREATE_LAST_NAME,
  USER_CREATE_INVITE,
  USER_CREATE_GROUP_SELECT2,
  USER_CREATE_SUBMIT,
  SELECT2_DROP,
  USER_FILTER_EMAIL,
  USER_FILTER_PHONE,
  USER_RESULT_LINK,
  USER_GRID_EMPTY,
  USER_GRID_LOADING,
  USER_GROUP_SELECT,
  USER_GROUP_ITEM,
  USER_GROUP_SAVE,
  USER_FORM,
  USER_ADDITIONAL_FIELDS_HEADING,
  USER_ADDITIONAL_FIELDS_BODY,
  USER_SHOW_ALL_CUSTOM_FIELDS,
  USER_SAVE_BUTTON,
  userUpdatePath,
  userGroupsPartPath,
  DEAL_FORM,
  DEAL_ADDITIONAL_FIELDS,
  DEAL_ADDITIONAL_FIELDS_HEADING,
  DEAL_ADDITIONAL_FIELDS_BODY,
  DEAL_SHOW_ALL_CUSTOM_FIELDS,
  DEAL_SAVE_BUTTON,
  DEAL_ADD_PAYMENT_LINK,
  DEAL_ADD_PAYMENT_BLOCK,
  DEAL_PAYMENT_TYPE,
  DEAL_PAYMENT_AMOUNT,
  DEAL_PAYMENT_CURRENCY,
  DEAL_PAYMENT_STATUS,
  DEAL_PAYMENT_NOTIFY_USER,
  DEAL_PAYMENT_NOTIFY_ADMIN,
  DEAL_PAYMENT_COMMENT,
  DEAL_FORM_SAVE,
  dealUpdatePath,
} from "./selectors.js";

/**
 * @typedef {import('./config.js').GetCourseConfig} GetCourseConfig
 *
 * @typedef {object} ClientOptions
 * @property {string} [login]
 * @property {string} [password]
 * @property {string} [baseUrl]
 * @property {GetCourseConfig} [config]
 * @property {boolean} [headless]
 * @property {number} [timeoutMs]
 *
 * @typedef {object} LoginResult
 * @property {boolean} success
 * @property {string} message
 * @property {string} url
 * @property {boolean} twoFactorRequired
 */

export class GetCourseClient {
  /**
   * Браузер и сессия живут, пока клиент открыт, чтобы следующие
   * инструменты могли работать уже авторизованными.
   *
   * @param {ClientOptions} [options]
   */
  constructor(options = {}) {
    const { config, login, password, baseUrl, headless = true, timeoutMs = 30_000 } = options;
    this.config = config ?? createConfig({ login, password, baseUrl });
    this.headless = headless;
    this.timeoutMs = timeoutMs;
    this._browser = null;
    this._context = null;
    this._page = null;
    this._loggingIn = false;
  }

  get page() {
    if (!this._page) {
      throw new Error("Клиент не запущен. Вызовите start() перед использованием.");
    }
    return this._page;
  }

  async start() {
    if (this._browser) {
      return;
    }
    this._browser = await chromium.launch({ headless: this.headless });
    this._context = await this._browser.newContext();
    this._context.setDefaultTimeout(this.timeoutMs);
    this._page = await this._context.newPage();
  }

  async close() {
    if (this._page) {
      await this._page.close();
      this._page = null;
    }
    if (this._context) {
      await this._context.close();
      this._context = null;
    }
    if (this._browser) {
      await this._browser.close();
      this._browser = null;
    }
  }

  /**
   * Войти в школу по логину и паролю.
   * Если GetCourse перенаправляет на /pl/2fa, возвращается уведомление о 2FA.
   *
   * @returns {Promise<LoginResult>}
   */
  async login() {
    await this.ensureStarted();
    this._loggingIn = true;
    try {
      return await this._login();
    } finally {
      this._loggingIn = false;
    }
  }

  /**
   * Список названий групп пользователей.
   *
   * @returns {Promise<string[]>}
   */
  async getUserGroups() {
    return this.withAuth(async () => {
      await this.goto(USER_GROUPS_PATH);
      const tree = this.page.locator(GROUP_TREE);
      await tree.waitFor({ state: "visible" });
      await this.waitUntilGroupsLoaded();
      const names = await this.page.locator(GROUP_HANDLE).evaluateAll((handles) =>
        handles.map((el) =>
          [...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join(" "),
        ),
      );
      return names.filter(Boolean);
    });
  }

  /**
   * Найти id пользователя по email или телефону.
   *
   * @param {{ email?: string, phone?: string }} query
   * @returns {Promise<string>}
   */
  async getUserId(query = {}) {
    const email = query.email?.trim() ?? "";
    const phone = query.phone?.trim() ?? "";
    if (Boolean(email) === Boolean(phone)) {
      throw new Error("Передайте email или phone");
    }

    return this.withAuth(async () => {
      await this.goto(USER_INDEX_PATH);
      const page = this.page;
      const value = email || phone;
      const filter = page.locator(email ? USER_FILTER_EMAIL : USER_FILTER_PHONE).first();
      await filter.waitFor({ state: "visible" });

      const previousHref = await page
        .locator(USER_RESULT_LINK)
        .first()
        .getAttribute("href")
        .catch(() => null);

      await filter.fill(value);

      const filteredResponse = page.waitForResponse(
        (res) => {
          const url = decodeURIComponent(res.url());
          const post = decodeURIComponent(res.request().postData() ?? "");
          const haystack = `${url} ${post}`;
          return haystack.includes("/user/user") && (haystack.includes("uc[email]") || haystack.includes("uc[phone]"));
        },
        { timeout: this.timeoutMs },
      );

      await filter.press("Enter");
      await filteredResponse.catch(() => page.waitForLoadState("domcontentloaded"));

      const loading = page.locator(USER_GRID_LOADING).first();
      if (await loading.isVisible().catch(() => false)) {
        await loading.waitFor({ state: "hidden", timeout: this.timeoutMs });
      }

      await page.waitForFunction(
        ({ previousHref, linkSel, emptySel }) => {
          if (document.querySelector(emptySel)) {
            return true;
          }
          const link = document.querySelector(linkSel);
          if (!link) {
            return false;
          }
          const href = link.getAttribute("href") ?? "";
          const search = decodeURIComponent(location.search);
          const filtered = search.includes("uc[email]") || search.includes("uc[phone]");
          return filtered || (previousHref != null && href !== previousHref);
        },
        {
          previousHref,
          linkSel: USER_RESULT_LINK,
          emptySel: USER_GRID_EMPTY,
        },
        { timeout: this.timeoutMs },
      );

      const result = page.locator(USER_RESULT_LINK).first();
      const empty = page.locator(USER_GRID_EMPTY).first();
      if (await empty.isVisible().catch(() => false)) {
        throw new UserNotFoundError();
      }

      const href = (await result.getAttribute("href")) ?? "";
      const match = href.match(/\/id\/(\d+)/);
      if (!match) {
        throw new UserNotFoundError("Не удалось разобрать id пользователя из ссылки");
      }
      return match[1];
    });
  }

  /**
   * Создать пользователя: `/pl/user/user/create`.
   * `sendInvitationEmail` не передан — чекбокс не трогаем.
   * `groupName` не передан — группу не выбираем.
   *
   * @param {{
   *   email: string,
   *   type?: string,
   *   firstName?: string,
   *   lastName?: string,
   *   sendInvitationEmail?: boolean,
   *   groupName?: string,
   * }} params
   * @returns {Promise<{ success: boolean, userId: string, email: string, message: string }>}
   */
  async createUser({
    email,
    type,
    firstName,
    lastName,
    sendInvitationEmail,
    groupName,
  } = {}) {
    const mail = String(email ?? "").trim();
    if (!mail) {
      throw new Error("email не может быть пустым");
    }
    const userType = type?.trim() ?? "";
    const first = firstName?.trim() ?? "";
    const last = lastName?.trim() ?? "";
    const group = groupName?.trim() ?? "";

    return this.withAuth(async () => {
      await this.goto(USER_CREATE_PATH);
      const emailInput = this.page.locator(USER_CREATE_EMAIL).first();
      if (!(await emailInput.isVisible().catch(() => false))) {
        await this.goto("/user/control/user/create");
      }
      await emailInput.waitFor({ state: "visible" });
      await this.fillVisibleInput(emailInput, mail);

      if (userType) {
        const typeSelect = this.page.locator(USER_CREATE_TYPE).first();
        await typeSelect.waitFor({ state: "attached" });
        await this.fillCustomFieldControl(typeSelect, userType, "тип");
      }

      if (first) {
        await this.fillVisibleInput(this.page.locator(USER_CREATE_FIRST_NAME).first(), first);
      }
      if (last) {
        await this.fillVisibleInput(this.page.locator(USER_CREATE_LAST_NAME).first(), last);
      }

      if (sendInvitationEmail === true) {
        await this.page.locator(USER_CREATE_INVITE).first().check();
      } else if (sendInvitationEmail === false) {
        await this.page.locator(USER_CREATE_INVITE).first().uncheck();
      }

      if (group) {
        await this.selectCreateUserGroup(group);
      }

      const submit = this.page.locator(USER_CREATE_SUBMIT).filter({ hasText: "Создать" }).first();
      await submit.scrollIntoViewIfNeeded();
      await submit.click();

      if (await this.isLoginPage()) {
        throw new LoginError("Сессия истекла при создании пользователя");
      }

      const userId = await this.waitForCreatedUser(mail);
      return {
        success: true,
        userId,
        email: mail,
        message: `Пользователь создан`,
      };
    });
  }

  /**
   * Добавить пользователя в группу по id пользователя и названию группы.
   * Если пользователь уже в группе, сохранение не выполняется.
   *
   * @param {{ userId: string | number, groupName: string }} params
   * @returns {Promise<{ success: boolean, alreadyInGroup: boolean, message: string }>}
   */
  async addUserToGroup({ userId, groupName } = {}) {
    const id = String(userId ?? "").trim();
    const name = groupName?.trim() ?? "";
    if (!id) {
      throw new Error("userId не может быть пустым");
    }
    if (!name) {
      throw new Error("groupName не может быть пустым");
    }

    return this.withAuth(async () => {
      await this.openUserGroupForm(id);
      await this.showAllUserGroups();

      const found = await this.findUserGroupCheckbox(name);
      if (!found) {
        throw new GroupNotFoundError(`Группа не найдена: ${name}`);
      }

      const checkbox = this.page.locator(USER_GROUP_ITEM).nth(found.index).locator('input[type="checkbox"]').first();
      await checkbox.scrollIntoViewIfNeeded();
      const alreadyOn = found.checked || (await checkbox.isChecked());

      if (alreadyOn) {
        return {
          success: true,
          alreadyInGroup: true,
          message: `Пользователь уже состоит в группе «${name}»`,
        };
      }

      await checkbox.check();
      if (!(await checkbox.isChecked())) {
        throw new Error(`Не удалось отметить группу «${name}»: чекбокс не включился`);
      }

      await this.saveUserGroupsForm();

      return {
        success: true,
        alreadyInGroup: false,
        message: `Пользователь добавлен в группу «${name}»`,
      };
    });
  }

  /**
   * Удалить пользователя из группы. Ищет только среди уже выбранных, «Все группы» не нажимает.
   * Если группы нет в выбранных — пользователь в ней не состоял, Save не жмётся.
   *
   * @param {{ userId: string | number, groupName: string }} params
   * @returns {Promise<{ success: boolean, removed: boolean, message: string }>}
   */
  async removeUserFromGroup({ userId, groupName } = {}) {
    const id = String(userId ?? "").trim();
    const name = groupName?.trim() ?? "";
    if (!id) {
      throw new Error("userId не может быть пустым");
    }
    if (!name) {
      throw new Error("groupName не может быть пустым");
    }

    return this.withAuth(async () => {
      await this.openUserGroupForm(id);
      const page = this.page;
      const tree = page.locator(USER_GROUP_SELECT);
      await tree.waitFor({ state: "visible" });

      const found = await this.findUserGroupCheckbox(name);
      if (!found) {
        return {
          success: true,
          removed: false,
          message: `Пользователь не состоял в группе «${name}»`,
        };
      }

      const checkbox = page.locator(USER_GROUP_ITEM).nth(found.index).locator('input[type="checkbox"]').first();
      await checkbox.scrollIntoViewIfNeeded();
      const isOn = found.checked || (await checkbox.isChecked());

      if (!isOn) {
        return {
          success: true,
          removed: false,
          message: `Пользователь не состоял в группе «${name}»`,
        };
      }

      await checkbox.uncheck();
      if (await checkbox.isChecked()) {
        throw new Error(`Не удалось снять группу «${name}»: чекбокс остался включён`);
      }

      await this.saveUserGroupsForm();

      return {
        success: true,
        removed: true,
        message: `Пользователь удалён из группы «${name}»`,
      };
    });
  }

  /**
   * @param {string} userId
   */
  async openUserGroupForm(userId) {
    await this.goto(userGroupsPartPath(userId));
    const tree = this.page.locator(USER_GROUP_SELECT);
    if (!(await tree.isVisible().catch(() => false))) {
      await this.goto(`/pl${userGroupsPartPath(userId)}`);
    }
    await tree.waitFor({ state: "visible" });
  }

  async saveUserGroupsForm() {
    const save = this.page.locator(USER_GROUP_SAVE).first();
    await save.scrollIntoViewIfNeeded();
    await Promise.all([
      this.page.waitForLoadState("domcontentloaded"),
      save.click(),
    ]);
    if (await this.isLoginPage()) {
      throw new LoginError("Сессия истекла при сохранении групп пользователя");
    }
  }

  /**
   * Записать значение дополнительного поля в карточке пользователя.
   * Пустая строка или `clear: true` очищает поле.
   *
   * @param {{ userId: string | number, fieldName: string, value?: string | number | null, clear?: boolean }} params
   * @returns {Promise<{ success: boolean, cleared: boolean, fieldName: string, value: string, message: string }>}
   */
  async setUserCustomField({ userId, fieldName, value, clear = false } = {}) {
    const id = String(userId ?? "").trim();
    const name = fieldName?.trim() ?? "";
    if (!id) {
      throw new Error("userId не может быть пустым");
    }
    if (!name) {
      throw new Error("fieldName не может быть пустым");
    }
    if (!clear && value === undefined) {
      throw new Error("Передайте value или clear: true");
    }

    const nextValue = clear || value === null || value === undefined ? "" : String(value);

    return this.withAuth(async () => {
      await this.openUserUpdateForm(id);
      await this.expandAdditionalFields({
        heading: USER_ADDITIONAL_FIELDS_HEADING,
        body: USER_ADDITIONAL_FIELDS_BODY,
        showAll: USER_SHOW_ALL_CUSTOM_FIELDS,
        rootSelector: "#userFormAdditionalFields",
      });
      await this.fillAdditionalField("#userFormAdditionalFields", name, nextValue);
      await this.clickHeaderSave(USER_SAVE_BUTTON, "поля пользователя");

      const cleared = nextValue === "";
      return {
        success: true,
        cleared,
        fieldName: name,
        value: nextValue,
        message: cleared ? `Поле «${name}» очищено` : `Поле «${name}» обновлено`,
      };
    });
  }

  /**
   * Записать значение дополнительного поля в карточке заказа.
   * Пустая строка или `clear: true` очищает поле.
   *
   * @param {{ dealId: string | number, fieldName: string, value?: string | number | null, clear?: boolean }} params
   * @returns {Promise<{ success: boolean, cleared: boolean, fieldName: string, value: string, message: string }>}
   */
  async setDealCustomField({ dealId, fieldName, value, clear = false } = {}) {
    const id = String(dealId ?? "").trim();
    const name = fieldName?.trim() ?? "";
    if (!id) {
      throw new Error("dealId не может быть пустым");
    }
    if (!name) {
      throw new Error("fieldName не может быть пустым");
    }
    if (!clear && value === undefined) {
      throw new Error("Передайте value или clear: true");
    }

    const nextValue = clear || value === null || value === undefined ? "" : String(value);

    return this.withAuth(async () => {
      await this.openDealUpdateForm(id);
      await this.expandAdditionalFields({
        heading: DEAL_ADDITIONAL_FIELDS_HEADING,
        body: DEAL_ADDITIONAL_FIELDS_BODY,
        showAll: DEAL_SHOW_ALL_CUSTOM_FIELDS,
        rootSelector: DEAL_ADDITIONAL_FIELDS,
      });
      await this.fillAdditionalField(DEAL_ADDITIONAL_FIELDS, name, nextValue);
      await this.clickHeaderSave(DEAL_SAVE_BUTTON, "поля заказа");

      const cleared = nextValue === "";
      return {
        success: true,
        cleared,
        fieldName: name,
        value: nextValue,
        message: cleared ? `Поле заказа «${name}» очищено` : `Поле заказа «${name}» обновлено`,
      };
    });
  }

  /**
   * Добавить платеж в карточку заказа.
   * Уведомления пользователю и админу по умолчанию выключены.
   * Статус по умолчанию «Получен». Валюта и комментарий — если переданы.
   *
   * @param {{
   *   dealId: string | number,
   *   type: string,
   *   amount: string | number,
   *   currency?: string,
   *   status?: string,
   *   notifyUser?: boolean,
   *   notifyAdmin?: boolean,
   *   comment?: string,
   * }} params
   * @returns {Promise<{
   *   success: boolean,
   *   dealId: string,
   *   type: string,
   *   amount: string,
   *   currency: string | null,
   *   status: string,
   *   notifyUser: boolean,
   *   notifyAdmin: boolean,
   *   comment: string,
   *   message: string,
   * }>}
   */
  async addDealPayment({
    dealId,
    type,
    amount,
    currency,
    status = "Получен",
    notifyUser = false,
    notifyAdmin = false,
    comment,
  } = {}) {
    const id = String(dealId ?? "").trim();
    const paymentType = String(type ?? "").trim();
    const paymentAmount = amount === undefined || amount === null ? "" : String(amount).trim();
    const paymentCurrency = currency?.trim() ?? "";
    const paymentStatus = String(status ?? "").trim() || "Получен";
    const paymentComment = comment?.trim() ?? "";

    if (!id) {
      throw new Error("dealId не может быть пустым");
    }
    if (!paymentType) {
      throw new Error("type не может быть пустым");
    }
    if (!paymentAmount) {
      throw new Error("amount не может быть пустым");
    }

    return this.withAuth(async () => {
      await this.openDealUpdateForm(id);
      const page = this.page;
      const block = page.locator(DEAL_ADD_PAYMENT_BLOCK).first();
      if (!(await block.isVisible().catch(() => false))) {
        const link = page.locator(DEAL_ADD_PAYMENT_LINK).first();
        await link.waitFor({ state: "visible" });
        await link.click();
      }
      await block.waitFor({ state: "visible" });

      const typeSelect = page.locator(DEAL_PAYMENT_TYPE).first();
      await typeSelect.waitFor({ state: "visible" });
      await this.fillCustomFieldControl(typeSelect, paymentType, "тип платежа");
      await page.locator(DEAL_PAYMENT_AMOUNT).first().waitFor({ state: "visible" });
      await page.locator(DEAL_PAYMENT_NOTIFY_USER).first().waitFor({ state: "attached" }).catch(() => {});

      await this.fillVisibleInput(page.locator(DEAL_PAYMENT_AMOUNT).first(), paymentAmount);

      if (paymentCurrency) {
        await this.fillCustomFieldControl(
          page.locator(DEAL_PAYMENT_CURRENCY).first(),
          paymentCurrency,
          "валюта",
        );
      }

      await this.fillCustomFieldControl(
        page.locator(DEAL_PAYMENT_STATUS).first(),
        paymentStatus,
        "статус платежа",
      );

      const notifyUserBox = page.locator(DEAL_PAYMENT_NOTIFY_USER).first();
      const notifyAdminBox = page.locator(DEAL_PAYMENT_NOTIFY_ADMIN).first();
      if (await notifyUserBox.count()) {
        if (notifyUser) {
          await notifyUserBox.check({ force: true });
        } else {
          await notifyUserBox.uncheck({ force: true });
        }
      }
      if (await notifyAdminBox.count()) {
        if (notifyAdmin) {
          await notifyAdminBox.check({ force: true });
        } else {
          await notifyAdminBox.uncheck({ force: true });
        }
      }

      if (paymentComment) {
        await this.fillVisibleInput(page.locator(DEAL_PAYMENT_COMMENT).first(), paymentComment);
      }

      const formSave = page.locator(DEAL_FORM_SAVE).filter({ hasText: "Сохранить" }).first();
      if (await formSave.isVisible().catch(() => false)) {
        await this.clickHeaderSave(DEAL_FORM_SAVE, "платежа заказа");
      } else {
        await this.clickHeaderSave(DEAL_SAVE_BUTTON, "платежа заказа");
      }

      return {
        success: true,
        dealId: id,
        type: paymentType,
        amount: paymentAmount,
        currency: paymentCurrency || null,
        status: paymentStatus,
        notifyUser: Boolean(notifyUser),
        notifyAdmin: Boolean(notifyAdmin),
        comment: paymentComment,
        message: "Платеж добавлен",
      };
    });
  }

  /**
   * @param {string} groupName
   */
  async selectCreateUserGroup(groupName) {
    const page = this.page;
    const container = page.locator(USER_CREATE_GROUP_SELECT2).first();
    await container.waitFor({ state: "visible" });
    const search = container.locator("input.select2-input").first();
    await search.click();

    const drop = page.locator(SELECT2_DROP).first();
    await drop.waitFor({ state: "visible" });
    await search.fill("");
    await search.pressSequentially(groupName, { delay: 15 });

    const found = await page
      .waitForFunction((target) => {
        const root = document.querySelector("#select2-drop");
        if (!root) {
          return false;
        }
        const style = window.getComputedStyle(root);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        if (root.querySelector(".select2-no-results")) {
          return "none";
        }
        const normalize = (text) => text.replace(/\s+/g, " ").trim();
        const label = [...root.querySelectorAll(".select2-result-label")].find(
          (el) => normalize(el.textContent) === target,
        );
        if (!label) {
          return false;
        }
        label.setAttribute("data-gc-group-option", "1");
        return "ok";
      }, groupName, { timeout: this.timeoutMs })
      .then((handle) => handle.jsonValue())
      .catch(() => null);

    if (found !== "ok") {
      throw new GroupNotFoundError(`Группа не найдена: ${groupName}`);
    }
    await page.locator("[data-gc-group-option='1']").first().click();
  }

  /**
   * @param {string} email
   * @returns {Promise<string>}
   */
  async waitForCreatedUser(email) {
    const page = this.page;
    await page
      .waitForFunction(() => {
        const href = location.href;
        if (/\/id\/\d+/.test(href) || /[?&]id=\d+/.test(href)) {
          return true;
        }
        const err = document.querySelector(".form-group.has-error .help-block, .alert-danger");
        return Boolean(err && err.textContent.replace(/\s+/g, " ").trim());
      }, { timeout: this.timeoutMs })
      .catch(() => {});

    const userId = parseUserIdFromUrl(page.url());
    if (userId) {
      return userId;
    }

    const errorText = await page.evaluate(() => {
      const blocks = [
        ...document.querySelectorAll(".form-group.has-error .help-block"),
        ...document.querySelectorAll(".alert-danger"),
      ];
      return blocks
        .map((el) => el.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("; ");
    });

    if (errorText) {
      if (/уже существ|already exist/i.test(errorText)) {
        throw new UserExistsError(errorText);
      }
      throw new GetCourseError(errorText);
    }

    throw new GetCourseError(`Не удалось создать пользователя ${email}`);
  }

  /**
   * @param {string} userId
   */
  async openUserUpdateForm(userId) {
    const path = userUpdatePath(userId);
    await this.goto(path);
    const form = this.page.locator(USER_FORM);
    if (!(await form.isVisible().catch(() => false))) {
      await this.goto(`/pl${path}`);
    }
    await form.waitFor({ state: "visible" });
  }

  /**
   * @param {string} dealId
   */
  async openDealUpdateForm(dealId) {
    const path = dealUpdatePath(dealId);
    await this.goto(path);
    const form = this.page.locator(DEAL_FORM);
    if (!(await form.isVisible().catch(() => false))) {
      await this.goto(`/pl${path}`);
    }
    await form.waitFor({ state: "visible" });
  }

  /**
   * @param {{ heading: string, body: string, showAll: string, rootSelector: string }} params
   */
  async expandAdditionalFields({ heading, body, showAll, rootSelector }) {
    const page = this.page;
    const headingEl = page.locator(heading).first();
    const bodyEl = page.locator(body).first();
    if (await headingEl.count()) {
      await headingEl.waitFor({ state: "visible" });
      if (!(await bodyEl.isVisible().catch(() => false))) {
        await headingEl.click();
      }
    }
    await bodyEl.waitFor({ state: "visible" });

    const showAllEl = page.locator(showAll).filter({ visible: true }).first();
    if (await showAllEl.count()) {
      const text = (await showAllEl.innerText()).replace(/\s+/g, " ").trim();
      if (text === "Показать все поля") {
        await showAllEl.click();
        await page
          .waitForFunction((root) => {
            const link = document.querySelector(`${root} a.showAllCustomFields`);
            return Boolean(link && link.textContent.replace(/\s+/g, " ").trim() !== "Показать все поля");
          }, rootSelector, { timeout: this.timeoutMs })
          .catch(() => {});
      }
    }
  }

  /**
   * @param {string} rootSelector
   * @param {string} fieldName
   * @param {string} value
   */
  async fillAdditionalField(rootSelector, fieldName, value) {
    const page = this.page;
    const marked = await page.evaluate(({ root, targetName }) => {
      for (const el of document.querySelectorAll("[data-gc-custom-field]")) {
        el.removeAttribute("data-gc-custom-field");
      }
      const rootEl = document.querySelector(root);
      if (!rootEl) {
        return false;
      }
      const labels = [...rootEl.querySelectorAll("span.label-value")];
      const label = labels.find((el) => el.textContent.replace(/\s+/g, " ").trim() === targetName);
      if (!label) {
        return false;
      }
      const wrapper =
        label.closest(".field-wrapper") || label.closest(".custom-field") || label.closest(".field");
      if (!wrapper) {
        return false;
      }
      wrapper.setAttribute("data-gc-custom-field", "1");
      return true;
    }, { root: rootSelector, targetName: fieldName });

    if (!marked) {
      throw new CustomFieldNotFoundError(`Дополнительное поле не найдено: ${fieldName}`);
    }

    const wrapper = page.locator('[data-gc-custom-field="1"]').first();
    await wrapper.scrollIntoViewIfNeeded();
    const kind = await wrapper.evaluate((root) => {
      const block = root.querySelector(".field-input-block") || root;
      if (block.querySelector("input[type=radio]")) {
        return "radio";
      }
      if (block.querySelector("input[type=checkbox]")) {
        return "checkbox";
      }
      if (block.querySelector("select")) {
        return "select";
      }
      if (root.querySelector(".type-multi_select") || root.classList.contains("type-multi_select")) {
        return "checkbox";
      }
      if (
        (root.querySelector(".type-select") || root.classList.contains("type-select"))
        && block.querySelector("label")
      ) {
        return "radio";
      }
      if (block.querySelector("textarea, input")) {
        return "text";
      }
      return "unknown";
    });

    if (kind === "radio" || kind === "checkbox") {
      await this.fillChoiceField(wrapper, fieldName, value, kind);
      return;
    }

    const control = wrapper
      .locator(".field-input-block input, .field-input-block textarea, .field-input-block select, input.form-control, textarea, select")
      .first();
    await control.waitFor({ state: "attached" });
    await this.fillCustomFieldControl(control, value, fieldName);
  }

  /**
   * @param {string} selector
   * @param {string} what
   */
  async clickHeaderSave(selector, what) {
    const save = this.page.locator(selector).filter({ hasText: "Сохранить" }).first();
    await save.scrollIntoViewIfNeeded();
    await Promise.all([
      this.page.waitForLoadState("domcontentloaded"),
      save.click(),
    ]);
    if (await this.isLoginPage()) {
      throw new LoginError(`Сессия истекла при сохранении ${what}`);
    }
  }

  /**
   * Radio (`type-select` кнопками) или checkbox (`type-multi_select`).
   * Для checkbox пока только одно значение: галку ставим, остальные не трогаем.
   *
   * @param {import('playwright').Locator} wrapper
   * @param {string} fieldName
   * @param {string} value
   * @param {"radio" | "checkbox"} inputType
   */
  async fillChoiceField(wrapper, fieldName, value, inputType) {
    await wrapper.locator(".field-input-block").first().waitFor({ state: "attached" }).catch(() => {});

    if (value === "") {
      await wrapper.evaluate((root, type) => {
        for (const input of root.querySelectorAll(`.field-input-block input[type="${type}"]`)) {
          if (!input.checked) {
            continue;
          }
          input.checked = false;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, inputType);
      return;
    }

    const marked = await wrapper.evaluate((root, { target, type }) => {
      for (const el of root.querySelectorAll("[data-gc-choice]")) {
        el.removeAttribute("data-gc-choice");
      }
      const normalize = (text) => text.replace(/\s+/g, " ").trim();
      const optionText = (label) => {
        const clone = label.cloneNode(true);
        clone.querySelectorAll("input").forEach((node) => node.remove());
        return normalize(clone.textContent);
      };
      const inputForLabel = (label) => {
        const inside = label.querySelector(`input[type="${type}"]`);
        if (inside) {
          return inside;
        }
        if (label.htmlFor) {
          const byId = document.getElementById(label.htmlFor);
          if (byId && byId.matches(`input[type="${type}"]`)) {
            return byId;
          }
        }
        const prev = label.previousElementSibling;
        if (prev && prev.matches(`input[type="${type}"]`)) {
          return prev;
        }
        return null;
      };

      const block = root.querySelector(".field-input-block") || root;
      const labels = [...block.querySelectorAll("label")];
      const label = labels.find((el) => optionText(el) === target);
      if (label) {
        const input = inputForLabel(label);
        if (input) {
          input.setAttribute("data-gc-choice", "1");
          return true;
        }
        label.setAttribute("data-gc-choice", "label");
        return true;
      }

      const byValue = [...block.querySelectorAll(`input[type="${type}"]`)].find(
        (input) => input.value === target,
      );
      if (byValue) {
        byValue.setAttribute("data-gc-choice", "1");
        return true;
      }
      return false;
    }, { target: value, type: inputType });

    if (!marked) {
      throw new CustomFieldNotFoundError(`В поле «${fieldName}» нет значения «${value}»`);
    }

    const input = wrapper.locator('[data-gc-choice="1"]').first();
    if (await input.count()) {
      await input.scrollIntoViewIfNeeded();
      await input.check({ force: true });
      if (!(await input.isChecked())) {
        await input.evaluate((el) => {
          el.checked = true;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      return;
    }

    const label = wrapper.locator('[data-gc-choice="label"]').first();
    await label.scrollIntoViewIfNeeded();
    await label.click();
  }

  /**
   * @param {import('playwright').Locator} control
   * @param {string} value
   * @param {string} fieldName
   */
  async fillCustomFieldControl(control, value, fieldName) {
    const tag = await control.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") {
      if (value === "") {
        await control.selectOption({ index: 0 }).catch(async () => {
          await control.selectOption("");
        });
        return;
      }
      const optionIndex = await control.evaluate((el, target) => {
        const options = [...el.options];
        const byLabel = options.findIndex(
          (opt) => opt.textContent.replace(/\s+/g, " ").trim() === target,
        );
        if (byLabel >= 0) {
          return byLabel;
        }
        return options.findIndex((opt) => opt.value === target);
      }, value);
      if (optionIndex < 0) {
        throw new CustomFieldNotFoundError(`В поле «${fieldName}» нет значения «${value}»`);
      }
      await control.selectOption({ index: optionIndex });
      return;
    }

    await control.scrollIntoViewIfNeeded();
    if (value === "") {
      await control.click();
      await control.fill("");
      return;
    }
    await this.fillVisibleInput(control, value);
  }

  /**
   * @param {string} groupName
   * @returns {Promise<{ index: number, checked: boolean } | null>}
   */
  async findUserGroupCheckbox(groupName) {
    return this.page.evaluate((name) => {
      const root = document.querySelector("ul.group-tree-select");
      if (!root) {
        return null;
      }

      const items = [...root.querySelectorAll("li.group-tree-li")];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const checkbox =
          item.querySelector(":scope > input[type=checkbox]") ||
          item.querySelector(":scope > label input[type=checkbox]");
        if (!checkbox) {
          continue;
        }

        const clone = item.cloneNode(true);
        clone.querySelectorAll("ul").forEach((nested) => nested.remove());
        const label = clone.textContent.replace(/\s+/g, " ").trim();
        if (label === name) {
          const checked =
            Boolean(checkbox.checked) ||
            checkbox.hasAttribute("checked") ||
            checkbox.getAttribute("aria-checked") === "true" ||
            item.classList.contains("selected") ||
            item.classList.contains("checked");
          return { index, checked };
        }
      }

      return null;
    }, groupName);
  }

  /**
   * Включает режим «Все группы». «Развернуть все» нажимается только если ссылка видима.
   */
  async showAllUserGroups() {
    const page = this.page;
    const tree = page.locator(USER_GROUP_SELECT);
    const showAll = tree.locator("a.all-link").filter({ visible: true }).first();
    await showAll.waitFor({ state: "visible" });
    await showAll.click();

    const switched = await this.waitUntilAllGroupsShown(5_000);
    if (!switched) {
      await showAll.evaluate((el) => el.click());
      await this.waitUntilAllGroupsShown(this.timeoutMs);
    }

    const expandAll = tree.locator("a.folder-expand").filter({ visible: true });
    if ((await expandAll.count()) > 0) {
      await expandAll.first().click();
    }
  }

  /**
   * @param {number} timeout
   * @returns {Promise<boolean>}
   */
  async waitUntilAllGroupsShown(timeout) {
    return this.page
      .waitForFunction(() => {
        const tree = document.querySelector("ul.group-tree-select");
        return Boolean(tree && !tree.classList.contains("only-selected"));
      }, { timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Прокручивает дерево групп, пока подгружаются новые элементы
   * и пока у счётчиков остаётся «Загрузка...».
   */
  async waitUntilGroupsLoaded() {
    const page = this.page;
    const deadline = Date.now() + Math.max(this.timeoutMs * 3, 90_000);
    const skipIds = new Set();

    while (Date.now() < deadline) {
      const snapshot = await page.evaluate(
        ({ itemSel, loadingSel, skip }) => {
          const items = document.querySelectorAll(itemSel).length;
          const loading = [...document.querySelectorAll(loadingSel)].filter(
            (el) => !skip.includes(el.getAttribute("data-group-id") ?? ""),
          );
          return {
            items,
            remaining: loading.length,
            nextId: loading[0]?.getAttribute("data-group-id") ?? "",
          };
        },
        { itemSel: GROUP_ITEM, loadingSel: GROUP_COUNT_LOADING, skip: [...skipIds] },
      );

      if (snapshot.remaining === 0) {
        if (snapshot.items > 0) {
          await page.locator(GROUP_ITEM).last().scrollIntoViewIfNeeded();
        }
        const grew = await page
          .waitForFunction(
            ({ itemSel, loadingSel, itemsNow, skip }) => {
              const nextItems = document.querySelectorAll(itemSel).length;
              const nextLoading = [...document.querySelectorAll(loadingSel)].filter(
                (el) => !skip.includes(el.getAttribute("data-group-id") ?? ""),
              ).length;
              return nextItems > itemsNow || nextLoading > 0;
            },
            {
              itemSel: GROUP_ITEM,
              loadingSel: GROUP_COUNT_LOADING,
              itemsNow: snapshot.items,
              skip: [...skipIds],
            },
            { timeout: 800 },
          )
          .then(() => true)
          .catch(() => false);

        if (!grew) {
          break;
        }
        continue;
      }

      const target = snapshot.nextId
        ? page.locator(`${GROUP_COUNT_LOADING}[data-group-id="${snapshot.nextId}"]`).first()
        : page.locator(GROUP_COUNT_LOADING).first();

      await target.scrollIntoViewIfNeeded();

      const resolved = await page
        .waitForFunction(
          ({ id, loadingSel }) => {
            const el = id
              ? document.querySelector(`${loadingSel}[data-group-id="${id}"]`)
              : document.querySelector(loadingSel);
            return !el;
          },
          { id: snapshot.nextId, loadingSel: GROUP_COUNT_LOADING },
          { timeout: 5_000 },
        )
        .then(() => true)
        .catch(() => false);

      if (!resolved && snapshot.nextId) {
        skipIds.add(snapshot.nextId);
      }
    }
  }

  /**
   * @param {string} path
   */
  resolveUrl(path) {
    if (/^https?:\/\//.test(path)) {
      return path;
    }
    return `${this.config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async ensureStarted() {
    if (!this._page) {
      await this.start();
    }
  }

  /**
   * @returns {Promise<boolean>}
   */
  async isLoginPage() {
    if (!this._page) {
      return false;
    }

    const url = this.page.url();
    if (url.includes(LOGIN_PATH) || /[?&]required=true\b/.test(url)) {
      return true;
    }

    const passwordVisible = await this.page.locator(LOGIN_PASSWORD_ANY).filter({ visible: true }).count();
    const emailVisible = await this.page.locator(LOGIN_EMAIL_ANY).filter({ visible: true }).count();
    if (passwordVisible && emailVisible) {
      return true;
    }

    if (await this.page.locator(USER_GUEST).count()) {
      return true;
    }

    return false;
  }

  async waitForAuthState() {
    const page = this.page;
    await Promise.race([
      page.locator(USER_LOGINED).first().waitFor({ state: "attached", timeout: this.timeoutMs }),
      page.locator(USER_GUEST).first().waitFor({ state: "attached", timeout: this.timeoutMs }),
      page.locator(LOGIN_PASSWORD_ANY).filter({ visible: true }).first().waitFor({ state: "visible", timeout: this.timeoutMs }),
    ]).catch(() => {});
  }

  /**
   * Переход по пути школы. Если открылась страница логина — выполняет вход и повторяет переход.
   *
   * @param {string} path
   */
  async goto(path) {
    await this.ensureStarted();
    const url = this.resolveUrl(path);
    await this.openAndLogin(url);

    if (!(await this.isOnUrl(url))) {
      await this.openAndLogin(url);
    }

    if (await this.isLoginPage()) {
      throw new LoginError("Не удалось авторизоваться для выполнения действия");
    }
  }

  /**
   * @param {string} url
   */
  async openAndLogin(url) {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.waitForAuthState();
    await this.ensureLoggedIn();
    await this.waitForAuthState();
  }

  /**
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async isOnUrl(url) {
    const current = this.page.url().split("#")[0];
    const target = url.split("#")[0];
    if (current.startsWith(target) || target.startsWith(current)) {
      return true;
    }

    const currentPath = new URL(current).pathname.replace(/\/pl\//, "/");
    const targetPath = new URL(target).pathname.replace(/\/pl\//, "/");
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`) || targetPath.startsWith(`${currentPath}/`);
  }

  /**
   * Любой метод страницы должен идти через withAuth: при форме логина SDK сам перезайдёт.
   *
   * @template T
   * @param {() => Promise<T>} action
   * @returns {Promise<T>}
   */
  async withAuth(action) {
    await this.ensureStarted();
    await this.ensureLoggedIn();

    let result = await action();
    if (await this.isLoginPage()) {
      await this.ensureLoggedIn();
      result = await action();
    }
    return result;
  }

  async ensureLoggedIn() {
    if (this._loggingIn || !(await this.isLoginPage())) {
      return;
    }

    const result = await this.login();
    if (result.twoFactorRequired) {
      throw new LoginError(result.message);
    }
    if (!result.success) {
      throw new LoginError(result.message);
    }
  }

  /**
   * @returns {Promise<LoginResult>}
   */
  async _login() {
    const page = this.page;
    const loginUrl = `${this.config.baseUrl}${LOGIN_PATH}`;
    if (!page.url().includes(LOGIN_PATH)) {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    }
    await this.waitForAuthState();

    const fields = await this.markLoginControls();
    await this.fillVisibleInput(fields.email, this.config.login);
    await this.fillVisibleInput(fields.password, this.config.password);
    if ((await fields.email.inputValue()) !== this.config.login) {
      await this.fillVisibleInput(fields.email, this.config.login);
    }
    await fields.submit.click();

    try {
      await Promise.race([
        page.waitForURL((url) => !String(url).includes(LOGIN_PATH), { timeout: this.timeoutMs }),
        page.locator(USER_LOGINED).first().waitFor({ state: "attached", timeout: this.timeoutMs }),
        page.waitForURL((url) => String(url).includes(TWO_FACTOR_PATH), { timeout: this.timeoutMs }),
      ]);
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        throw new LoginError("Не удалось войти: страница логина не сменилась");
      }
      throw error;
    }

    const currentUrl = page.url();
    if (currentUrl.includes(TWO_FACTOR_PATH)) {
      return {
        success: false,
        twoFactorRequired: true,
        message: "Требуется двухфакторная аутентификация (2FA)",
        url: currentUrl,
      };
    }

    return {
      success: true,
      twoFactorRequired: false,
      message: "Вход выполнен",
      url: currentUrl,
    };
  }

  /**
   * Берёт email/пароль/«Войти» из ближайшего видимого блока вокруг поля пароля,
   * чтобы не заполнить email на соседней форме регистрации.
   */
  async markLoginControls() {
    const marked = await this.page.evaluate(() => {
      for (const el of document.querySelectorAll("[data-gc-login-email], [data-gc-login-password], [data-gc-login-submit]")) {
        el.removeAttribute("data-gc-login-email");
        el.removeAttribute("data-gc-login-password");
        el.removeAttribute("data-gc-login-submit");
      }

      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none";
      };

      const passwords = [...document.querySelectorAll('input[name="password"], input[type="password"]')].filter(isVisible);
      for (const password of passwords) {
        let node = password.parentElement;
        while (node) {
          const emails = [...node.querySelectorAll('input[name="email"], input.form-field-email')].filter(isVisible);
          const submit = [...node.querySelectorAll("button, input[type=submit]")].find((el) => {
            const text = (el.innerText || el.value || "").replace(/\s+/g, " ").trim();
            return text === "Войти" && isVisible(el);
          });
          if (emails.length && submit) {
            const passwordTop = password.getBoundingClientRect().top;
            const email = emails.sort(
              (left, right) =>
                Math.abs(left.getBoundingClientRect().top - passwordTop) -
                Math.abs(right.getBoundingClientRect().top - passwordTop),
            )[0];
            email.setAttribute("data-gc-login-email", "1");
            password.setAttribute("data-gc-login-password", "1");
            submit.setAttribute("data-gc-login-submit", "1");
            return true;
          }
          node = node.parentElement;
        }
      }
      return false;
    });

    if (!marked) {
      throw new LoginError("Не найдена видимая форма входа");
    }

    return {
      email: this.page.locator("[data-gc-login-email]").first(),
      password: this.page.locator("[data-gc-login-password]").first(),
      submit: this.page.locator("[data-gc-login-submit]").first(),
    };
  }

  /**
   * @param {import('playwright').Locator} locator
   * @param {string} value
   */
  async fillVisibleInput(locator, value) {
    await locator.waitFor({ state: "visible" });
    await locator.click();
    await locator.fill("");
    await locator.pressSequentially(value, { delay: 15 });
    if ((await locator.inputValue()) === value) {
      return;
    }
    await locator.fill(value);
  }
}

/**
 * @param {string} url
 * @returns {string | null}
 */
function parseUserIdFromUrl(url) {
  const pathMatch = String(url).match(/\/id\/(\d+)/);
  if (pathMatch) {
    return pathMatch[1];
  }
  const queryMatch = String(url).match(/[?&]id=(\d+)/);
  return queryMatch ? queryMatch[1] : null;
}

/**
 * @template T
 * @param {ClientOptions} options
 * @param {(client: GetCourseClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClient(options, fn) {
  const client = new GetCourseClient(options);
  await client.start();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}
