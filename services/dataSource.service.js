'use strict';
const dataSourceSchema = require("./../common/models/DataSourceSchema");
const mongoMixin = require("./mixins/mongo.mixin");
const { getError, errors } = require("./config/errors");
const _ = require('lodash');
const { syncStatus, syncMethods, syncErrors, dataProviders, scheduleValues, gitRepoSyncStatus, messageTemplates, channels } = require('./config/config');
const cronParser = require('cron-parser');

module.exports = {
    name: 'dataSource',
    mixins: [mongoMixin],
    modelName: "DataSource",
    schema: dataSourceSchema,
    dependencies: ["project", "user", "googleApi", "formrApi"],
    settings: {
        populates: {
            "columns": "column.get"
        },
        defaultSyncLength: 24 * 3600 * 1000, // 1 day
        providerDefaultSync: {
            [dataProviders.GOOGLE]: {
                syncMethod: syncMethods.CONTINUOUS,
                schedule: scheduleValues.EVERY_DAY
            },
            [dataProviders.FORMR]: {
                syncMethod: syncMethods.PERIODIC,
                schedule: scheduleValues.EVERY_5_MINUTES
            },
            [dataProviders.FILEUPLOAD]: {
                syncMethod: syncMethods.MANUAL
            },
        },
        defaultKey: { // TODO add entryId param to the surveys
            [dataProviders.GOOGLE]: "Timestamp",
            [dataProviders.FORMR]: "session",
        }
    },
    actions: {
        get: {
            hooks: {
                before: ["setPopulateParam"]
            }
        },
        getDataSource: {
            hooks: {
                before: ["getDataSource"],
            },
            handler(ctx) {
                return ctx.meta.dataSource
            }
        },
        findProjectDS: {
            hooks: {
                before: ["setListParam"]
            },
            handler(ctx) {
                return ctx.call("dataSource.find", ctx.params);
            }
        },
        findAllDSByUser: { // find all which created by the user
            params: {
                createdByUserId: "string|optional",
                provider: "string|optional"
            },
            handler(ctx) {
                if (!ctx.params.createdByUserId) ctx.params.createdByUserId = ctx.meta.user.id; // called from api or by other service
                return ctx.call("dataSource.find", {query: ctx.params})
            }
        },
        create: {
            params: {
                name: "string|optional",
                sourceId: "string|optional",
                sourceName: "string|min:1",
                sourceSurveyName: "string|optional|min:1",
                provider: {
                    type: "enum",
                    values: _.values(dataProviders)
                },
                sourceUrl: "string|optional",
                sourceEmbedUrl: "string|optional",
                syncMethod: {
                    type: "enum",
                    optional: true,
                    values: _.values(syncMethods),
                },
                schedulePattern: "string|optional",
                columnNames: {
                    type: "array",
                    optional: true,
                    items: {
                        type: "string",
                    }
                },
                projectId: "string"
            },
            hooks: {
                before: ["getProject", "checkInitialParams", "creationInitialParams"],
                after: ["downloadDataStructure"]
                //after: ["downloadData", "startSync"]
            },
        },
        setup: {
            params: {
                key: "string|optional", // id of the key column
                omit: "array|optional",
                personalData: "array|optional"
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let actions = [];
                        for (const column of ctx.meta.dataSource.columns) {
                            let update = {
                                id: column.id,
                                key: false,
                                omit: false,
                                encrypt: false
                            };
                            if (ctx.params.key && ctx.params.key == column.id) {
                                update.key = true
                            }
                            if (ctx.params.omit && ctx.params.omit.indexOf(column.id) > -1) {
                                update.omit = true
                            }
                            if (ctx.params.personalData && ctx.params.personalData.indexOf(column.id) > -1) {
                                update.encrypt = true
                            }
                            if (update.key == true && (update.omit == true || update.encrypt == true)) {
                                this.logger.error("Key column is to omit or encrypt", {column: update});
                                throw getError(errors.UNPROCESSED_REQUEST, {message: "Key column is to omit or encrypt", column: update})
                            }
                            if (update.key !== column.key || update.omit !== column.omit || update.encrypt !== column.encrypt) {
                                actions.push({
                                    action: "column.update",
                                    params: update
                                });
                            }
                        }
                        await ctx.mcall(actions);
                        await ctx.call("dataSource.startSync", {id: ctx.params.id});
                        const dS = await ctx.call("dataSource.get", {id: ctx.params.id});
                        resolve(dS);
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        remove: {
            params: {
                id: "string"
            },
            hooks: {
                before: ["getDataSource", "stopSyncBeforeDelete"]
            },
            /*handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSource = ctx.meta.dataSource;
                        const dataSourceId = dataSource.id;
                        // TODO: authorize in the api?
                        await ctx.call('dataSource.stopSync', dataSource);
                        await this._remove(dataSourceId);
                        resolve({});
                    } catch (error) {
                        reject(error)
                    }
                });
            }*/
        },
        upload: { // TODO validation data array element is an object, each key of the object is within columnNames
            params: {
                data: "array",
                checksum: "array",
                columnNames: {
                    type: "array",
                    items: {
                        type: "string"
                    }
                }
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let columns = ctx.params.columnNames;
                        let data = [columns, ...ctx.params.data];
                        let checksum = [columns, ...ctx.params.checksum];
                        /*for (let j = 0; j < ctx.params.data.length; j++) {
                            const row = ctx.params.data[j];
                            let newRow = [];
                            if (row.length != columns.length) {
                                throw getError(errors.BAD_REQUEST, {message: "Number of row items and column names are different", row: j, rowLength: row.length, columnLength: columns.length})
                            }
                            for (let i = 0; i < row.length; i++) {
                                newRow.push({columnName: columns[i], value: row[i], checksum: ctx.params.checksum[j][i]})
                            }
                            data.push(newRow)
                        }*/
                        /*const data = ctx.params.data.map((row) => Object.keys(row).map(key => {
                            return {columnName: key, value: row[key]}
                        }));*/
                        resolve(await ctx.call("dataSource.saveData", {dataSource: ctx.meta.dataSource, data, checksum,
                            //columns,
                            fromUpload: true},  {timeout: 0}))
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        download: {
            params: {
                id: "string"
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    let dataSource;
                    try {
                        dataSource = ctx.meta.dataSource;
                        const response = await ctx.call(dataSource.provider + "Api.downloadData", {user: {id: dataSource.createdByUserId.toString()}, ...dataSource}, {timeout: 60000});
                        //const data = await ctx.call("dataSource.saveData", {dataSource, data: response.data, columns: response.meta.columns, sourceName: response.sourceName})
                        let data;
                        try {
                            data = await ctx.call("dataSource.saveData", {dataSource, data: response.data,
                                //columns: response.meta.columns,
                                sourceName: response.sourceName})
                        } catch(error) {
                            if (error.type == errors.UNPROCESSED_REQUEST.type) {
                                const user = await ctx.call("user.get",{id: dataSource.createdByUserId.toString()});
                                ctx.call("dataSource.brokenSync", {id: dataSource.id, syncError: syncErrors.DATA_VERIFICATION_ERROR});
                                ctx.call('messageQueue.sendMessage', {toUser: user, template: messageTemplates.DATAVERIFICATIONERROR, channel: channels.EMAIL, urlParams: error.data});
                            }
                            reject(error)
                        }
                        resolve(data)
                    } catch (error) {
                        this.handleProviderErrors(error, dataSource);
                        reject(error)
                    }
                })
            }
        },
        checkColumns: {
            params: {
                data: "array",
                checksum: "array",
                columnNames: {
                    type: "array",
                    items: {
                        type: "string"
                    }
                }
            },
            hooks: {
                before: ["getDataSource"] // TODO check checksum - columnNames dimension integrity, check key presence + checksum uniqueness for key
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const oldColumns = ctx.meta.dataSource.columns;
                        const oldColumnNames = _.map(oldColumns, "name");
                        const newColumnNames = ctx.params.columnNames;


                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        dryrun: {
            params: {
                data: "array", //array of arrays
                checksum: "array", //array of arrays
                columnNames: {
                    type: "array",
                    items: {
                        type: "string"
                    }
                }
            },
            hooks: {
                before: ["getDataSource"] // TODO check checksum - columnNames dimension integrity, check key presence + checksum uniqueness for key
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSource = ctx.meta.dataSource;
                        const oldColumns = dataSource.columns; //ctx.call("column.findCurrent", {dataSourceId: dataSource.id});
                        let oldColumnsRemaining = [...oldColumns];
                        const newColumnNames = ctx.params.columnNames;
                        const columnMergeResult = [];
                        // handle the unambigious cases (1 old - 1 new column mapping, no column duplicates
                        for (const newColumn of newColumnNames) {
                            let oldColumnsFound = _.filter(oldColumns, {name: newColumn});
                            let newColumnsDuplicates = newColumnNames.filter(columnName => columnName == newColumn);
                            if (oldColumnsFound.length == 1 && newColumnsDuplicates.length == 1) { // unambiguous matching of new and old columns
                                columnMergeResult.push({
                                    name: newColumn,
                                    oldColumn: [oldColumnsFound[0]]
                                });
                                oldColumnsRemaining = _.filter(oldColumnsRemaining, (oldColumn) => {
                                    return oldColumn.id != oldColumnsFound[0].id
                                })
                            }
                        }
                        //
                        const oldData = await ctx.call("data.get", {dataSourceId: dataSource.id});
                        let newCells = [];
                        let columnsToMatch = [];
                        const keyColumnName = _.find(oldColumns, {key: true}).name;
                        const keyColumnIdx = newColumnNames.findIndex(column => column == keyColumnName);
                        for (let j = 0; j < ctx.params.checksum.length; j++) {
                            const rowChecksum = ctx.params.checksum[j];
                            const row = ctx.params.data[j];
                            const keyValue = row[keyColumnIdx];
                            const oldRow = _.find(oldData.data, {key: keyValue});
                            for (let i = 0; i < rowChecksum.length; i++) {
                                const newCell = {
                                    key: keyValue,
                                    columnName: newColumnNames[i],
                                    checksum: rowChecksum[i],
                                    oldRowId: oldRow ? oldRow.id : null,
                                };
                                const idx = columnMergeResult.findIndex(column => column.name == newColumnNames[i]);
                                if (idx > -1) { // column is unambiguous
                                    newCell.oldColumnId = columnMergeResult[idx].oldColumn[0].id;
                                    newCell.oldColumnName = columnMergeResult[idx].oldColumn[0].name;
                                    if (newCell.oldRowId) {
                                        const oldCell = _.find(oldRow.cells, (cell) => cell.cId.toString() == newCell.oldColumnId);
                                        newCell.oldCellId = oldCell.id;
                                        newCell.oldCellChecksum = oldCell.cS;
                                    }
                                } else {
                                    let column = _.find(columnsToMatch, {columnName: newColumnNames[i]});
                                    if (column) {
                                        column.totalRecords = column.totalRecords + 1;
                                    } else {
                                        column = {
                                            columnName: newColumnNames[i],
                                            totalRecords: 1,
                                            potentialOldColumns: []
                                        };
                                        columnsToMatch.push(column)
                                    }
                                    if (newCell.oldRowId) { // if old row is available, filter which old cells has same checksum (removing those old cells which column are already found unambiguously among new columns)
                                        for (const cell of oldRow.cells) {
                                            if (oldColumnsRemaining.findIndex(column => column.id == cell.cId.toString()) > -1) {
                                                let oldColumn = _.find(column.potentialOldColumns, {cId: cell.cId.toString()});
                                                if (oldColumn) {
                                                    oldColumn.totalOld = oldColumn.totalOld + 1;
                                                    if (cell.cS == newCell.checksum) {
                                                        oldColumn.found =  oldColumn.found + 1
                                                    }
                                                } else {
                                                    column.potentialOldColumns.push({
                                                        cId: cell.cId.toString(),
                                                        totalOld: 1,
                                                        found: 1
                                                    })
                                                }
                                            }
                                        }
                                    }
                                }
                                newCells.push(newCell)
                            }
                        }
                        const util = require('util');
                        console.log(util.inspect(columnsToMatch, false, null, true));

                        // pairing algorithm (option 1)
                        /*const graph = {};
                        for (let i = 0; i < columnsToMatch.length; i++) {
                            graph[i] = [];
                            for (const oldColumn of oldColumnsRemaining) {
                                const c = _.find(columnsToMatch[i].potentialOldColumns, {cId: oldColumn.id});
                                if (c && c.found == c.totalOld) {
                                    graph[i].push(c.cId);
                                }
                            }
                        }
                        const {hopcroftKarp} = require('hopcroft-karp');
                        const result = hopcroftKarp(graph);*/
                        //

                        // option 2
                        for (let i = 0; i < columnsToMatch.length; i++) {
                            const newColumn = columnsToMatch[i];
                            const columns = _.filter(newColumn.potentialOldColumns, (c) => {return c.totalOld == c.found});
                            if (columns.length > 0) {
                                const oldColumn = _.filter(oldColumns, (oC) => columns.findIndex(c => c.cId == oC.id) > -1);
                                columnMergeResult.push({name: newColumn.columnName, oldColumn});
                            } else {
                                columnMergeResult.push({name: newColumn.columnName, oldColumn: []})
                            }
                            /*if (columns && columns.length == 1) {
                                const oC = _.find(oldColumnsRemaining, {id:columns[0].cId})
                                columnMergeResult.push({name: newColumn.columnName, oldColumnId: oC.id, oldColumnName: oC.name})
                                //columnsToMatch.
                            }*/
                        }
                        //
                        //console.log(columnMergeResult)

                        resolve(columnMergeResult)
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        saveData: {
            params: {
                dataSource: "object",
                //columns: "array",
                data: "array",
                checksum: "array|optional",
                sourceName: "string|optional",
                fromUpload: "boolean|optional"
            },
            hooks: {
                before: ["getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    let dataSource;
                    try {
                        dataSource = ctx.params.dataSource;
                        const project = ctx.meta.project;
                        //const response = await ctx.call(dataSource.provider + "Api.downloadData", {user: {id: dataSource.createdByUserId.toString()}, ...dataSource}, {timeout: 60000});
                        const dataSourceId = dataSource.id;
                        //const columns = ctx.params.columns;
                        const data = ctx.params.data;
                        const checksum = ctx.params.checksum;
                        let previousChecksum;
                        if (dataSource.checksumId) {
                            previousChecksum = JSON.parse(await ctx.call("data.download", {id: dataSource.checksumId}));
                        }
                        const checkedData = await ctx.call("data.checkAndPrepare", {dataSource, data, previousChecksum, checksum, fromUpload: ctx.params.fromUpload, encryptionKey: project.publicKey});
                        /*const currentColumns = ctx.params.columns;
                        const columnNumber = currentColumns.length;
                        const columnChecksum = await ctx.call("util.hashObject", {input: currentColumns});
                        let columns = dataSource.columns;
                        if (columnChecksum != dataSource.columnChecksum) {
                            //const keyColumn = this.settings.defaultKey[dataSource.provider];
                            columns = await ctx.call("data.mergeColumn", {dataSourceId, currentColumns});
                        } else {
                            this.logger.debug("Columns not saved, no change since last download", {dataSourceId: dataSource.id, columnChecksum, checksumBefore: dataSource.columnChecksum})
                        }*/
                        const rowNumber = data.length;
                        const dataString = JSON.stringify(checkedData.data);
                        const checksumString = JSON.stringify(checkedData.checksum);
                        const dataChecksum = await ctx.call("util.hashObject", {input: dataString});
                        let lastModifiedAt;
                        //if (dataChecksum != dataSource.dataChecksum) {
                        //    lastModifiedAt = new Date();
                            //await ctx.call("data.save", {dataSourceId, encryptionKey: ctx.meta.project.publicKey, data, columns}, {timeout: 0});
                            //await ctx.call("dataQueue.save", {dataSourceId, encryptionKey: ctx.meta.project.publicKey, data, columns});
                        let uploadedData, uploadedChecksum;
                        //const initialUpload = !dataSource.dataChecksum;
                        const dataChanged = dataChecksum != dataSource.dataChecksum;
                        if (dataChanged) { // we check data checksum (not checksum of checksum array) because encryption changes only data, not checksum so checksum can be used to track underlying differences
                            lastModifiedAt = new Date();
                            uploadedData = await ctx.call("data.upload", {data: dataString, fileName: dataSource.name, metadata: {dataSourceId: dataSource.id}});
                            uploadedChecksum = await ctx.call("data.upload", {data: checksumString, fileName: dataSource.name, metadata: {dataSourceId: dataSource.id}});
                            if (dataSource.checksumId) {
                                await ctx.call("dataSourceDiff.create", {dSId: dataSource.id, previousCSId: dataSource.checksumId, previousFileId: dataSource.fileId, cSId: uploadedChecksum._id, fileId: uploadedData._id});
                            }
                        } else {
                            this.logger.debug("Data not saved, no change since last download", {dataSourceId: dataSource.id, dataChecksum, checksumBefore: dataSource.dataChecksum})
                        }
                        dataSource = await ctx.call("dataSource.update", {
                            id: dataSourceId,
                            sourceName: ctx.params.sourceName || dataSource.sourceName,
                            lastDownloadedAt: new Date(),
                            lastModifiedAt: lastModifiedAt || dataSource.lastModifiedAt,
                            rowNumber,
                            fileId: dataChanged ? uploadedData._id : dataSource.fileId,
                            checksumId: dataChanged ? uploadedChecksum._id : dataSource.checksumId,
                            dataChecksum
                        });
                        if (dataChanged || !dataSource.gitSha) { // sync data to git provider if it has been changed or not gitSha exists
                            await ctx.call("dataSource.gitUpload", {id: dataSource.id})
                        }
                        resolve(dataSource)
                    } catch(error) {
                        reject(error)
                    }
                })
            }
        },
        /*download: { // TODO to delete -> instead we use saveData
            params: {
                id: "string"
            },
            hooks: {
                before: ["getDataSource", "getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    let dataSource;
                    try {
                        dataSource = ctx.meta.dataSource;
                        const response = await ctx.call(dataSource.provider + "Api.downloadData", {user: {id: dataSource.createdByUserId.toString()}, ...dataSource}, {timeout: 60000});
                        const dataSourceId = dataSource.id;

                        const currentColumns = response.meta.columns;
                        const columnNumber = currentColumns.length;
                        const columnChecksum = await ctx.call("util.hashObject", {input: currentColumns});
                        let columns = dataSource.columns;
                        if (columnChecksum != dataSource.columnChecksum) {
                            const keyColumn = this.settings.defaultKey[dataSource.provider];
                            const participantColumn = this.settings.defaultParticipant[dataSource.provider];
                            columns = await ctx.call("data.mergeColumn", {dataSourceId, currentColumns, keyColumn, participantColumn});
                        } else {
                            this.logger.debug("Columns not saved, no change since last download", {dataSourceId: dataSource.id, columnChecksum, checksumBefore: dataSource.columnChecksum})
                        }

                        const data = response.data;
                        const rowNumber = data.length;
                        const dataChecksum = await ctx.call("util.hashObject", {input: data});
                        let lastModifiedAt;
                        if (dataChecksum != dataSource.dataChecksum) {
                            lastModifiedAt = new Date();
                            await ctx.call("data.save", {dataSourceId, encryptionKey: ctx.meta.project.publicKey, data, columns});
                        } else {
                            this.logger.debug("Data not saved, no change since last download", {dataSourceId: dataSource.id, dataChecksum, checksumBefore: dataSource.dataChecksum})
                        }
                        dataSource = await ctx.call("dataSource.update", {
                            id: dataSourceId,
                            sourceName: response.sourceName || dataSource.sourceName,
                            columns: _.map(columns, "id"),
                            lastDownloadedAt: new Date(),
                            lastModifiedAt: lastModifiedAt || dataSource.lastModifiedAt,
                            columnNumber,
                            columnChecksum,
                            rowNumber,
                            dataChecksum
                        });
                        resolve(dataSource)
                    } catch(error) {
                        this.handleProviderErrors(error, dataSource);
                        reject(error)
                    }
                })
            }
        },*/
        startSync: {
            params: {
                id: "string",
            },
            hooks: {
                before: ["getDataSource", "startSyncDefaults"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    let dataSource = ctx.meta.dataSource;
                    try {
                        await this.stopSync(dataSource, async function () {});
                        if (dataSource.syncStatus == syncStatus.BROKEN) { // check whether accessToken exists, if it does, continue
                            await ctx.call(dataSource.provider + "Api.refreshAccessToken", {user: {id: dataSource.createdByUserId.toString()}});
                        }
                        if ((ctx.params.provider || dataSource.provider) != dataProviders.FILEUPLOAD) {
                            await ctx.call("dataSource.download", {id: dataSource.id}, {timeout: 60000}); // initial download
                        }
                        if ((ctx.params.syncMethod || dataSource.syncMethod) != syncMethods.MANUAL) { // schedule future downloads
                            await ctx.call("downloadQueue.syncSchedule", {
                                id: dataSource.id,
                                schedulePattern: ctx.params.schedulePattern || dataSource.schedulePattern,
                                syncMethod: ctx.params.syncMethod || dataSource.syncMethod,
                                syncExpiresAt: ctx.params.syncExpiresAt || dataSource.syncExpiresAt
                            });
                        }

                        dataSource = await ctx.call("dataSource.update", ctx.params);
                        resolve(dataSource)
                    } catch(error) {
                        this.handleProviderErrors(error, dataSource);
                        reject(error)
                    }
                })
            }
        },
        restartSync: {
            params: {
                id: "string"
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    let dataSource = ctx.meta.dataSource;
                    try {
                        const cronExpression = cronParser.parseExpression(dataSource.schedulePattern);
                        const nextScheduleDate = new Date(cronExpression.next());
                        let response = await ctx.call(dataSource.provider + "Api.startSync", Object.assign({}, dataSource, {user: {id: dataSource.createdByUserId.toString()}}, {syncExpiresAt: nextScheduleDate}));
                        dataSource = await ctx.call("dataSource.update", {
                            id: dataSource.id,
                            sourceResourceId: response ? response.resourceId : dataSource.sourceResourceId
                        });
                        resolve(dataSource);
                    } catch (error) {
                        this.handleProviderErrors(error, dataSource);
                        reject(error)
                    }
                });
            }
        },
        stopSync: {
            params: {
                id: "string"
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    let dataSource = ctx.meta.dataSource;
                    try {
                        await this.stopSync(dataSource, async function () {
                            dataSource = await ctx.call("dataSource.update", {
                                id: dataSource.id,
                                syncStatus: syncStatus.STOPPED,
                                syncExpiresAt: Date.now()
                            });
                        });
                        resolve(dataSource);
                    } catch(error) {
                        this.handleProviderErrors(error, dataSource);
                        reject(error)
                    }
                })
            }
        },
        brokenSync: {
            params: {
                id: "string",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let dataSource = await ctx.call("dataSource.get", ctx.params);
                        await ctx.call("downloadQueue.syncScheduleStop", dataSource);
                        dataSource = await ctx.call("dataSource.update", {
                            id: dataSource.id,
                            syncStatus: syncStatus.BROKEN,
                            syncError: ctx.params.syncError,
                            syncExpiresAt: Date.now()
                        });
                        resolve(dataSource);
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        brokenSyncAll: {
            params: {
                createdByUserId: "string",
                provider: {
                    type: "enum",
                    values: _.values(dataProviders)
                },
                syncError: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSources = await ctx.call("dataSource.findAllDSByUser", {
                            createdByUserId: ctx.params.createdByUserId,
                            provider: ctx.params.provider
                        });
                        const brokenSyncCalls = dataSources.map((dataSource) => {
                            return {
                                action: "dataSource.brokenSync",
                                params: {id: dataSource.id, syncError: ctx.params.syncError}
                            }
                        });
                        await ctx.mcall(brokenSyncCalls);
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        brokenSyncAuth: {
            params: {
                createdByUserId: "string",
                provider: {
                    type: "enum",
                    values: _.values(dataProviders)
                }
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        await ctx.call("dataSource.brokenSyncAll", {...ctx.params, syncError: syncErrors.AUTH_ERROR});
                        await ctx.call("user.deleteCredentials", {
                            id: ctx.params.createdByUserId,
                            provider: ctx.params.provider,
                            notifyReason: "Authentication error"
                        });
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        /*setupGit: {
            params: {
                cloneCommand: "string",
                provider: {
                    type: "enum",
                    values: _.values(gitProviders)
                }
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let dataSource = ctx.meta.dataSource;
                        const gitRepo = await ctx.call("git.getUserRepoFromClone", ctx.params);
                        if (gitRepo == dataSource.gitRepo && dataSource.gitSyncStatus == gitRepoSyncStatus.SYNCING) {
                            // TODO 'already set up' response to the client
                            resolve({})
                        } else {
                            await ctx.call("git.setupGitConnection", {...ctx.params, gitRepo});
                            dataSource = await ctx.call("dataSource.update", {id: dataSource.id, gitProvider: ctx.params.provider, gitRepo, gitSyncStatus: gitRepoSyncStatus.SYNCING});
                            await ctx.call("dataSource.gitUpload", dataSource);
                            resolve(dataSource)
                        }
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },*/
        gitUpload: {
            params: {
                id: "string"
            },
            hooks: {
                before: ["getDataSource", "getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    const dataSource = ctx.meta.dataSource;
                    const project = ctx.meta.project;
                    try {
                        if (project.gitRepo && project.gitProvider && project.gitSyncStatus == gitRepoSyncStatus.SYNCING && dataSource.gitSyncStatus != gitRepoSyncStatus.ERROR && dataSource.gitSyncStatus != gitRepoSyncStatus.STOPPED) {
                            const content = await ctx.call("dataSource.getCSV", dataSource);
                            const result = await ctx.call("git.updateFile", {fileName: dataSource.name + ".csv", content, gitRepo: project.gitRepo, sha: dataSource.gitSha});
                            await ctx.call("dataSource.update", {id: dataSource.id, gitSha: result.content.sha, gitSyncStatus: gitRepoSyncStatus.SYNCING, gitSyncStoppedAt: null, gitUploadAt: Date.now()});
                        }
                        resolve()
                    } catch (error) {
                        if (error.type == errors.GIT_CONFLICT_ERROR.type) {
                            await ctx.call("dataSource.update", {id: dataSource.id, gitSyncStatus: gitRepoSyncStatus.ERROR, gitSyncStoppedAt: Date.now()});
                        } else if (error.type == errors.GIT_AUTH_ERROR.type) {
                            await ctx.call("project.update", {id: project.id, gitSyncStatus: gitRepoSyncStatus.ERROR, gitSyncStoppedAt: Date.now()});
                        }
                        reject(error)
                    }
                })
            }
        },
        gitRemove: {
            params: {
                id: "string",
                gitRepo: "string",
                removeFiles: "boolean|optional",
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSource = ctx.meta.dataSource;
                        if (ctx.params.removeFiles) {
                            await ctx.call("git.removeFile", {...ctx.params, fileName: dataSource.name + ".csv"});
                        }
                        await ctx.call("dataSource.update", {id: dataSource.id, gitSyncStatus: gitRepoSyncStatus.STOPPED, gitSyncStoppedAt: Date.now(), gitSha: ctx.params.removeFiles ? null : dataSource.gitSha});
                        resolve();
                    } catch (e) {
                        reject(e)
                    }
                })
            }
        },
        getData: { // client format
            params: {
                id: "string",
                fileId: "string|optional"
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const dataSource = ctx.meta.dataSource;
                        const dataString = await ctx.call("data.download", {id: ctx.params.fileId || dataSource.fileId});
                        const data = JSON.parse(dataString);
                        const rowKeys = Object.keys(data);
                        const columns = dataSource.columns.filter((column) => column.omit == false);
                        const dataColumns = data[rowKeys[0]].map((columnName) => {return columns.find(c => c.name == columnName)});
                        const responseFormat = rowKeys.map(key => { return {cells: data[key].map((cellValue, i) => {return {v: cellValue, cId: dataColumns[i].id}})}}).slice(1);
                        resolve({data: responseFormat, meta: dataColumns})
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        getCSV: {
            params: {
                id: "string",
                name: "string"
            },
            hooks: {
                before: ["getDataSource"]
            },
            handler(ctx) {
                ctx.meta.$responseType = "text/csv";
                ctx.meta.$responseHeaders = {
                    "Content-Disposition": `attachment; filename="${ctx.params.name}.csv"`
                };
                return new Promise(async (resolve, reject) => {
                    try {
                        const fileId = _.get(ctx, "meta.dataSource.fileId");
                        if (fileId) {
                            const dataString = await ctx.call("data.download", {id: fileId});
                            const data = JSON.parse(dataString);
                            const csv = await ctx.call("util.arrayToCSV", {array: Object.values(data)});
                            resolve(csv)
                        } else { // if project is not set up, no fileId exists, give back empty string
                            resolve("")
                        }
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        getHistory: {
            params: {
                id: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const query = {
                            "dSId": ctx.params.id
                        };
                        const dataDiffs = await ctx.call("dataSourceDiff.find", {query});
                        resolve(dataDiffs)
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        /*updateColumns: {
            params: {
                id: "string",
                columns: "array"
            },
            handler(ctx) {
                return ctx.call("dataSource.update", {id: ctx.params.id, columns: ctx.params.columns})
            }
        }*/
    },
    methods: {
        setPopulateParam(ctx) {
            ctx.params.populate = ["columns"]
        },
        setListParam(ctx) {
            ctx.params.query = {
                projectId: ctx.params.id
            }
        },
        async getProject(ctx) {
            const projectId = (ctx.params.projectId || _.get(ctx, "meta.dataSource.projectId")).toString();
            ctx.meta.project = await ctx.call("project.get", {id: projectId});
        },
        async getDataSource(ctx) {
            ctx.meta.dataSource = await ctx.call("dataSource.get", ctx.params);
            /*const dataSource = _.get(ctx, "meta.dataSource");
            if (!dataSource || dataSource.id != ctx.params.id) {
                ctx.meta.dataSource = await ctx.call("dataSource.get", ctx.params);
            }*/
        },
        async checkInitialParams(ctx) {
            const provider = ctx.params.provider;
            if (provider == dataProviders.FORMR && !(ctx.params.sourceName && ctx.params.sourceSurveyName)) {
                throw getError(errors.VALIDATION_ERROR, [{type: 'required', message: "The 'sourceName' and 'sourceSurveyName' fields are required.", fields: ["sourceName", "sourceSurveyName"]}])
            }
            if (provider == dataProviders.FILEUPLOAD) {
                if (_.isEmpty(ctx.params.columnNames)) {
                    throw getError(errors.VALIDATION_ERROR, [{
                        type: 'required',
                        message: "The 'columnNames' field is required.",
                        field: "columnNames"
                    }]);
                }
                if(_.isEmpty(ctx.params.name)) {
                    throw getError(errors.VALIDATION_ERROR, [{
                        type: 'required',
                        message: "The 'name' field is required.",
                        field: "name"
                    }]);
                }
            }
            if (!_.get(ctx, "meta.project.publicKey")) {
                throw getError(errors.VALIDATION_ERROR, [{type: 'required', message: "No 'publicKey' in project document.", fields: ["publicKey"]}]);
            }
            const projectDataSources = await ctx.call("dataSource.findProjectDS", {id: _.get(ctx, "meta.project.id")});
            if (projectDataSources.findIndex(dS => dS.name == ctx.params.name) > -1) {
                throw getError(errors.VALIDATION_ERROR, {message: "DataSource name is not unique in the project."});
            }
        },
        async creationInitialParams(ctx) {
            if (ctx.params.name == "") delete ctx.params.name; // TODO why does Steven send empty string?
            const provider = ctx.params.provider;
            if (provider == dataProviders.GOOGLE) {
                ctx.params.name = ctx.params.sourceName
            } else if (provider == dataProviders.FORMR) {
                ctx.params.name = ctx.params.name || ctx.params.sourceName + "_" + ctx.params.sourceSurveyName
            }
            ctx.params.projectId = ctx.meta.project.id;
            ctx.params.createdByUserId = ctx.meta.user.id;
        },
        async startSyncDefaults(ctx) {
            ctx.params.provider = ctx.meta.dataSource.provider;
            await this.syncDefaultParams(ctx);
            //ctx.params.syncStatus = syncStatus.STARTED;
        },
        async syncDefaultParams(ctx) {
            const syncExpiresAt = await this.broker.call("util.getRandomDate", {start: new Date("9999-12-31 00:00:00:00"), end: new Date("9999-12-31 23:59:59:59")});
            syncExpiresAt.setMilliseconds(0); // because of cron which works on second basis
            Object.assign(ctx.params, this.settings.providerDefaultSync[ctx.params.provider]);
            if (ctx.params.syncMethod != syncMethods.MANUAL) {
                ctx.params.syncExpiresAt = syncExpiresAt;
                ctx.params.schedulePattern = this.createCronPattern(ctx.params.schedule, ctx.params.syncExpiresAt);
                ctx.params.syncStatus = syncStatus.STARTED;
                ctx.params.syncError = null;
            }
        },
        createCronPattern(schedule, syncExpiresAt) {
            let pattern;
            let scheduleElements = schedule.split(" ").reverse();
            switch (scheduleElements[0]) {
                case "minute":
                    pattern = syncExpiresAt.getUTCSeconds() +  " * * * * *";
                    break;
                case "minutes":
                    pattern = syncExpiresAt.getUTCSeconds() + " " + syncExpiresAt.getUTCMinutes()%scheduleElements[1] + "-59/" + scheduleElements[1] + " * * * *";
                    break;
                case "hour":
                    pattern = syncExpiresAt.getUTCSeconds() + " " + syncExpiresAt.getUTCMinutes() + " * * * *";
                case "hours":
                    pattern = syncExpiresAt.getUTCSeconds() + " " + syncExpiresAt.getUTCMinutes() + " " + syncExpiresAt.getUTCHours()%scheduleElements[1] + " -23/" + scheduleElements[1] + " * * *";
                    break;
                case "day":
                    pattern = syncExpiresAt.getUTCSeconds() + " " + syncExpiresAt.getUTCMinutes() + " " + syncExpiresAt.getUTCHours() + " * * *";
                    break;
            }
            return pattern;
        },
        async createDataSourceEvent(dataSource, params) {
            const dsEvent = await this.broker.call('dataSourceEvent.create', {
                ...(_.pick(dataSource.getPlain(), ['syncStatus', 'syncExpiresAt', 'syncMethod', 'schedule', 'schedulePattern'])),
                dataSourceId: dataSource.id,
                ...params
            });
            return dsEvent;
        },
        async handleProviderErrors(error, dataSource) {
            if (error.type == errors.PROVIDER_AUTH_ERROR.type) {
                await this.broker.call("dataSource.brokenSyncAuth", dataSource)
            }
            if (error.type == errors.DOWNLOAD_ERROR.type) {
                await this.broker.call("dataSource.brokenSync", {id: dataSource.id, syncError: syncErrors.NOT_FOUND})
            }
        },
        async stopSync(dataSource, callback) {
            if (dataSource.syncStatus == syncStatus.STARTED) {
                if (dataSource.syncMethod == syncMethods.CONTINUOUS) {
                    await this.broker.call(dataSource.provider + "Api.stopSync", {...dataSource, user: {id: dataSource.createdByUserId.toString()}});
                }
                await this.broker.call("downloadQueue.syncScheduleStop", dataSource);
                return callback()
            }
        },
        stopSyncBeforeDelete(ctx) {
            return ctx.call("dataSource.stopSync", {id: ctx.params.id});
        },
        async downloadDataStructure(ctx, res) {
            return new Promise(async (resolve, reject) => {
                try {
                    let columns, keyColumn;
                    if (ctx.params.columnNames) { // if columns are provided
                         columns = ctx.params.columnNames;
                    } else {
                        const response = await ctx.call(ctx.params.provider + "Api.downloadData", {user: {id: ctx.meta.user.id}, ...ctx.params}, {timeout: 60000});
                        columns = response.meta.columns;
                        keyColumn = response.meta.keyColumn;
                    }
                    const columnModels = await ctx.call("data.mergeColumn", {dataSourceId: res.id, currentColumns: columns, keyColumn: keyColumn});
                    const columnNumber = columnModels.length;
                    await ctx.call("dataSource.update", {id: res.id, columns: columnModels, columnNumber});
                    resolve(ctx.call("dataSource.get", {id: res.id}))
                } catch (error) {
                    await this.handleProviderErrors(error, {id: res.id});
                    reject(error)
                }
            })
        },
        checkUploadParams(ctx) {
            const dS = ctx.meta.dataSource;
            const keyColumns = _.filter(dS.columns, {key: true});
            if (keyColumns.length != 1) { // not exactly 1 key column
                throw getError(errors.BAD_REQUEST, {message: "It should be exactly 1 key column for the data source"})
            }
        },
        checkSaveParams(ctx) {
            const data = ctx.params.data;
            const columns = ctx.params.columns;
            const previousColumnNames = _.map(_.filter(_.get(ctx, "meta.dataSource.columns"), column => !column.omit), "name");
            if (!_.isEqual(columns, previousColumnNames)) {
                throw getError(errors.UNPROCESSED_REQUEST, {message: "Change in data structure", previousColumns: previousColumnNames, currentColumns: columns})
            }
            // TODO row duplicates check, if no key check whether there are just consecutive lines
            /*const uniqColumns = _.uniq(columns);
            if (uniqColumns.length != columns.length) { // check column uniqueness
                let differentColumns = columns.filter(x => {
                    let i = uniqColumns.indexOf(x)
                    if (i > -1) {
                        uniqColumns.splice(i, 1);
                        return false
                    }
                    return !uniqColumns.includes(x);
                });
                throw getError(errors.NOT_UNIQUE, {message: "Columns are not unique", columns: differentColumns})
            }*/
            // check structural
        },
        checkGitPrerequisite(ctx) {
            /*const gitRepoDS = _.get(ctx, "meta.dataSource.gitRepo");
            const gitProviderDS = _.get(ctx, "meta.dataSource.gitProvider");
            const gitSyncStatusDS = _.get(ctx, "meta.dataSource.gitSyncStatus");*/
            const gitRepoProject = _.get(ctx, "meta.project.gitRepo");
            const gitProviderProject = _.get(ctx, "meta.project.gitProvider");
            const gitSyncStatusProject = _.get(ctx, "meta.project.gitSyncStatus");
            /*if (gitRepoDS) {
                if (gitSyncStatusDS == gitRepoSyncStatus.SYNCING) {
                    ctx.params.gitRepo = gitRepoDS;
                    ctx.params.gitProvider = gitProviderDS;
                    ctx.params.document = "dataSource"
                }
            } else*/
            if (gitRepoProject && gitProviderProject && gitSyncStatusProject == gitRepoSyncStatus.SYNCING) {
                ctx.params.gitRepo = gitRepoProject;
                ctx.params.gitProvider = gitProviderProject;
            }
            if (!ctx.params.gitRepo) {
                throw getError(errors.VALIDATION_ERROR, {gitRepoProject, gitProviderProject, gitSyncStatusProject})
            }
        }
    },
    events: {
        "project.deleted"(project) {
            // don't stop collecting, the owner still has access to the dataSource
            /*const stopSyncCalls = project.dataSources.map((dataSource) => {
                return {action: 'dataSource.stopSync', params: dataSource}
            });
            this.broker.mcall(stopSyncCalls);*/
            const stopSyncCalls = project.dataSources.map((dataSource) => {
                return {action: 'dataSource.stopSync', params: dataSource}
            });
            this.broker.mcall(stopSyncCalls);
        }
    }
};