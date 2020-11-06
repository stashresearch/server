const { MoleculerError } = require("moleculer").Errors;

const errors = {
    "NOT_FOUND": {
        "message": "Resource not found",
        "code": 404,
        "type": "NOT_FOUND"
    },
    "NOT_UNIQUE": {
        "message": "Resource not unique",
        "code": 409,
        "type": "NOT_UNIQUE"
    },
    "DOWNLOAD_ERROR": {
        "message": "Remote resource doesn't exists",
        "code": 404,
        "type": "DOWNLOAD_ERROR"
    },
    "PROVIDER_AUTH_ERROR": {
        "message": "Remote authentication error",
        "code": 401,
        "type": "PROVIDER_AUTH_ERROR"
    },
    "PROVIDER_BAD_REQUEST": {
        "message": "Remote request error",
        "code": 401,
        "type": "PROVIDER_BAD_REQUEST"
    },
    "SYNC_ERROR": {
        "message": "Remote resource doesn't exists",
        "code": 404,
        "type": "SYNC_ERROR"
    },
    "VALIDATION_ERROR": {
        "message": "Parameters validation error",
        "code": 422,
        "type": "VALIDATION_ERROR"
    },
    "UNPROCESSED_REQUEST": {
        "message": "Unprocessed request",
        "code": 422,
        "type": "UNPROCESSED_REQUEST"
    },
    "INVALID_CREDENTIALS": {
        "message": "Invalid credentials",
        "code": 401,
        "type": "INVALID_CREDENTIALS"
    },
    "NO_TOKEN": {
        "message": "Unauthorized",
        "code": 401,
        "type": "NO_TOKEN"
    },
    "INVALID_TOKEN": {
        "message": "Unauthorized",
        "code": 401,
        "type": "INVALID_TOKEN"
    },
    "UNAUTHORIZED": {
        "message": "Unauthorized",
        "code": 401,
        "type": "UNAUTHORIZED"
    },
    "FORBIDDEN": {
        "message": "Forbidden",
        "code": 403,
        "type": "FORBIDDEN"
    },
    "UNKNOWN_ERROR": {
        "message": "Unknown error",
        "code": 500,
        "type": "UNKNOWN_ERROR"
    },
    "FOLDER_EXISTS": {
        "message": "Folder already exists",
        "code": 400,
        "type": "FOLDER_EXISTS"
    },
    "BAD_REQUEST": {
        "message": "Bad request",
        "code": 400,
        "type": "BAD_REQUEST"
    },
    "TOKEN_EXPIRED": {
        "message": "Token expired",
        "code": 410,
        "type": "EXPIRED_REQUEST"
    },
    "ALREADY_EXISTS": {
        "message": "Resource already exists",
        "code": 409,
        "type": "ALREADY_EXISTS"
    },
    "PROJECT_SETUP_INCOMPLETE": {
        "message": "Project setup hasn't been finished.",
        "code": 409,
        "type": "PROJECT_SETUP_INCOMPLETE"
    },
    "GIT_AUTH_ERROR": {
        "message": "Git auth error",
        "code": 401,
        "type": "GIT_AUTH_ERROR"
    },
    "GIT_CONFLICT_ERROR": {
        "message": "Git conflict error",
        "code": 409,
        "type": "GIT_CONFLICT_ERROR"
    },
    "GIT_INVITATION_NOT_FOUND": {
        "message": "Invalid repository",
        "code": 422,
        "type": "GIT_INVITATION_NOT_FOUND"
    }
};

exports.getError = (error, data) => {
    return new MoleculerError(...Object.values(error), data);
};
exports.errors = errors;
