const _ = require("lodash");
const { getError, errors } = require("./config/errors");

module.exports = {
    name: "googleWebhook",
    actions: {
        googleNotification: {
            params: {
                id: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        ctx.call("downloadQueue.download", ctx.params);
                        resolve()
                    } catch (error) {
                        this.logger.error(error);
                        if (error.code = 404) { // it shouldn't happen as we unsubscribe from syncing after deletion
                            resolve()
                        } else {
                            reject(error)
                        }
                    }
                });
            }
        },
        googleAuthCallback: {
            params: {
                code: "string",
                state: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        //await ctx.call("auth.verifyToken", {token: ctx.params.state});
                        await ctx.call("userToken.verify", {token: ctx.params.state});
                        ctx.params.user = ctx.meta.user; // verifyToken sets ctx.meta.user
                        await ctx.call("googleApi.getTokenWithAuthCode", ctx.params);
                        resolve()
                    } catch (error) {
                        this.logger.error(error);
                        reject(getError(errors.BAD_REQUEST))
                    }
                })
            }
        }
    }
};

