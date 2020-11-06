"use strict";
const fs = require("fs");
const path = require("path");
const redisMixin = require("./mixins/redis.mixin");
const { getError, errors } = require("./config/errors");

module.exports = {
    name: 'token',
    mixins: [redisMixin],
    settings: {
        JWT_PUBLIC_KEY: fs.readFileSync(path.join(__dirname, "config/keys/publicKeyForOneTimeToken.pem")),
        JWT_PRIVATE_KEY: fs.readFileSync(path.join(__dirname, "config/keys/privateKeyForOneTimeToken.pem")),
        defaultExpiration: 24 * 60 * 60, // 1 day
        limitOfUsage: process.env.TOKEN_DEFAULT_LIMIT || 1
    },
    actions: {
        generate: {
            params: {
                object: "object",
                expiration: "number|optional",
                limitOfUsage: "number|optional|integer|min:1",
                endPoints: ["string|optional","array|optional"]
            },
            handler(ctx) {
                let { limitOfUsage, endPoints } = ctx.params;
                if (typeof endPoints == "string")
                    endPoints = [endPoints];
                if (!limitOfUsage)
                    limitOfUsage = this.settings.limitOfUsage;
                return ctx.call("util.generateToken", {object: {...ctx.params.object, limitOfUsage, endPoints}, privateKey: this.settings.JWT_PRIVATE_KEY,
                                                        expiration: ctx.params.expiration || this.settings.defaultExpiration});
            }
        },
        decode: {
            params: {
                token: "string"
            },
            handler(ctx) {
                return ctx.call("util.verifyToken", {token: ctx.params.token, publicKey: this.settings.JWT_PUBLIC_KEY});
            }
        },
        verify: {
            params: {
                token: "string"
            },
            async handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const { token } = ctx.params;
                        const decoded = await ctx.call("util.verifyToken", {token, publicKey: this.settings.JWT_PUBLIC_KEY});
                        const value = await this.redis.getAsync(token);
                        const valueInt = value ? parseInt(value) : null;
                        if (!valueInt) {
                            await this.redis.setAsync(token, 1);
                        } else if (valueInt < decoded.limitOfUsage) {
                            await this.redis.setAsync(token, 1 + valueInt);
                        } else {
                            reject(getError(errors.TOKEN_EXPIRED))
                        }
                        resolve(decoded);
                    }
                    catch (error) {
                        reject(error)
                    }
                })
            }
        },
    },
};
