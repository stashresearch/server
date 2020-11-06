
//const _ = require("lodash");
const mongoMixin = require("./mixins/mongo.mixin");
const columnSchema = require("./../common/models/ColumnSchema");

module.exports = {
    name: "column",
    mixins: [mongoMixin],
    modelName: "Column",
    schema: columnSchema,
    actions: {
        findCurrent: {
            params: {
                dataSourceId: "string"
            },
            handler(ctx) {
                return ctx.call("column.find", {query: {
                        dataSourceId: ctx.params.dataSourceId,
                        deletedAt: {$exists: false}
                    }})
            }
        },
        /*merge: {
            params: {
                dataSourceId: "string|optional",
                keyColumn: "string",
                participantColumn: "string|optional",
                currentColumns: "array"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSourceId = ctx.params.dataSourceId;
                        const oldColumns = dataSourceId ? await ctx.call("column.findCurrent", {dataSourceId}) : [];
                        const currentColumns = ctx.params.currentColumns;
                        const actions = [];
                        oldColumns.map(oldColumn => {
                            let idx = currentColumns.findIndex(column => column == oldColumn.name);
                            if (idx < 0) { // old not found in current
                                actions.push({
                                   action: "column.update",
                                   params: {id: oldColumn.id, deletedAt: new Date()}
                                });
                            } else { // column already exists
                                currentColumns.splice(idx, 1); // element already exists, not a new column
                            }
                        });
                        currentColumns.map(columnName => { // remaining currentColums => new columns to add
                            actions.push({
                                action: "column.create",
                                params: {
                                    name: columnName,
                                    key: ctx.params.keyColumn == columnName ? true : false,
                                    participantKey: ctx.params.participantColumn == columnName ? true : false,
                                    dataSourceId
                                }
                            });
                        });
                        await ctx.mcall(actions);
                        const newColumns = ctx.call("column.findCurrent", {dataSourceId: ctx.params.dataSourceId});
                        resolve(newColumns);
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        }*/
    },
};
