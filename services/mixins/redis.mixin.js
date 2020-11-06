const redis = require("redis");
//const { promisify } = require("util");
const { promisifyAll } = require("bluebird");

module.exports = {
    name: "",
    settings: {
        dbNumber: 2 // TODO set in production
    },
    created() {
        this.redisClient = redis.createClient({db: this.settings.dbNumber});
    },
    started() {
        this.redis = promisifyAll(this.redisClient);
    },
    stopped() {
        if (this.redisClient) {
            this.redisClient.quit(() => {
                this.logger.debug("Redis connection closed")
            });
        }
    }
};
