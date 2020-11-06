const { getError, errors } = require("./config/errors");

module.exports = {
    name: "mandrillWebhook",
    actions: {
        events: {
            params: {
                mandrill_events: "string|optional"
            },
            handler(ctx) {
                this.logger.debug("Mandrill webhook", ctx.params);
                return new Promise(async (resolve, reject) => {
                    if (ctx.params.mandrill_events) {
                        const events = JSON.parse(ctx.params.mandrill_events);
                        try {
                            const messageActions = events.map((event) => {
                                return {
                                    action: 'message.saveMandrillEvent',
                                    params: event
                                }
                            });
                            await ctx.broker.mcall(messageActions);
                            resolve()
                        } catch (error) {
                            if (error.type == errors.NOT_FOUND.type) { // message not found in the DB, should not happen
                                resolve()
                            } else {
                                reject(getError(errors.UNKNOWN_ERROR))
                            }
                        }
                    } else {
                        this.logger.warn("No mandrill events", ctx.params);
                    }
                });
            }
        },
    },
    methods: {
        processMandrillEvent(events) {
            return events.map(event => {
                return this.broker.call('message.saveMandrillEvent', {event: event});
            })
        }
    }
};