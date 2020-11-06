'use strict';
const keySchema = require("./../common/models/KeySchema");
const mongoMixin = require("./mixins/mongo.mixin");
const { getError, errors } = require("./config/errors");

module.exports = {
    name: 'key',
    mixins: [mongoMixin],
    modelName: "Key",
    schema: keySchema,
    actions: {
        /*create: {
            params: {
                password: "string",
                secondaryKey: "string"
            },
            hooks: {
                before: ["createKeys"]
            },
        },
        recreate: { // with secondaryKey get back privateKey and encrypt back
            params: {
                id: "string",
                password: "string",
                secondaryKey: "string",
                recoveryKey: "string"
            },
            hooks: {
                before: "getKey"
            },
            async handler(ctx) {
                let key = ctx.meta.key;
                const recoveryKey = ctx.params.recoveryKey;
                const password = ctx.params.password;
                const secondaryKey = ctx.params.password;
                try {
                    const KeyObject = await ctx.call("util.getDecryptionKey", {privateKey: key.secondaryPrivateKey, password: recoveryKey});
                    const primaryPrivateKey = await ctx.call("util.exportKey", {KeyObject, password});
                    const secondaryPrivateKey = await ctx.call("util.exportKey", {KeyObject, password: secondaryKey});
                    key = await ctx.call("key.update", {id: key.id, primaryPrivateKey, secondaryPrivateKey, recoveredSecondaryPrivateKey: key.secondaryPrivateKey});
                    return key;
                } catch (error) {
                    if (error.code == 'ERR_OSSL_EVP_BAD_DECRYPT') {
                        throw getError(errors.BAD_REQUEST, {invitationId: recoveryKey})
                    }
                    return error
                }
                return key;
            }
        },*/
    },
    methods: {
        /*async createKeys(ctx) {
            const password = ctx.params.password;
            const secondaryKey = ctx.params.secondaryKey;
            const keys = await ctx.call("util.generateKeyPair", {password});
            const KeyObject = await ctx.call("util.getDecryptionKey", {privateKey: keys.privateKey, password});
            const secondaryPrivateKey = await ctx.call("util.exportKey", {KeyObject, password: secondaryKey});
            ctx.params.publicKey = keys.publicKey;
            ctx.params.primaryPrivateKey = keys.privateKey;
            ctx.params.secondaryPrivateKey = secondaryPrivateKey
        },
        async getKey(ctx) {
            ctx.meta.key = await ctx.call("key.get", ctx.params);
        }*/
    }
};