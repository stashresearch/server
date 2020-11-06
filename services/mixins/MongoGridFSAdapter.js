"use strict";

const _ 			= require("lodash");
const Promise		= require("bluebird");
const mongodb 		= require("mongodb");
const MongoClient 	= mongodb.MongoClient;
const { ServiceSchemaError } = require("moleculer").Errors;
const { getError, errors } = require("./../config/errors");

class MongoGridFSAdapter {

    constructor(uri, opts, dbName) {
        this.uri = uri,
        this.opts = opts;
        this.dbName = dbName;
    }


    init(broker, service) {
        this.broker = broker;
        this.service = service;
        if (!this.service.schema.collection) {
            throw new ServiceSchemaError("Missing `collection` definition in schema of service!");
        }
    }

    connect() {
        this.client = new MongoClient(this.uri, this.opts);
        return this.client.connect().then(() => {
            this.db = this.client.db(this.dbName);
            this.bucket = new mongodb.GridFSBucket(this.db);
            this.collection = this.db.collection(this.service.schema.collection);

            this.service.logger.info("MongoDB adapter has connected successfully.");

            this.db.on("close", () => this.service.logger.warn("MongoDB adapter has disconnected."));
            this.db.on("error", err => this.service.logger.error("MongoDB error.", err));
            this.db.on("reconnect", () => this.service.logger.info("MongoDB adapter has reconnected."));
        });
    }

    disconnect() {
        if (this.client) {
            this.client.close();
        }
        return Promise.resolve();
    }

    upload(fileStream, fileName, options) {
        return new Promise((resolve, reject) => {
            fileStream.
            pipe(this.bucket.openUploadStream(fileName, options)).
            on('error', reject).
            on('finish', resolve);
        });
    }

    download(id, options) {
        return new Promise((resolve, reject) => {
            let stream = this.bucket.openDownloadStream(mongodb.ObjectID(id), options);
            const chunks = [];
            stream.on('data', chunk => {chunks.push(chunk)});
            stream.on('error', error => {
                if (error.code == "ENOENT") {
                    reject(getError(errors.NOT_FOUND, {message: "Data not found", id}));
                }
                reject(error)
            });
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        })
    }

    findById(id) {
        return this.collection.findOne({_id: mongodb.ObjectID(id)})
    }

}
module.exports = MongoGridFSAdapter;