const _ = require("lodash")

exports.loadProject = async (req, res, next) => {
    try {
        const ctx = req.$ctx;
        let projectId;
        if (_.get(ctx, "meta.dataSource")) {
            projectId = ctx.meta.dataSource.projectId
        }
        if (req.parsedUrl.startsWith("/projects")) {
            projectId = req.parsedUrl.split("/")[2];
        }
        if (projectId) {
            await ctx.call("project.getProject", {id: projectId});
        }
        next()
    } catch (error) {
        next(error);
    }
};