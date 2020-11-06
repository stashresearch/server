"use strict";
const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const mongoose = require("mongoose");
const {getError, errors} = require("./../config/errors");
const _ = require("lodash");

module.exports = {
    name: "",
    mixins: [DbService],
    idField: "id",
    adapter: new MongooseAdapter("mongodb://localhost/stash", {
        useUnifiedTopology: true,
        useNewUrlParser: true,
        keepAlive: true
    }),
    hooks: {
        before: {
            //create: ["addDateFields"],
            //update: ["updateDateFields"]
        }
    },
    actions: {
        getUnique: {
            params: {
                query: {
                    type: "object"
                },
                mustExist: {
                    type: "boolean",
                    default: true,
                    optional: true
                }
            },
            async handler(ctx) {
                const query = ctx.params.query;
                let results;
                if (query.id) {
                    query._id = mongoose.Types.ObjectId(query.id)
                }
                const uniqueCondition = _.pickBy(_.pick(query, this.settings._ids), _.identity); // pick ID attributes with not null/undef values
                results = await ctx.call(this.name + ".find", {query: uniqueCondition});

                function notExists(ctx, condition) {
                    if (ctx.params.mustExist) {
                        return Promise.reject(getError(errors.NOT_FOUND, {condition}))
                    } else {
                        return Promise.resolve({})
                    }
                }

                if (!uniqueCondition) {
                    return notExists(ctx, uniqueCondition)
                } else if (results.length == 0) {
                    return notExists(ctx, uniqueCondition)
                } if (results.length == 1) {
                    return Promise.resolve(results[0])
                } else {
                    return Promise.reject(getError(errors.UNPROCESSED_REQUEST, {uniqueCondition}));
                }
            }
        },
        updateOne: {
            params: {
                mongoKey: "object",
                mongoUpdate: "object"
            },
            async handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const update = await this.adapter.model.updateOne(ctx.params.mongoKey, ctx.params.mongoUpdate);
                        if (update.n < 1)
                            return reject(getError(errors.NOT_FOUND, {condition: ctx.params.mongoKey}));
                        else if (update.n > 1)
                            return reject(getError(errors.UNPROCESSED_REQUEST, {condition: ctx.params.mongoKey, message: "not unique condition"}));
                        resolve(this.adapter.find({query: ctx.params.mongoKey})
                            .then(docs => this.transformDocuments(ctx, {}, docs[0]))
                            .then(json => this.entityChanged("updated", json, ctx).then(() => json)));
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        }
    },
    methods: {},
    created() {
        //console.log(this.schema.schema);
    }
};
