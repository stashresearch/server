const _ = require("lodash")

exports.loadDataSource = async (req, res, next) => {
    try {
        const ctx = req.$ctx;
        let dataSourceId;
        if (req.parsedUrl.startsWith("/dataSources")) {
            dataSourceId = req.parsedUrl.split("/")[2];
        }
        if (dataSourceId) {
            const dS = await ctx.call("dataSource.getDataSource", {id: dataSourceId});
            await ctx.call("project.getProject", {id: dS.projectId.toString()});
        }
        next()
    } catch (error) {
        next(error);
    }
};