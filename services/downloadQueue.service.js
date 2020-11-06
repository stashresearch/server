const QueueService = require("moleculer-bull");
const QueueMixin = require("./mixins/queue.mixin");
const { syncMethods, syncStatus } = require("./config/config");
const _ = require("lodash");

module.exports = {
    name: "downloadQueue",
    mixins: [QueueMixin, QueueService("redis://0.0.0.0:6379", {redis: {db: process.env.REDISDB || 0}})], // mixin order matters! QueueMixin's start() function is called after QueueService()
    dependencies: ["dataSource"],
    queues: { // no predefined queue for download, create one for each dataSource
        "queue.syncSchedule": {
            concurrency: 1,
            async process(job) {
                const dataSource = job.data;
                const now = new Date();
                const syncExpiresAt = new Date(dataSource.syncExpiresAt);
                this.logger.debug("Sync schedule...", {id: dataSource.id, syncExpiresAt: syncExpiresAt, now: now});
                return new Promise(async (resolve, reject) => {
                    try {
                        if (now < syncExpiresAt) { // syncing not expired
                            if (job.data.syncMethod == syncMethods.PERIODIC) {
                                this.broker.call("downloadQueue.download", job.data)
                            } else {
                                if (job.data.syncMethod == syncMethods.CONTINUOUS) {
                                    this.broker.call("downloadQueue.restartSync", job.data);
                                }
                            }
                        } else { // last download and expiration
                            this.logger.debug("Expire, last download");
                            await this.broker.call("dataSource.update", {
                                id: dataSource.id,
                                syncStatus: syncStatus.EXPIRED,
                            });
                            this.broker.call("downloadQueue.download", job.data);
                        }
                        resolve(this.processDone(job.data, true))
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        "queue.restartSync": {
            concurrency: 1,
            process(job) {
                this.logger.debug("Restart syncing...", job.data);
                return new Promise(async (resolve, reject) => {
                    try {
                        await this.broker.call("dataSource.restartSync", job.data, {timeout: 60000});
                        resolve(this.processDone(job.data, true));
                    } catch (error) {
                        reject(this.processDone(job.data))
                    }
                })
            }
        }
    },
    actions: {
        download: {
            params: {
                id: "string"
            },
            handler(ctx) {
                const queueName = "queue.download." + ctx.params.id;
                // TODO if there are more queue services we can/should split the task by mod(id,nOfServices) to avoid download concurrency
                // TODO we create queues for dataSource when request comes in, in case of a server restart persisted stuck tasks may not be triggered to rerun (not tested)...
                if (!this.$queues[queueName]) {
                    const queue = this.getQueue(queueName); // this creates or gives back the queue
                    queue.process(this.processDownload.bind(this));
                    this.setEvents(queueName);
                }
                this.createJob(queueName, ctx.params, {delay: 0});
            }
        },
        restartSync: {
            params: {
                id: "string"
            },
            handler(ctx) {
                this.createJob("queue.restartSync", ctx.params, {delay: 0});
            }
        },
        syncSchedule: {
            params: {
                id: "string",
                schedulePattern: "string",
                syncMethod: {
                    type: "enum",
                    values: _.values(syncMethods)
                },
                syncExpiresAt: {
                    type: "date",
                    convert: true
                }
            },
            handler(ctx) {
                this.createJob("queue.syncSchedule", ctx.params);
                this.createJob("queue.syncSchedule", ctx.params, {jobId: ctx.params.id, repeat: {cron: ctx.params.schedulePattern, endDate: ctx.params.syncExpiresAt}}); // schedule future tasks
            }
        },
        syncScheduleStop: {
            params: {
                id: "string",
                schedulePattern: "string",
                syncExpiresAt: "date"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const queue = this.getQueue("queue.syncSchedule");
                        await queue.removeRepeatable({jobId: ctx.params.id, cron: ctx.params.schedulePattern, endDate: ctx.params.syncExpiresAt});
                        resolve();
                    } catch (error) {
                        reject(error)
                    }
                });

            }
        },
        getRepeatableJobs: { // only for testing
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const queue = this.getQueue("queue.syncSchedule");
                        const jobs = await queue.getRepeatableJobs();
                        resolve(jobs)
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        }
    },
    methods: {
        processDownload(job) {
            this.logger.debug("Downloading data...", job.data);
            return new Promise(async (resolve, reject) => {
                const dataSource = job.data;
                try {
                    await this.broker.call("dataSource.download", dataSource, {timeout: 60000});
                    resolve(this.processDone(job.data, true));
                } catch (error) {
                    this.logger.error(error);
                    reject(this.processDone(job.data))
                }
            })
        }
    },
    events: {

    }
};
