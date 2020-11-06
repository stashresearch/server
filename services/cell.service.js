const _ = require("lodash");
const mongoMixin = require("./mixins/mongo.mixin");
const cellSchema = require("./../common/models/CellSchema");
const ObjectId = require('mongoose').Types.ObjectId;

module.exports = {
    name: "cell",
    mixins: [mongoMixin],
    modelName: "Cell",
    schema: cellSchema,
    //model: cellSchema,
    actions: {
        findByColumn: {
            params: {
                cId: "string"
            },
            handler(ctx) {
                return ctx.call("cell.find", {query: {
                        cId: ctx.params.cId
                    }})
            }
        },
        findCurrentByRow: {
            params: {
                rId: "string"
            },
            handler(ctx) {
                return ctx.call("cell.find", {query: {
                        rId: ctx.params.rId,
                        dAt: {$exists: false}
                    }})
            }
        },
        deleteByColumn: {
            params: {
                cId: "string"
            },
            async handler(ctx) {
                const cells = await ctx.call("cell.findByColumn", ctx.params);
                const actions = cells.map(cell => {
                    return {
                        action: "cell.remove",
                        params: {id: cell.id}
                    }
                });
                return ctx.mcall(actions);
            }
        },
        encryptByColumn: {
            params: {
                cId: "string"
            },
            async handler(ctx) {
                const cells = await ctx.call("cell.findByColumn", ctx.params);
                const actions = cells.map(cell => {
                    return {
                        action: "cell.remove",
                        params: {id: cell.id}
                    }
                });
            }
        },
        /*merge: {
            params: {
                rowId: "string",
                currentCells: "array",
                dataSourceId: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const oldCells = await ctx.call("cell.findCurrentByRow", {rId: ctx.params.rowId});
                        const currentCells = ctx.params.currentCells;
                        for (const oldCell of oldCells) {
                            const idx = currentCells.findIndex(currentCell => currentCell.columnId == oldCell.cId);
                            if (idx < 0) { // cell not found, delete cell
                                await ctx.call("cell.update", {id: oldCell.id, deletedAt: new Date()});
                            } else {
                                if (currentCells[idx].value != oldCell.v) {
                                    await ctx.call("cell.create", {
                                        v: currentCells[idx].value,
                                        rId: ctx.params.rowId,
                                        cId: oldCell.cId,
                                        dSId: ctx.params.dataSourceId
                                    });
                                }
                                currentCells.splice(idx, 1); // cell already exists and no change
                            }
                        }
                        for (const newCell of currentCells) { // remaining currentCells => new cell to add
                            await ctx.call("cell.create", {
                                v: newCell.value,
                                rId: ctx.params.rowId,
                                cId: newCell.columnId,
                                dSId: ctx.params.dataSourceId
                            })
                        }
                        const newCells = await ctx.call("cell.findCurrentByRow", {rId: ctx.params.rowId});
                        resolve(newCells)
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },*/
        getData: {
            params: {
                dataSourceId: "string",
                rowFilter: {
                    type: "array",
                    optional: true,
                    items: {
                        type: "object",
                        props: {
                            columnId: "string",
                            values: "array"
                        }
                    }
                },
                columnFilter: {
                    type: "array",
                    optional: true,
                    items: "string"
                }
            },
            hooks: {
                before: ["dataQuery"]
            },
            handler(ctx) {
                ctx.params.aggregateQuery.push({
                    $match: {
                        "dAt": {$exists: false}
                    }
                });
                return this.adapter.model.aggregate(ctx.params.aggregateQuery)
            }
        },
        getHeatMap: {
            params: {
                dataSourceId: "string"
            },
            hooks: {
                before: ["dataQuery"]
            },
            async handler(ctx) {

                ctx.params.aggregateQuery.push(
                    {
                        '$sort': {
                            'createdAt': 1,
                            'updatedAt': 1
                        }
                    }, {
                        '$group': {
                            '_id': {
                                'rowId': '$rowId',
                                'columnId': '$columnId'
                            },
                            'count': {
                                '$sum': 1
                            },
                            'deletedAt': {
                                '$max': '$deletedAt'
                            }
                        }
                    }, {
                        '$replaceWith': {
                            '$mergeObjects': [
                                '$_id',
                                {
                                    'count': '$count',
                                    'deletedAt': '$deletedAt'
                                }
                            ]
                        }
                    });
                return  this.adapter.model.aggregate(ctx.params.aggregateQuery);
            }
        }
    },
    methods: {
        dataQuery(ctx) {
            const initialFilter = [
                {"dSId": new ObjectId(ctx.params.dataSourceId)},
            ];
            if (!_.isEmpty(ctx.params.rowFilter)) {
                const query = ctx.params.rowFilter.map(filter => {
                    return { cId: new ObjectId(filter.columnId), v: { $in: filter.values } }
                });
                initialFilter.push({"$or": query});
            }

            const aggregateQuery = [
                {
                    '$match': {
                        "$and": initialFilter
                    }
                }, {
                    '$group': {
                        '_id': null,
                        'rows': {
                            '$addToSet': '$rId'
                        }
                    }
                }, {
                    '$unwind': {
                        'path': '$rows'
                    }
                }, {
                    '$lookup': {
                        'from': 'cells',
                        'let': {
                            'row': '$rows'
                        },
                        'pipeline': [
                            {
                                '$match': {
                                    '$and': [
                                        {
                                            '$expr': {
                                                '$eq': [
                                                    '$rId', '$$row'
                                                ]
                                            }
                                        }, {
                                            'deletedAt': {
                                                '$exists': false
                                            }
                                        }
                                    ]
                                }
                            }
                        ],
                        'as': 'documents'
                    }
                }, {
                    '$unwind': {
                        'path': '$documents'
                    }
                }, {
                    '$replaceRoot': {
                        'newRoot': '$documents'
                    }
                }, {
                    '$project': {
                        _id: 0,
                        rowId: "$rId",
                        columnId: "$cId",
                        value: "$v",
                        createdAt: "$cAt",
                        updatedAt: "$uAt",
                        deletedAt: "$dAt"
                    }
                }
            ];
            const columnFilter = ctx.params.columnFilter;
            if (!_.isEmpty(columnFilter)) aggregateQuery.push({
                '$match': {
                    'cId': {"$nin": columnFilter.map(column => new ObjectId(column))}
                }
            });
            ctx.params.aggregateQuery = aggregateQuery;
        }
    }
};
