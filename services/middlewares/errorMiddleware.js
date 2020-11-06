const {getError, errors} = require("./../config/errors");
const { MoleculerError } = require("moleculer").Errors;
const _ = require("lodash");

module.exports = {
    name: "errorMiddleware",
    localAction(next) {
        return function(ctx) {
            return new Promise(async (resolve, reject) => {
                try {
                    const res = await next(ctx);
                    resolve(res);
                } catch (error) {
                    if (error instanceof MoleculerError) {
                        reject(error)
                    }

                    ctx.service.logger.error(error);
                    if (error.name == "CastError") { // bad id attribute mongo
                        reject(getError(errors.NOT_FOUND), error.message)
                    }
                    if (error.name == "MongoError" && error.code == 11000) {
                       reject(getError(errors.ALREADY_EXISTS, error.keyValue))
                    }
                    if (_.get(error, "errors.name.name") == "ValidatorError") {
                        reject(getError(errors.VALIDATION_ERROR, [{
                            type: 'required',
                            message: "The '" + error.errors.name.path + "' field is required.",
                            field: error.errors.name.path
                        }]));
                    }
                    if (_.get(error, "code") == 404 || _.get(error, "status") == 404) {
                        reject(getError(errors.NOT_FOUND, error.data))
                    }

                    reject(error)
                }
            });
        };
    }
};