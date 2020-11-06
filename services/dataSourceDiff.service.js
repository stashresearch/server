const DataSourceDiffSchema = require("./../common/models/DataSourceDiffSchema");
const mongoMixin = require("./mixins/mongo.mixin");
const _ = require("lodash");
const hash = require('object-hash');

module.exports = {
    name: 'dataSourceDiff',
    mixins: [mongoMixin],
    modelName: "DataSourceDiff",
    schema: DataSourceDiffSchema,
    actions: {
        create: {
            hooks: {
                after: ["scheduleDiffProcess"]
            }
        },
        createDiff: {
            params: {
                id: "string",
                dSId: "string",
                previousCSId: "string",
                cSId: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const previousChecksum = JSON.parse(await ctx.call("data.download", {id: ctx.params.previousCSId}));
                        const previousData = JSON.parse(await ctx.call("data.download", {id: ctx.params.previousFileId}));
                        const currentChecksum = JSON.parse(await ctx.call("data.download", {id: ctx.params.cSId}));
                        const currentData = JSON.parse(await ctx.call("data.download", {id: ctx.params.fileId}));
                        const previousKeys = Object.keys(previousChecksum);
                        const currentKeys = Object.keys(currentChecksum);
                        const origKeysToRowKeysPrevious = this.getOrigKeys(previousKeys);
                        const origKeysToRowKeysCurrent = this.getOrigKeys(currentKeys);
                        const setDiff = this.createSetOperations(Object.keys(origKeysToRowKeysPrevious), Object.keys(origKeysToRowKeysCurrent));
                        this.logger.debug("Key differences", {diff: setDiff});
                        const rowKeysDeleted = Object.values(_.pick(origKeysToRowKeysPrevious, setDiff.onlyFirst));
                        const rowKeysAdded = Object.values(_.pick(origKeysToRowKeysCurrent, setDiff.onlySecond));
                        let cellValueChanges = [];
                        const columnsMapping = previousChecksum[previousKeys[0]].reduce((accumulator, column, index) => {
                            const currentColumnIndex = currentChecksum[currentKeys[0]].findIndex(el => el == column);
                            accumulator[index] = currentColumnIndex;
                            return accumulator;
                        }, {});
                        for (const mutualOrigRowId of setDiff.intersection) {
                            const previousRow = previousChecksum[origKeysToRowKeysPrevious[mutualOrigRowId]];
                            const currentRow = currentChecksum[origKeysToRowKeysCurrent[mutualOrigRowId]];
                            if (hash(previousRow) != hash(currentRow)) {
                                for (const columnIndex of Object.keys(columnsMapping)) {
                                    const previousChecksumValue = previousRow[columnIndex];
                                    const currentChecksumValue = currentRow[columnsMapping[columnIndex]];
                                    if (previousChecksumValue != currentChecksumValue) {
                                        const cellValueChange = {
                                            rowId: mutualOrigRowId,
                                            columnName: previousChecksum[previousKeys[0]][columnIndex],
                                            previousValue: previousData[origKeysToRowKeysPrevious[mutualOrigRowId]][columnIndex],
                                            currentValue: currentData[origKeysToRowKeysCurrent[mutualOrigRowId]][columnsMapping[columnIndex]]
                                        };
                                        cellValueChanges.push(cellValueChange);
                                        this.logger.warn("Value diff", {cellValueChange});
                                    }
                                }
                            }
                        }
                        const message = rowKeysAdded.length + " rows added, " + rowKeysDeleted.length + " rows deleted, " + cellValueChanges.length + " cell value changes.";
                        await ctx.call("dataSourceDiff.update", {id: ctx.params.id,
                                addedRowIds: rowKeysAdded,
                                deletedRowIds: rowKeysDeleted,
                                deletedRows: _.pick(previousData, rowKeysDeleted),
                                cellValueChanges,
                                message
                        });


                        resolve()
                    } catch(error) {
                        reject(error)
                    }
                })
            }
        }
    },
    methods: {
        scheduleDiffProcess(ctx, res) {
            ctx.call("dataQueue.createDiff", res);
        },
        getOrigKeys(keyValues) {
            let keyMapping = {};
            for (const [i, keyValue] of keyValues.entries()) {
                if (i > 0) { // header row
                    const keyParts = keyValue.toString().split("_");
                    const rowNumber = keyParts.shift();
                    const key = keyParts.join();
                    keyMapping[key ? key : rowNumber] = keyValue
                }
            }
            return keyMapping
        },
        createSetOperations(array1, array2) {
            return array1.reduce((accumulator, previousValue) => {
                let i = accumulator.onlySecond.indexOf(previousValue);
                if (i > -1) {
                    accumulator.intersection.push(previousValue);
                    accumulator.onlySecond.splice(i, 1);
                } else {
                    accumulator.onlyFirst.push(previousValue)
                }
                return accumulator
            }, {onlyFirst: [], intersection: [], onlySecond: array2});
        }
    }
};
