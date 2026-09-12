export class GetCourseError extends Error {
  constructor(message) {
    super(message);
    this.name = "GetCourseError";
  }
}

export class LoginError extends GetCourseError {
  constructor(message) {
    super(message);
    this.name = "LoginError";
  }
}

export class UserNotFoundError extends GetCourseError {
  constructor(message = "Пользователь не найден") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class UserExistsError extends GetCourseError {
  constructor(message = "Пользователь с таким e-mail уже существует") {
    super(message);
    this.name = "UserExistsError";
  }
}

export class GroupNotFoundError extends GetCourseError {
  constructor(message = "Группа не найдена") {
    super(message);
    this.name = "GroupNotFoundError";
  }
}

export class CustomFieldNotFoundError extends GetCourseError {
  constructor(message = "Дополнительное поле не найдено") {
    super(message);
    this.name = "CustomFieldNotFoundError";
  }
}
