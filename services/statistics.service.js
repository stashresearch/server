const dl = require('datalib');

module.exports = {
    name: 'statistics',
    actions: {
        getStatistics: {
            handler(ctx) {
                const csv = ctx.params.csv;
                return new Promise(async (resolve, reject) => {
                    try {
                        const data = dl.read(csv, {type: 'csv', parse: 'auto'});
                        resolve(data);
                    } catch (error) {
                        resolve(error);
                    }
                });
            }
        }
    }
};