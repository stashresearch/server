const QueueService = require("moleculer-bull");
const QueueMixin = require("./mixins/queue.mixin");
const _ = require("lodash");

module.exports = {
    name: "dataQueue",
    mixins: [QueueMixin, QueueService("redis://0.0.0.0:6379", {redis: {db: process.env.REDISDB || 0}})], // mixin order matters! QueueMixin's start() function is called after QueueService()
    dependencies: ["dataSource", "data"],
    queues: {}, // no predefined queues
    actions: {
        createDiff: {
            params: {
                id: "string",
                dSId: "any"
            },
            handler(ctx) {
                const queueName = "queue.createDiff." + ctx.params.dSId;
                // TODO if there are more queue services we can/should split the task by mod(id,nOfServices) to avoid download concurrency
                // TODO we create queues for dataSource when request comes in, in case of a server restart persisted stuck tasks may not be triggered to rerun (not tested)...
                if (!this.$queues[queueName]) {
                    const queue = this.getQueue(queueName); // this creates or gives back the queue
                    queue.process(this.processCreateDiff.bind(this));
                    this.setEvents(queueName);
                }
                this.createJob(queueName, ctx.params, {delay: 0});
            }
        },
    },
    methods: {
        processCreateDiff(job) {
            this.logger.debug("Creating data diff...", job.data);
            return new Promise(async (resolve, reject) => {
                const dataSourceDiff = job.data;
                try {
                    await this.broker.call("dataSourceDiff.createDiff", dataSourceDiff, {timeout: 60000});
                    resolve(this.processDone(job.data, true));
                } catch (error) {
                    this.logger.error(error);
                    reject(this.processDone(job.data))
                }
            })
        }
    }
};
