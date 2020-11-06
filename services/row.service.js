
const _ = require("lodash");
const mongoMixin = require("./mixins/mongo.mixin");
const rowSchema = require("./../common/models/RowSchema");

module.exports = {
    name: "row",
    mixins: [mongoMixin],
    modelName: "Row",
    schema: rowSchema,
    settings: {
        populates: {
            cells: "cell.get"
        }
    },
    actions: {
        get: {
            hooks: {
                before: ["getParams"]
            }
        },
        getData: {
            params: {
                dataSourceId: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const rows = await ctx.call("row.findCurrent", ctx.params);
                        const rowIds = _.map(rows, "id");
                        resolve(await ctx.call("row.get", {id: rowIds}))
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        /*findCurrentByKey: {
            handler(ctx) {
                return ctx.call("row.find", {query: {
                        dataSourceId: ctx.params.dataSourceId,
                        key: ctx.params.key,
                        deletedAt: {$exists: false}
                    }})
            }
        },*/
        findCurrent: {
            handler(ctx) {
                const query = {
                    dataSourceId: ctx.params.dataSourceId,
                    deletedAt: {$exists: false}
                };
                if (ctx.params.rowIds) query._id = {$in: ctx.params.rowIds};
                return ctx.call("row.find", {query: query, ...ctx.params})
            }
        },
        /*merge: {
            params: {
                dataSourceId: "string",
                currentRows: "array",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSourceId = ctx.params.dataSourceId;
                        const oldRows = await ctx.call("row.findCurrent", {dataSourceId});
                        const currentRows = ctx.params.currentRows;
                        for (const oldRow of oldRows) {
                            let idx = currentRows.findIndex(currentRow => currentRow.key == oldRow.key);
                            if (idx < 0) { // old not found in current
                                await ctx.call("row.update", {id: oldRow.id, deletedAt: new Date()});
                                for (const cell in oldRow.cells) {
                                    await ctx.call("cell.update", {id: cell, deletedAt: new Date()});
                                }
                            } else { // row already exists
                                if(currentRows[idx].checksum != oldRow.checksum) { // there is a cell change
                                    const cells = await ctx.call("cell.merge", {currentCells: currentRows[idx].cells, rowId: oldRow.id, dataSourceId});
                                    await ctx.call("row.update", {id: oldRow.id, checksum: currentRows[idx].checksum, cells: _.map(cells, "id")})
                                }
                                currentRows.splice(idx, 1); // element already exists and no change
                            }
                        }
                        for (const newRow of currentRows) { // remaining currentRows => new rows to add
                            const newRowDb = await ctx.call("row.create", {
                                key: newRow.key,
                                checksum: newRow.checksum,
                                dataSourceId: newRow.dataSourceId,
                                participantKey: newRow.participantKey,
                            });
                            const cells = await ctx.call("cell.merge", {currentCells: newRow.cells, rowId: newRowDb.id, dataSourceId});
                            await ctx.call("row.update", {id: newRowDb.id, cells: _.map(cells, "id")})
                        }
                        const newRows = await ctx.call("row.findCurrent", {dataSourceId});
                        resolve(newRows)
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        }*/
    },
    methods: {
        getParams(ctx) {
            ctx.params.populate = ["cells"]
        }
    }
};
