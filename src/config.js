/**
 * @typedef {object} GetCourseConfig
 * @property {string} login
 * @property {string} password
 * @property {string} baseUrl
 */

/**
 * @param {Partial<GetCourseConfig>} input
 * @returns {GetCourseConfig}
 */
export function createConfig(input = {}) {
  const login = input.login?.trim() ?? "";
  const password = input.password ?? "";
  const baseUrl = (input.baseUrl ?? "").replace(/\/+$/, "");

  if (!login) {
    throw new Error("login не может быть пустым");
  }
  if (!password) {
    throw new Error("password не может быть пустым");
  }
  if (!baseUrl) {
    throw new Error("baseUrl не может быть пустым");
  }

  return { login, password, baseUrl };
}
