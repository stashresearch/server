const _ = require("lodash");
const mongoGridMixin = require("./mixins/mongoGridFS.mixin");
const { getError, errors } = require("./config/errors");
const hash = require('object-hash');
const openpgp = require('openpgp');

module.exports = {
    name: "data",
    mixins: [mongoGridMixin],
    actions: {
        checkAndPrepare: {
            params: {
                dataSource: "object",
                //columns: "array",
                data: "array",
                previousChecksum: "object|optional",
                checksum: "array|optional",
                fromUpload: "boolean|optional",
                encryptionKey: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const data = ctx.params.data;
                        if (data && data[0]) {
                            data[0] = _.map(data[0], this.removeExtraSpacing);
                        }
                        const checksum = ctx.params.checksum;
                        if (checksum && checksum[0]) {
                            checksum[0] = _.map(checksum[0], this.removeExtraSpacing);
                        }
                        const previousColumns = ctx.params.dataSource.columns;
                        const previousChecksum = ctx.params.previousChecksum;
                        const fromUpload = ctx.params.fromUpload;

                        //checking for data structure change
                        //const previousColumnNames = _.map(previousColumns, (column) => this.removeExtraSpacing(column.name));
                        const previousColumnNames = _.map(previousColumns, "name");
                        //const dataColumnsWOExtraSpaces = _.map(data[0], this.removeExtraSpacing);
                        //const checksumColumnsWOExtraSpaces = _.map(checksum[0], this.removeExtraSpacing)
                        if (!_.isEqual(_.sortBy(data[0]), _.sortBy(previousColumnNames)) || (checksum && !_.isEqual(_.sortBy(checksum[0]), _.sortBy(previousColumnNames)))) {
                            throw getError(errors.UNPROCESSED_REQUEST, {message: "Change in data structure", previousColumns: previousColumnNames, currentColumns: data[0]})
                        }
                        // check data & checksum cardinality
                        if (checksum && (data.length != checksum.length || data[0].length != checksum[0].length)) {
                            throw getError(errors.UNPROCESSED_REQUEST, {message: "Data and checksum array have different cardinality",
                                dataRowNumber: data.length, checksumRowNumber: checksum.length, dataColumnNumber: data[0].length, checksumColumnNumber: checksum[0].length})
                        }

                        let orderedColumnDefinition =  data[0].map((column) => {
                        //let orderedColumnDefinition =  dataColumnsWOExtraSpaces.map((column) => {
                            return _.find(previousColumns, {name: column})
                        });
                        const updatedData = {};
                        const updatedChecksum = {};
                        const keyValues = [];
                        for (const [i, row] of data.entries()) {
                            const newDataRow = [];
                            const newChecksumRow = [];
                            let keyValue = i; // default key is row number, if key is set we calculate rowNumber + "_" + keyValue...
                            for (const [j, column] of data[0].entries()) {
                                if (orderedColumnDefinition[j].omit === false) {
                                    const cellValue = data[i][j] || "";
                                    const checksumValue = checksum && checksum[i][j] ? checksum[i][j] : hash(this.removeExtraSpacing(cellValue));
                                    if (orderedColumnDefinition[j].key === true) {
                                        keyValue = keyValue + "_" + this.removeExtraSpacing(cellValue)
                                    }
                                    newChecksumRow.push(checksumValue);
                                    newDataRow.push(orderedColumnDefinition[j].encrypt === true && i > 0 && !fromUpload ? ( // don't encrypt header
                                        (await openpgp.encrypt({
                                            message: openpgp.message.fromText(typeof cellValue === 'string' ? cellValue : JSON.stringify(cellValue)),
                                            publicKeys: (await openpgp.key.readArmored(ctx.params.encryptionKey)).keys,
                                        })).data
                                    ) : cellValue)
                                }
                            }
                            /*if (keyValue === i && previousChecksum && previousChecksum[keyValue] && hash(previousChecksum[i]) != hash(newChecksumRow)) { // if key is row number, compare checksum data with previous checksum (if exists)
                                // TODO don't throw error if just column reorder happened
                                this.logger.error({previousChecksum: previousChecksum[keyValue], updatedChecksum: newChecksumRow});
                                throw getError(errors.UNPROCESSED_REQUEST, {message: "No key set for dataset and data changed from previous version", rowNumber: i})
                            }*/
                            keyValues.push(keyValue);
                            updatedData[keyValue] = newDataRow;
                            updatedChecksum[keyValue] = newChecksumRow;
                        }
                        const origKeys = this.getOrigKeys(keyValues); // get key part or row number (if no key set) and remove header
                        if (origKeys.length > 0) { // cut prefix row number
                            const keyNotUnique = this.arrayDiff(origKeys, _.uniq(origKeys));
                            if (keyNotUnique.length != 0) { // if we have real key (not row number), check uniqueness
                                this.logger.error({origKeys: origKeys, uniqOrigKeys: _.uniq(origKeys)});
                                throw getError(errors.UNPROCESSED_REQUEST, {message: "Row keys not unique", keys: keyNotUnique})
                            }
                        }
                        resolve({data: updatedData, checksum: updatedChecksum})
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        /*save: {
            params: {
                data: "array",
                dataSourceId: "string",
                encryptionKey: "string",
                columns: "array",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSourceId = ctx.params.dataSourceId;
                        const columns = ctx.params.columns;
                        const keyColumn = _.get(_.find(columns, {key: true}), "name");
                        //const participantColumn = _.get(_.find(columns, {participantKey: true}), "name");
                        let currentRows = [];
                        let i = 0;
                        for (const inputRow of ctx.params.data) {
                            const rowChecksum = await ctx.call("util.hashObject", {input: inputRow});
                            const cells = [];
                            let keyValue = i++;
                            for (const inputCell of inputRow) {
                                const column = _.find(columns, {name: inputCell.columnName});
                                const cellValue = inputCell.value;
                                const checksum = inputCell.checksum;
                                let cell;
                                if (column.omit === false) { // not omitted columns
                                    cell = {
                                        columnId: column.id,
                                        columnName: column.name,
                                        checksum: checksum || await ctx.call("util.hashObject", {input: cellValue}),
                                        value: column.encrypt ? await ctx.call("util.encryptString", {
                                            toEncrypt: typeof cellValue === 'string' ? cellValue : JSON.stringify(cellValue),
                                            key: ctx.params.encryptionKey
                                        }) : cellValue
                                    };
                                    cells.push(cell)
                                }
                                if (keyColumn == column.name) {
                                    keyValue = cellValue
                                }
                                /!*if (participantColumn == column.name) {
                                    participantValue = cellValue
                                }*!/
                            }

                            currentRows.push({
                                key: keyValue,
                                //participantKey: participantValue,
                                checksum: rowChecksum,
                                dataSourceId,
                                cells
                            });
                        }
                        const data = await ctx.call("data.mergeRow", {dataSourceId, currentRows});
                        resolve(data)
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },*/
        mergeColumn: {
            params: {
                dataSourceId: "string|optional",
                keyColumn: "string|optional",
                //participantColumn: "string|optional",
                currentColumns: "array"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSourceId = ctx.params.dataSourceId;
                        const oldColumns = dataSourceId ? await ctx.call("column.findCurrent", {dataSourceId}) : [];
                        const currentColumns = ctx.params.currentColumns;
                        //const actions = [];
                        /*oldColumns.map(oldColumn => {
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
                        currentColumns.map(columnName => { // remaining currentColumns => new columns to add
                            actions.push({
                                action: "column.create",
                                params: {
                                    name: columnName,
                                    key: ctx.params.keyColumn == columnName ? true : false,
                                    //participantKey: ctx.params.participantColumn == columnName ? true : false,
                                    dataSourceId
                                }
                            });
                        });*/
                        //await ctx.mcall(actions);
                        for (const oldColumn of oldColumns) {
                            let idx = currentColumns.findIndex(column => column == oldColumn.name);
                            if (idx < 0) { // old not found in current
                                await ctx.call("column.update", {id: oldColumn.id, deletedAt: new Date()})
                            } else { // column already exists
                                currentColumns.splice(idx, 1); // element already exists, not a new column
                            }
                        }
                        for (const columnName of currentColumns) {
                            await ctx.call("column.create", {
                                name: columnName,
                                key: ctx.params.keyColumn == columnName ? true : false,
                                //participantKey: ctx.params.participantColumn == columnName ? true : false,
                                dataSourceId
                            });
                        }
                        const newColumns = ctx.call("column.findCurrent", {dataSourceId: ctx.params.dataSourceId});
                        resolve(newColumns);
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        updateColumn: {
            params: {
                omit: "boolean|optional",
                encrypt: "boolean|optional",
                $$strict: "remove"
            },
            handler(ctx) {
                if (ctx.params.omit) {
                    ctx.call("cell.deleteByColumn", {cId: ctx.params.id});
                }
                if(ctx.params.encrypt) {

                }
                return ;
            }
        },
        mergeRow: {
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
                                if(currentRows[idx].checksum != oldRow.checksum) { // there is a cell (or omit, encrypt) change
                                    const cells = await ctx.call("data.mergeCell", {currentCells: currentRows[idx].cells, rowId: oldRow.id, dataSourceId});
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
                                //participantKey: newRow.participantKey,
                            });
                            const cells = await ctx.call("data.mergeCell", {currentCells: newRow.cells, rowId: newRowDb.id, dataSourceId});
                            await ctx.call("row.update", {id: newRowDb.id, cells: _.map(cells, "id")})
                        }
                        const newRows = await ctx.call("row.findCurrent", {dataSourceId});
                        resolve(newRows)
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        mergeCell: {
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
                                await ctx.call("cell.update", {id: oldCell.id, dAt: new Date()});
                            } else {
                                if (currentCells[idx].checksum != oldCell.cS) {
                                    await ctx.call("cell.create", {
                                        v: currentCells[idx].value,
                                        cS: currentCells[idx].checksum,
                                        rId: ctx.params.rowId,
                                        cId: oldCell.cId,
                                        dSId: ctx.params.dataSourceId,
                                        co: oldCell.co // comment if any
                                    });
                                }
                                currentCells.splice(idx, 1); // cell already exists and no change
                            }
                        }
                        for (const newCell of currentCells) { // remaining currentCells => new cell to add
                            await ctx.call("cell.create", {
                                v: newCell.value,
                                cS: newCell.checksum,
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
        },
        /*get: {
            params: {
                id: "string",
                rowFilter: "array|optional",
                columnFilter: "array|optional"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const filters = {
                            rowFilter: ctx.params.rowFilter,
                            columnFilter: ctx.params.columnFilter,
                            dataSourceId: ctx.params.id
                        };
                        const columns = await ctx.call("column.findCurrent", filters);
                        const columnsWOOmitted = _.filter(columns, {omit: false});
                        //const data = await ctx.call("cell.getData", ctx.params);
                        const data = await ctx.call("row.getData", filters);
                        resolve({meta: columnsWOOmitted, data})
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },*/
        get: {
            params: {
                id: "any"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const data = ctx.call("data.download", ctx.params)

                    } catch (error) {

                    }
                });
            }
        },
        getCSV: {
            params: {
                dataSourceId: "string",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const data = await ctx.call("data.get", ctx.params);
                        const dataToCSV = [];
                        dataToCSV.push(data.meta.map(c => c.name));
                        for (let i = 0; i < data.data.length; i++) {
                            const row = data.data[i].cells;
                            dataToCSV.push(row.map(r => r.v))
                        }
                        const csv = await ctx.call("util.arrayToCSV", {array: dataToCSV});
                        resolve(csv)
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        }
    },
    methods: {
        arrayDiff(array1, array2) {
            return array1.filter(x => {
                let i = array2.indexOf(x);
                if (i > -1) {
                    array2.splice(i, 1);
                    return false
                }
                return !array2.includes(x);
            });
        },
        getOrigKeys(keyValues) {
            return keyValues.map(keyValue => {
                const keyParts = keyValue.toString().split("_");
                const rowNumber = keyParts.shift();
                const key = keyParts.join();
                return key ? key : rowNumber
            }).splice(1);
        },
        removeExtraSpacing(string) {
            return string.trim().replace(/(\s+)/g, " ")
        }
    }
};