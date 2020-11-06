"use strict";
const _ = require("lodash");
const MongoGridFSAdapter = require("./MongoGridFSAdapter");
const { Readable } = require('stream');

module.exports = {
    name: "",
    adapter: new MongoGridFSAdapter("mongodb://localhost", {
        useUnifiedTopology: true,
        useNewUrlParser: true,
        keepAlive: true
    }, "files"),
    collection: "fs.files",
    actions: {
        upload: {
            params: {
                data: "any",
                fileName: "string",
                metadata: "object|optional"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let params = ctx.params;
                        //const dataString = JSON.stringify(params.data);
                        //params.metadata.checksum = await ctx.call("util.hashObject", {input: dataString});
                        resolve(await this.adapter.upload(Readable.from(params.data), params.fileName, {metadata: params.metadata}));
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        download: {
            params: {
               id: "any"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const data = this.adapter.download(ctx.params.id);
                        resolve(data)
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        getMeta: {
            params: {
                id: "any"
            },
            handler(ctx) {
                return this.adapter.findById(ctx.params.id);
            }
        }
    },

    created() {
        this.adapter = this.schema.adapter;
        this.adapter.init(this.broker, this);
    },

    started() {
        if (this.adapter) {
            return new Promise(resolve => {
                let connecting = () => {
                    this.adapter.connect().then(resolve).catch(err => {
                        this.logger.error("Connection error!", err);
                        setTimeout(() => {
                            this.logger.warn("Reconnecting...");
                            connecting();
                        }, 1000);
                    });
                };

                connecting();
            });
        }

        return Promise.reject(new Error("Please set the store adapter in schema!"));
    },

    stopped() {
        if (this.adapter)
            return this.adapter.disconnect();
    },
};
