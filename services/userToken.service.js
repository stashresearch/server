const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const { errors } = require("./config/errors");

module.exports = {
    name: 'userToken',
    settings: {
        JWT_PUBLIC_KEY: fs.readFileSync(path.join(__dirname, "config/keys/publicKey.pem")),
        JWT_PRIVATE_KEY: fs.readFileSync(path.join(__dirname, "config/keys/privateKey.pem")),
        defaultExpiration: 10 * 365 * 24 * 3600
    },
    actions: {
        generate: {
            params: {
                user: {
                    type: "object",
                    props: {
                        id: "string"
                    }
                }
            },
            handler(ctx) {
                return ctx.call("util.generateToken", {object: _.pick(ctx.params.user, ["id"]), privateKey: this.settings.JWT_PRIVATE_KEY, expiration: this.settings.defaultExpiration})
            }
        },
        verify: {
            params: {
                token: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const decoded = await ctx.call("util.verifyToken", {token: ctx.params.token, publicKey: this.settings.JWT_PUBLIC_KEY});
                        let user = await ctx.call("user.get", decoded);
                        this.logger.debug("Authenticated via JWT: ", user);
                        ctx.meta.user = user;
                        resolve(user);
                    } catch (error) {
                        if (error.type == errors.NOT_FOUND.type) {
                            reject(error)
                        }
                        reject(error)
                    }
                });
            }
        }
    }
};