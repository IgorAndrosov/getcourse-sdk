export const LOGIN_FORM = "form:has(button.xdget-button.btn-success)";
export const LOGIN_EMAIL_INPUT = `${LOGIN_FORM} input[name="email"]`;
export const LOGIN_PASSWORD_INPUT = `${LOGIN_FORM} input[name="password"]`;
export const LOGIN_SUBMIT_BUTTON = `${LOGIN_FORM} button.xdget-button.btn-success`;
export const LOGIN_EMAIL_ANY = 'input[name="email"]';
export const LOGIN_PASSWORD_ANY = 'input[name="password"]';

export const LOGIN_PATH = "/cms/system/login";
export const TWO_FACTOR_PATH = "/pl/2fa";

export const USER_GUEST = "body.gc-user-guest";
export const USER_LOGINED = "body.gc-user-logined";

export const USER_GROUPS_PATH = "/pl/user/group/index";
export const GROUP_TREE = "ol.group-tree";
export const GROUP_ITEM = "ol.group-tree li.dd-item";
export const GROUP_HANDLE = "ol.group-tree li.dd-item > div.dd-handle";
export const GROUP_COUNT_LOADING = "ol.group-tree span.users-count.loading";

export const USER_INDEX_PATH = "/pl/user/user/index";
export const USER_CREATE_PATH = "/pl/user/user/create";
export const USER_CREATE_FORM = 'form:has(input[name="CreateUserForm[email]"])';
export const USER_CREATE_EMAIL = 'input[name="CreateUserForm[email]"]';
export const USER_CREATE_TYPE = 'select[name="CreateUserForm[type]"]';
export const USER_CREATE_FIRST_NAME = 'input[name="CreateUserForm[first_name]"]';
export const USER_CREATE_LAST_NAME = 'input[name="CreateUserForm[last_name]"]';
export const USER_CREATE_INVITE = 'input[type="checkbox"][name="CreateUserForm[send_invitation_email]"]';
export const USER_CREATE_GROUP_SELECT2 = 'div[id^="s2id_groupTree"], .select2-container.select2-container-multi';
export const USER_CREATE_SUBMIT = `${USER_CREATE_FORM} button[type="submit"]`;
export const SELECT2_DROP = "#select2-drop";
export const USER_FILTER_EMAIL = 'input[name="uc[email]"]';
export const USER_FILTER_PHONE = 'input[name="uc[phone]"]';
export const USER_RESULT_LINK = 'table.kv-grid-table tbody tr a[href*="/update/id/"]';
export const USER_GRID_EMPTY = "table.kv-grid-table tbody td.empty";
export const USER_GRID_LOADING = "#users .kv-grid-loading, .grid-view.kv-grid-loading";

export const USER_FORM = "form#userForm";
export const USER_GROUP_SELECT = "ul.group-tree-select";
export const USER_GROUP_SHOW_ALL = "ul.group-tree-select a.all-link";
export const USER_GROUP_EXPAND_ALL = "ul.group-tree-select a.folder-expand";
export const USER_GROUP_ITEM = "ul.group-tree-select li.group-tree-li";
export const USER_GROUP_SAVE = 'form#userForm input[name="save"]';

export const USER_ADDITIONAL_FIELDS = "#userFormAdditionalFields";
export const USER_ADDITIONAL_FIELDS_HEADING = "#userFormAdditionalFields > .panel-heading";
export const USER_ADDITIONAL_FIELDS_BODY = "#userFormAdditionalFields > .panel-body";
export const USER_SHOW_ALL_CUSTOM_FIELDS = "#userFormAdditionalFields a.showAllCustomFields";
export const USER_SAVE_BUTTON = '.page-header button.btn-action[data-action="save"]';

export function userUpdatePath(userId) {
  return `/user/control/user/update/id/${userId}`;
}

export function userGroupsPartPath(userId) {
  return `/user/control/user/update/id/${userId}/part/groups`;
}

export const DEAL_FORM = "form#dealForm";
export const DEAL_ADDITIONAL_FIELDS = "#dealAdditionalFields";
export const DEAL_ADDITIONAL_FIELDS_HEADING = "#dealAdditionalFields > .panel-heading";
export const DEAL_ADDITIONAL_FIELDS_BODY = "#dealAdditionalFields > .panel-body";
export const DEAL_SHOW_ALL_CUSTOM_FIELDS = "#dealAdditionalFields a.showAllCustomFields";
export const DEAL_SAVE_BUTTON = '.page-header button.btn-primary.action-link';
export const DEAL_ADD_PAYMENT_LINK = "a.add-payment-link";
export const DEAL_ADD_PAYMENT_BLOCK = ".add-payment-block";
export const DEAL_PAYMENT_TYPE = 'select[name="Payment[type]"]';
export const DEAL_PAYMENT_AMOUNT = 'input[name="Payment[amount]"]';
export const DEAL_PAYMENT_CURRENCY = 'select[name="Payment[currency]"]';
export const DEAL_PAYMENT_STATUS = 'select[name="Payment[status]"]';
export const DEAL_PAYMENT_NOTIFY_USER = 'input[type="checkbox"][name="PaymentParamsObject[notify_user]"]';
export const DEAL_PAYMENT_NOTIFY_ADMIN = 'input[type="checkbox"][name="PaymentParamsObject[notify_admin]"]';
export const DEAL_PAYMENT_COMMENT = 'textarea[name="Payment[comment]"]';
export const DEAL_FORM_SAVE = `${DEAL_FORM} button.btn-primary[name="save"]`;

export function dealUpdatePath(dealId) {
  return `/sales/control/deal/update/id/${dealId}`;
}
