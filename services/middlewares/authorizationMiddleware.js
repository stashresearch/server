const _ = require("lodash");
const ObjectId = require('mongoose').Types.ObjectId;
const { projectAccessLevel, projectPermissions, projectRole } = require("./../config/config");
const { match }	= require("moleculer").Utils;
const { getError, errors } = require("./../config/errors");
const {authenticate} = require("./authenticationMiddleware");

exports.authorizationMiddleware = async (req, res, next) => {
    try {
        await authorize(req.$ctx, req.$route, req);
        next()
    } catch (error) {
        next(error);
    }
};

async function authorize(ctx, route, req) {
    if (!ctx.meta.user && req.headers.authorization) {
        await authenticate(ctx, route, req)
    }
    const user = ctx.meta.user || {};

    const logger = req.$alias.service.logger;
    const project = _.get(ctx, "meta.project");
    const dataSource = _.get(ctx, "meta.dataSource");
    const action = _.get(req, "$alias.action");
    if (project) {
        let userProjectRole;
        if (project.access == projectAccessLevel.PUBLIC) {
            userProjectRole = projectRole.VIEWER
        }
        const projectMembership = _.find(project.members, {userId: new ObjectId(user.id)}) || _.find(project.members, {email: user.email});
        userProjectRole = projectMembership ? projectMembership.role : userProjectRole;
        if (userProjectRole) {
            const allowed = checkPermission(projectPermissions[userProjectRole]["allowed"], action);
            const disallowed = checkPermission(projectPermissions[userProjectRole]["disallowed"], action);
            let allowedIfCreated = false;
            if (dataSource && dataSource.createdByUserId === user.id) {
                allowedIfCreated = checkPermission(projectPermissions[userProjectRole]["allowedIfCreated"], action);
            }
            const logParam = {projectId: project.id, dataSourceId: dataSource ? dataSource.id : undefined, userId: user.id, userProjectRole, action, allowed, allowedIfCreated, disallowed};
            if ((allowed || allowedIfCreated) && !disallowed) {
                logger.debug("Request allowed", logParam);
                return Promise.resolve(ctx);
            } else {
                logger.debug("Request not allowed", logParam);
                return Promise.reject(getError(errors.FORBIDDEN));
            }
        } else {
            logger.debug("Request not allowed", {projectId: project.id, userId: user ? user.id : null});
            return Promise.reject(getError(errors.FORBIDDEN));
        }
    }

    return Promise.resolve(ctx);
}
function checkPermission(permissions = [], action) {
    return permissions.find(mask => {
        if (_.isString(mask))
            return match(action, mask);
        else if (_.isRegExp(mask))
            return mask.test(action);
    }) != null;
}

exports.authorize = authorize;

// if making a global handler, called before every action
/*module.exports = {
    localAction(handler) {
        return async function (ctx) {
            console.log("mw3 before", ctx.action.name);
            const res = await handler(ctx);
            console.log("mw3 after", ctx.action.name);
            return res;
        };
    }
};


const { getError, errors } = require("./../../services/config/errors");
const { projectAccessLevel } = require('./../../services/config/config');
const _ = require("lodash");
async function authorize(ctx, route, req) {
    const projectUUID = ctx.params.projectUUID || ctx.params.uuid;
    let projectPath;
    if (route.path == "/file/") {
        projectPath = req.originalUrl.split("/").splice(2,2).join("/");
    }
    if (projectUUID || projectPath) {
        const project = await ctx.call("userProject.listProjectRoles", {project: {uuid: projectUUID, path: projectPath}});
        ctx.meta = {project: project};
        if (project.projectUsers.length <= 0 && project.access == projectAccessLevel.PRIVATE) {
            return Promise.reject(getError(errors.UNAUTHORIZED))
        }
    }
}
exports.authorize = authorize;
 */