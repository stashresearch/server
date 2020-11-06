const QueueService = require("moleculer-bull");
const QueueMixin = require("./mixins/queue.mixin");
const { messageTemplateList, messageTemplates, channels } = require('./config/config');
const _ = require("lodash");

module.exports = {
    name: "messageQueue",
    mixins: [QueueMixin, QueueService("redis://0.0.0.0:6379", {redis: {db: process.env.REDISDB || 0}})],
    queues: {
        "queue.sendEmail": {
            process(job) {
                this.logger.debug("Sending message...", job.data);
                return new Promise(async (resolve, reject) => {
                    try {
                        await this.broker.call("message.send", job.data);
                        resolve(this.processDone(job.data, true))
                    } catch (error) {
                        reject(this.processDone(job.data));
                    }
                })
            }
        },
    },
    actions: {
        sendMessage: {
            params: {
                toUser: {
                    type: "object",
                    props: {
                        id: "string|optional",
                        email: "string",
                    }
                },
                template: {
                    type: "enum",
                    values: messageTemplateList
                },
                channel: {
                    type: "enum",
                    values: _.values(channels)
                },
                urlParams: "object|optional"
            },
            handler(ctx) {
                const channel = ctx.params.channel.charAt(0).toUpperCase() + ctx.params.channel.slice(1);
                this.createJob("queue.send" + channel, ctx.params, {delay: 0});
            },
        }
    }
};
