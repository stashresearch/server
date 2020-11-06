const csvParse = require('csv-parse');

module.exports = {
    name: 'csvParser',
    settings: {
        repoFolder: "/srv/git/",
    },
    actions: {
        convertCsv2Data: {
            params: {
                localPath: "string|optional",
                csv: "string|optional"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let csv = ctx.params.csv;
                        const path = ctx.params.localPath;
                        if (path) { // if path is defined, get the file content
                            csv = await ctx.call('git.getFileContent', ctx.params);
                        }
                        if (csv) {
                            csvParse(csv, {delimiter: ','}, (err, data) => {
                                if (err) reject(err);
                                resolve(data);
                            })
                        } else {
                            resolve()
                        }
                    } catch (error) {
                        resolve(error);
                    }
                });
            }
        },
        getCsvMeta: {
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const data = await ctx.call("csvParser.convertCsv2Data", ctx.params);
                        if (data && data.length > 0) {
                            resolve({
                                numberOfColumns: data[0].length,
                                numberOfRows: data.length - 1,
                                columns: data[0]
                            })
                        } else {
                            resolve({
                                numberOfColumns: 0,
                                numberOfRows: 0,
                                columns: []
                            })
                        }
                    } catch (error) {
                        resolve(error);
                    }
                });
            }
        }
    }
};