"use strict";
const userSchema = require("./../common/models/UserSchema");
const mongoMixin = require("./mixins/mongo.mixin");
const { messageTemplates, channels, dataProviders, syncErrors } = require("./config/config");
const { getError, errors } = require("./config/errors");
const _ = require('lodash');

module.exports = {
    name: "user",
    mixins: [mongoMixin],
    modelName: "User",
    schema: userSchema,
    settings: {
        _ids: ["_id", "name", "email"],
        populates: {
            /*"projects": {
                action: "project.get",
                params: {
                    fields: ["id", "name", "path"]
                }
            }*/
        }
    },
    actions: {
        getMe: {
            hooks: {
                before: ["getUser"]
            },
            handler(ctx) {
                return ctx.meta.user
            }
        },
        /*getPublic: {
            async handler(ctx) {
                const user = _.get(ctx, "meta.user") || _.get(ctx, "params.user") || await ctx.call("user.getUnique", {query: ctx.params});
                return this.getPublic(user)
            }
        },*/
        create: {
            params: {
                email: "email",
                password: "string|min:1",
                firstName: "string|min:1",
                lastName: "string|min:1",
                locale: "string|optional",
            },
            hooks: {
                before: ["generatePasswordHash", "createUserName"],
                after: ["userCreated"]
            }
        },
        update: {
            hooks: {
                before: ["setUserId", "emailUpdate"],
                after: ["emailUpdated"]
            }
        },
        requestChannelVerification: {
            hooks: {
                before: ["getUser"]
            },
            params: {
                channel: {
                    type: "enum",
                    values: _.values(channels)
                }
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const channel = ctx.params.channel;
                        const token = await ctx.call("token.generate", {object: {id: _.get(ctx, "meta.user.id"), channel: ctx.params.channel}, expiration: 7 * 24 * 60 * 60});
                        ctx.call('messageQueue.sendMessage', {toUser: ctx.meta.user, template: messageTemplates.VERIFICATION, channel, urlParams: {token}});
                        ctx.meta.$statusCode = 202;
                        resolve({});
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        verifyChannel: {
            params: {
                token: "string"
            },
            async handler(ctx) {
                const decoded = await ctx.call("token.verify", {token: ctx.params.token});
                await ctx.call("user.update", {id: decoded.id, [decoded.channel + "Verified"]: 1});
                return {};
            }
        },
        requestPasswordReset: {
            params: {
                email: "email|optional"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let user;
                        if (ctx.params.email) {
                            user = await ctx.call("user.getUnique", {query: {email: ctx.params.email}});
                        } else {
                            user = ctx.meta.user
                        }
                        const token = await ctx.call("token.generate", {object: {id: user.id}});
                        this.sendEmail(user, messageTemplates.PASSWORDRESET, {token});
                        ctx.meta.$statusCode = 202;
                        resolve({});
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        },
        requestPasswordResetWithEmail: {
            params: {
                email: "email"
            },
            handler(ctx) {
                return ctx.call("user.requestPasswordReset", ctx.params)
            }
        },
        checkPassword: {
            params: {
                password: "string",
            },
            async handler(ctx) {
                const passwordHash = ctx.meta.user.password;
                await ctx.call("util.passwordCheck", {password: ctx.params.password, passwordHash});
                return {}
            }
        },
        resetPassword: {
            params: {
                currentPassword: "string|optional|min:1",
                password: "string|min:1",
                token: "string"
            },
            hooks: {
                before: ["generatePasswordHash"],
                after: ["passwordChanged"]
            },
            async handler(ctx) {
                const { currentPassword, password, token } = ctx.params;
                if (currentPassword != null) {
                    try {
                        await ctx.call("user.checkPassword", {password: currentPassword})
                    } catch (error) {
                        if (error.type == errors.UNPROCESSED_REQUEST.type) {
                            throw getError(errors.UNPROCESSED_REQUEST, [{type: "credentials", field: "currentPassword", message: "currentPassword not valid"}])
                        }
                    }
                }
                const decoded = await ctx.call("token.verify", {token});
                let user = await ctx.call("user.get", decoded);
                const userId = user.id;
                ctx.params.userId = userId; // TODO does it look good? if not Bearer token, we will use in project this userId
                user = await ctx.call("user.update", {id: userId, password});
                const projects = await ctx.call("project.findUserProjects", {userId});
                const projectNeedsRecoveryCalls = projects.map((project) => {
                    return {
                        action: "project.needsRecovery",
                        params: {
                            id: project.id,
                            member: {
                                userId,
                                needsRecovery: true
                            }}
                    }
                });
                await ctx.mcall(projectNeedsRecoveryCalls);
                this.sendEmail({...user}, messageTemplates.PASSWORDCHANGED);
                ctx.meta.$statusCode = 202;
                return {};
            }
        },
        resetPasswordWithCurrentPassword: {
            params: {
                currentPassword: "string|min:1"
            },
            handler(ctx) {
                return ctx.call("user.resetPassword", ctx.params)
            }
        },
        // ------ CREDENTIALS ------ //
        getCredentials: {
            hooks: {
                before: ["getUser"]
            },
            provider: {
                type: "enum",
                values: _.values(dataProviders)
            },
            async handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    const provider = ctx.params.provider;
                    const user = ctx.meta.user;
                    try {
                        const userCredential = user.credentials[provider];
                        if ((provider == dataProviders.FORMR && userCredential.clientId && userCredential.clientSecret) // exception for formR
                            ||
                            (userCredential && userCredential.refreshToken)
                        ) {
                            const newTokens = await ctx.call(provider + "Api.refreshAccessToken", {user: {id: user.id, userCredential}});
                            const credentials = this.credentialsToModel(newTokens, provider);
                            resolve(await ctx.call("user.updateCredentials", {provider, credentials}));
                        } else {
                            resolve({accessToken: null, accessTokenExpiration: null, provider})
                        }
                    } catch (error) {
                        if (error.type = errors.PROVIDER_AUTH_ERROR.type) {
                            await ctx.call("user.deleteCredentials", {
                                id: ctx.meta.user.id,
                                provider: ctx.params.provider
                            });
                        }
                        resolve({accessToken: null, accessTokenExpiration: null, provider})
                    }
                });
            }
        },
        createCredentials: { // called from API, only for formR
            hooks: {
                before: [
                    "validateFormRCredential"
                ]
            },
            params: {
                provider: {
                    type: "enum",
                    values: _.values(dataProviders)
                },
            },
            async handler(ctx) {
                const provider = ctx.params.provider;
                const credentials = ctx.params;
                return ctx.call("user.updateCredentials", {provider, credentials})
            }
        },
        updateCredentials: {
            hooks: {
                before: [
                    "getUser" // not always called from the API, so retrieve the user
                ]
            },
            provider: {
                type: "enum",
                values: _.values(dataProviders)
            },
            async handler(ctx) {
                let user = ctx.meta.user;
                const provider = ctx.params.provider;
                const credentials = Object.assign({}, user.credentials, {[provider]: Object.assign({}, user.credentials[provider], ctx.params.credentials)});
                user = await ctx.call("user.update", {credentials});
                return user.credentials[provider] || {}
            }
        },
        deleteCredentials : {
            hooks: {
                before: [
                    "getUser"
                ]
            },
            params: {
                provider: {
                    type: "enum",
                    values: _.values(dataProviders)
                },
                notifyReason: "string|optional"
            },
            async handler(ctx) {
                const user = ctx.meta.user;
                await ctx.call(ctx.params.provider + "Api.revokeToken", {user: {id: user.id, userCredential: user.credentials[ctx.params.provider]}});
                delete user.credentials[ctx.params.provider];
                await ctx.call("user.update", {credentials: user.credentials});
                ctx.call("dataSource.brokenSyncAll", {
                    createdByUserId: user.id,
                    provider: ctx.params.provider,
                    syncError: syncErrors.AUTH_REVOKEN
                });
                if (ctx.params.notifyReason) {
                    this.sendEmail(user, template.SYNCBROKEN, {reason: ctx.params.notifyReason, provider: ctx.params.provider});
                }
                return {}
            }
        }
    },
    methods: {
        setUserId(ctx) {
            ctx.params.id = _.get(ctx, "meta.user.id") || ctx.params.id;
        },
        async getUser(ctx) {
            try {
                ctx.meta.user = ctx.params.id ? await ctx.call("user.get", ctx.params) : _.get(ctx, "meta.user");
            } catch (error) {
                throw error
            }
        },
        /*populate(ctx) {
            ctx.params.populate = ["projects"]
        },*/
        async generatePasswordHash(ctx) {
             ctx.params.password = await ctx.call("util.generatePasswordHash", ctx.params)
        },
        async createUserName(ctx) {
            const nameBase = (ctx.params.firstName.toLowerCase() + " " + ctx.params.lastName.toLowerCase()).replace(/[\.\s]+/g,'-');
            let nameGuess;
            let found = false;
            while (!found) {
                const randomHex = await this.broker.call("util.getRandomHex");
                nameGuess = nameBase + "-" + randomHex;
                let users;
                try {
                    users = await this.broker.call("user.getUnique", {query: {name: nameGuess}});
                } catch (error) {
                    found = true;
                    if (error.code == 404) {
                        ctx.params.name = nameGuess;
                        return;
                    } else {
                        return error
                    }
                }
            }
        },
        md5Hash(password) {
            return md5(password)
        },
        userCreated(ctx, res) {
            this.sendEmail({...res}, messageTemplates.WELCOME);
            return res
            //this.broker.call('messageQueue.sendMessage', {toUser: res, template: messageTemplates.WELCOME, channel: channels.EMAIL});
        },
        /*passwordChanged(ctx, res) {
            this.sendEmail({...res, masterkey: ctx.params.masterkey}, messageTemplates.PASSWORDCHANGED);
            //this.broker.call('messageQueue.sendMessage', {toUser: res, template: messageTemplates.PASSWORDCHANGED, channel: channels.EMAIL});
            return {}
        },*/
        sendEmail(user, template, params = {}) {
            this.broker.call('messageQueue.sendMessage', {toUser: user, template, channel: channels.EMAIL, urlParams: params});
        },
        emailUpdate(ctx) {
            if (ctx.params.email) {
                ctx.params.emailVerified = 0;
            }
        },
        emailUpdated(ctx, res) {
            if (ctx.params.email) {
                this.sendEmail(res, messageTemplates.VERIFICATION)
                //ctx.call('messageQueue.sendMessage', {toUser: res, template: messageTemplates.VERIFICATION, channel: channels.EMAIL});
            }
            return res
        },
        credentialsToModel(tokens, provider, tokenInfo) {
            let accessTokenExpiration;
            switch (provider) {
                case dataProviders.FORMR:
                    accessTokenExpiration = new Date(Date.now() + tokens['expires_in']*1000);
                    break;
                case dataProviders.GOOGLE:
                    accessTokenExpiration = new Date(tokens['expiry_date']);
                    break;
                default:
            }
            let credentials = {
                provider
            };
            if (tokens.access_token) {
                credentials.accessToken = tokens.access_token;
                credentials.accessTokenExpiration = accessTokenExpiration;
            }
            if (tokens.refresh_token) {
                credentials.refreshToken = tokens.refresh_token;
                credentials.refreshTokenExpiration = new Date("9999-12-31 23:59:59:59");
            }
            if (tokenInfo) {
                credentials.email = tokenInfo.email
            }
            return credentials;
        },
        validateFormRCredential(ctx) {
            if (ctx.params.provider == dataProviders.FORMR && (!ctx.params.clientId || !ctx.params.clientSecret)) {
                throw getError(errors.VALIDATION_ERROR, [{type: 'required', message: "The 'clientId, clientSecret' fields are required.", fields: ["clientId", "clientSecret"]}]);
            }
        },
        getPublic(user) {
            return {
                userId: user.id,
                email: user.email,
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName,
                profileImage: user.profileImage
            }
        },
    },
    entityUpdated(json, ctx) {
        this.logger.info(`Entity updated!`);
    },
    events: {
        "provider.newToken"(params) {
            const credentials = this.credentialsToModel(params.tokens, params.provider, params.tokenInfo);
            this.broker.call('user.updateCredentials', {id: params.userId, provider: params.provider, credentials});
        },
        "message.unsubscribe"(message) {
            this.broker.call('user.update', {id: message.userId, emailAllowed: 0});
        },
        /*"provider.authError"(params) {
            this.broker.call('userCredential.delete', {params});
        },*/
    }
};
