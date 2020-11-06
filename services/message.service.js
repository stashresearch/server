'use strict';
const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const MessageSchema = require("./../common/models/MessageSchema");
const mongoMixin = require("./mixins/mongo.mixin");
const _ = require("lodash");
const mimelib = require("mimelib");
const { getError, errors } = require("./config/errors");
const {messageTemplateList, messageTemplates, messageEvents, channels, server} = require('./config/config');

module.exports = {
    name: 'message',
    //mixins: [DbService, mongoMixin],
    mixins: [mongoMixin],
    /*adapter: new MongooseAdapter("mongodb://localhost/stash", {
        useUnifiedTopology: true,
        useNewUrlParser: true,
        keepAlive: true
    }),*/
    modelName: "Message",
    schema: MessageSchema,
    settings: {
        apiserver: server.apiserver,
        webserver: server.webserver,
        messageExpiresAt: {
            [messageTemplates.WELCOME]: 24 * 3600 * 1000, // 1 day
            [messageTemplates.VERIFICATION]: 1 * 3600 * 1000, // 1 hour
            [messageTemplates.PASSWORDRESET]: 1 * 3600 * 1000, // 1 hour
            [messageTemplates.INVITATION]: 30 * 24 * 3600 * 1000, // 30 days
        },
    },
    actions: {
        send: {
            params: {
                channel: {
                    type: "enum",
                    values: _.values(channels)
                },
                toUser: {
                    type: "object",
                    props: {
                        email: "string",
                    }
                },
                template: {
                    type: "enum",
                    values: messageTemplateList
                },
                urlParams: "object|optional",
            },
            handler(ctx) {
                const channel = ctx.params.channel;
                const toUser = ctx.params.toUser;
                const template = ctx.params.template;
                const urlParams = ctx.params.urlParams || {};
                const expirationByTemplate = this.settings.messageExpiresAt[template];
                const expiresAt = expirationByTemplate ? Date.now() + expirationByTemplate : null;
                return new Promise(async (resolve, reject) => {
                    try {
                        const message = await ctx.call('message.create', {
                            userId: toUser.id,
                            to: toUser.email,
                            template: template,
                            channel: channel,
                            expiresAt: expiresAt,
                            params: ctx.params.params
                        });
                        this.logger.debug("New message", message);
                        const messageParams = this.getMessageParams(toUser, message, urlParams);
                        let sentResult;
                        switch (channel) {
                            case "email": {
                                sentResult = await this.broker.call("mail.send", messageParams);
                                break;
                            }
                            case "notification":
                        }
                        this.logger.debug("Message sent", sentResult);
                        await this.broker.call('message.update', {id: message.id, [messageEvents.SENT]: 1});
                        resolve(message);
                    } catch (error) {
                        reject(error)
                    }
                });

            }
        },
        /*use: {
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const message = await ctx.call('message.get', ctx.params);
                        if (message.expiresAt < new Date()) {
                            reject(getError(errors.LINK_EXPIRED, {id: message.id, expiresAt: message.expiresAt}))
                        } else {
                            ctx.call("message.update", {id: ctx.params.id, expiresAt: new Date()});
                            resolve(message);
                        }
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },*/
        saveMandrillEvent: {
            handler(ctx) {
                const receivedEvent = ctx.params;
                return new Promise(async (resolve, reject) => {
                    try {
                        this.logger.debug("Mandrill event received", receivedEvent);
                        const messageId = _.get(receivedEvent, 'msg.metadata.messageUUID');
                        const event = this.convertMandrillEventToInternalEvent(receivedEvent.event);
                        let location = {};
                        if (event == messageEvents.CLICK) {
                            location = _.pick(_.get(receivedEvent, "location"), ["country", "region", "city", "latitude", "longitude"]);
                        }
                        if (event && messageId) {
                            const message = await ctx.call("message.update", {id: messageId, [event]: true, location});
                            if (event == messageEvents.UNSUBSCRIBE || event == messageEvents.COMPLAINT) {
                                ctx.broker.emit("message.unsubscribe", message, ['user']);
                            }
                            resolve();
                        } else {
                            this.logger.warn("Event or messageId not found", {event: event, messageId: messageId});
                            resolve();
                        }
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        getLastMessage: { // for testing
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const message = await ctx.call("message.find", {sort: "-createdAt", limit: 1});
                        resolve(message[0]);
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        }
    },
    methods: {
        getMessageParams(user, message, urlParams) {
            const messageUUID = message.id;
            //urlParams.messageId = message.id;
            const headerValue = mimelib.encodeMimeWords(JSON.stringify({messageUUID}), "Q", 52, "utf-8");
            let params = {
                to: message.to,
                template: message.template,
                headers: {
                    "X-MC-Metadata": headerValue
                },
                data: {
                    user,
                    message,
                    urlParamsObj: urlParams,
                    urlParams: urlParams ? ("?" + new URLSearchParams(urlParams).toString()) : "",
                    apiserver: this.settings.apiserver,
                    webserver: this.settings.webserver
                }
            };
            return params;
        },
        convertMandrillEventToInternalEvent(mandrillEvent) {
            let event = null;
            switch (mandrillEvent) {
                case "send" :
                    event = messageEvents.DELIVERED;
                    break;
                case "hard_bounce" :
                    event = messageEvents.BOUNCED;
                    break;
                case "soft_bounce" :
                    event = messageEvents.BOUNCED;
                    break;
                case "dropped" :
                    event = messageEvents.BOUNCED;
                    break;
                case "unsub" :
                    event = messageEvents.UNSUBSCRIBE;
                    break;
                case "spam" :
                    event = messageEvents.COMPLAINT;
                    break;
                case "reject" :
                    event = messageEvents.BOUNCED;
                    break;
                case "deferral" :
                    event = messageEvents.BOUNCED;
                    break;
                case "open" :
                    event = messageEvents.OPEN;
                    break;
                case "click" :
                    event = messageEvents.CLICK;
                    break;
            }
            return event;
        }
    }
};