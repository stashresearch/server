
exports.authenticationMiddleware = async (req, res, next) => {
    try {
        await authenticate(req.$ctx, req.$route, req);
        next()
    } catch (error) {
        next(error);
    }
};

//const { getError, errors } = require("../../servicesOld/config/errors");
const { getError, errors } = require("./../config/errors");
function authenticate(ctx, route, req) {
    let token;
    if (req.headers.authorization) {
        let type = req.headers.authorization.split(" ")[0];
        if (type === "Bearer") {
            token = req.headers.authorization.split(" ")[1];
        }
    }
    if (!token) {
        return Promise.reject(getError(errors.NO_TOKEN))
    }
    return ctx.call("userToken.verify", {token})
}
exports.authenticate = authenticate;