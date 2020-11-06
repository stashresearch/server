"use strict";

module.exports = {

    name: "",
    methods: {
        processDone(id, result) {
            return {
                done: result || false,
                id: id,
                worker: process.pid
            }
        },
        setEvents(queueName) {
            const queue = this.getQueue(queueName);
            queue.on("global:completed", (job, res) => {
                this.logger.info(`Job #${job} in ${queueName} completed! Result:`, res);
            });
            queue.on("failed", (job, err) => {
                this.logger.error(`Job #${job} in ${queueName} failed with error`, err);
                this.logger.error(job)
                //job.retry();
            });
        }
    },

    started() {
        Object.keys(this.$queues).forEach((queue) => this.setEvents(queue)) // subscribe to completed event
    },
};
