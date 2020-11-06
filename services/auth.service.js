"use strict";
const { getError, errors } = require("./config/errors");

module.exports = {
    name: "auth",
    actions: {
        login: {
            rest: "POST /login",
            params: {
                name: "string|optional",
                email: "email",
                password: "string|min:1",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                     try {
                         const user = await ctx.call("user.getUnique", {query: ctx.params});
                         await ctx.call("util.passwordCheck", {password: ctx.params.password, passwordHash: user.password});
                         const token = await ctx.call("userToken.generate", {user});
                         resolve({token})
                     } catch (error) {
                         if (error.type == errors.NOT_FOUND.type) { // email/user not found -> override error to UNPROCESSED
                             reject(getError(errors.UNPROCESSED_REQUEST, [{type: "credentials", field: "*", message: "Email or password not valid"}]))
                         }
                         reject(error)
                     }
                });
            }
        },
        signup: {
            rest: "POST /signup",
            params: {
                email: "email",
                password: "string|min:1",
                firstName: "string|min:1",
                lastName: "string|min:1",
                locale: "string|optional",
            },
            handler(ctx) {
                return ctx.call("user.create", ctx.params).then(user => {
                    return ctx.call("userToken.generate", {user}).then(token => {
                        return {token};
                    });
                });
            }
        },
    }
};