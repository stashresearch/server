const ApiGateway = require("moleculer-web");
const {authenticationMiddleware, authenticate} = require("./middlewares/authenticationMiddleware");
const {authorize} = require("./middlewares/authorizationMiddleware");
const {loadProject} = require("./middlewares/loadProject");
const {loadDataSource} = require("./middlewares/loadDataSource");
const _ = require("lodash");
const serveStatic = require("serve-static");

module.exports = {
    mixins: [ApiGateway],
    dependencies: ["user", "auth", "project", "dataSource"],
    settings: {
        port: process.env.PORT,
        rateLimit: {
            // How long to keep record of requests in memory (in milliseconds).
            // Defaults to 60000 (1 min)
            window: 60 * 1000,
            limit: 30,
            headers: false,
        },
        routes: [
            {
                path: "/",
                bodyParsers: {
                    json: true,
                },
                aliases: {
                    "POST auth/login": "auth.login",
                    "POST auth/signup": "auth.signup",
                    "POST user/passwordReset": "user.requestPasswordResetWithEmail",
                    "PUT user/password": "user.resetPassword",

                    "GET checkToken/:token": "token.verify",

                    "POST notifications/:id": "googleWebhook.googleNotification", // TODO rename

                    "GET googleWebhook/oauthcallback"(req, res) { // TODO rename
                        this.broker.call("googleWebhook.googleAuthCallback", req.$params)
                            .then((token) => {
                                res.writeHead(200);
                                res.end("<html><body><script>if (parent && typeof parent.close === 'function') { parent.close(); }</script></body></html>");
                            })
                            .catch((err) => {
                                res.writeHead(err.code);
                                res.end();
                            })
                    },
                }
            },
            {
                path: "/user",
                bodyParsers: {
                    json: true,
                },
                authentication: true,
                aliases: {
                    "GET /me": "user.getMe",
                    "POST /me/checkPassword": "user.checkPassword",
                    "POST /me/passwordReset": "user.requestPasswordReset",
                    "PUT /me/password": "user.resetPasswordWithCurrentPassword",
                    "PUT /me": "user.update",
                    "GET /:id": "user.get",
                    "POST /me/verify/:channel": "user.requestChannelVerification",
                    "POST /me/verify": "user.verifyChannel",
                    "GET /me/credentials/:provider": "user.getCredentials",
                    "POST /me/credentials": "user.createCredentials",
                    "PUT /me/credentials/:provider": "user.updateCredentials",
                    "DELETE /me/credentials/:provider": "user.deleteCredentials"
                },
            },
            {
                path: "/projects",
                authentication: true,
                authorization: true,
                bodyParsers: {
                    json: true,
                },
                use: [
                    loadProject
                ],
                aliases: {
                    "GET /": "project.findUserProjects",
                    "GET /:id": "project.getProject",
                    "POST /": "project.create",
                    "POST /:id/key": "project.setKey",
                    "PUT /:id/key": "project.setKey",
                    "GET /:id/key": "project.getKey",
                    //"PUT /": "project.update",
                    "DELETE /:id": "project.remove",
                    //"GET /:id/metadata": "project.metadata",
                    "POST /:id/invite": "project.invite",
                    "POST /:id/acceptInvitation": "project.accept",
                    "POST /:id/declineInvitation": "project.decline",
                    "GET /:id/dataSources": "dataSource.findProjectDS",
                    "POST /:id/setupGitSync": "project.setupGit",
                    "DELETE /:id/gitSync": "project.removeGit",

                }
            },
            {
                path: "/dataSources",
                authentication: true,
                authorization: true,
                bodyParsers: {
                    json: { limit: "100MB" },
                },
                use: [
                    loadDataSource
                ],
                aliases: {
                    "POST /": "dataSource.create",
                    "GET /:id": "dataSource.getDataSource",
                    "DELETE /:id": "dataSource.remove",
                    "POST /:id/setup": "dataSource.setup",
                    "POST /:id/startSync": "dataSource.startSync",
                    "POST /:id/download": "dataSource.download",
                    "GET /:id/data": "dataSource.getData",
                    //"GET /:id/rawData": "dataSource.getCSV",
                    "PUT /:id/data": "dataSource.upload",
                    //"POST /:id/setupGitUpload": "dataSource.setupGit",
                    "GET  /:id/history": "dataSource.getHistory",
                }
            },
            {
                path: "/dataSources",
                authentication: false,
                authorization: true,
                bodyParsers: {
                    json: { limit: "100MB" },
                },
                use: [
                    loadDataSource
                ],
                aliases: {
                    "GET /:id/rawData/:name.csv": "dataSource.getCSV",
                }
            },
            {
                path: "/errors",
                authentication: true,
                bodyParsers: {
                    json: true
                },
                aliases: {
                    "POST /": "uiError.create",
                    "GET /": "uiError.find",
                    "GET /:id": "uiError.get",
                    "DELETE /:id": "uiError.remove",
                }
            },
            {
                path: "webhook",
                bodyParsers: {
                    urlencoded: {extended: true}
                },
                aliases: {
                    "POST mandrill": "mandrillWebhook.events",
                }
            },
            {
                path: "",
                authentication: true,
                bodyParsers: {
                    json: false,
                    urlencoded: false
                },
                aliases: {
                    "POST user/me/profileImage": "multipart:file.saveProfileImage",
                },
                busboyConfig: {
                    limits: {
                        files: 1
                    }
                },
                onAfterCall(ctx, route, req, res, data) {
                    const fieldName = ctx.meta.fieldname;
                    if (fieldName == 'profileImage') {
                        return ctx.call('user.update', {[fieldName]: data[0].fileName})
                            .then(object => {
                                return {[fieldName]: object[fieldName]}
                            })
                    }
                }
            }
        ],
        onError(req, res, err) {
            // Return with the error as JSON object
            res.setHeader("Content-type", "application/json; charset=utf-8");
            res.writeHead(err.code || 500);
            const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
            res.end(JSON.stringify(errObj, null, 2));
            this.logResponse(req, res, err ? err.ctx : null);
        },
    },
    methods: {
        authenticate: authenticate,
        authorize: authorize
    },
};