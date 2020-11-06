'use strict';
const { google } = require('googleapis');
const _ = require('lodash');
const { dataProviders } = require('./config/config');
const { getError, errors } = require("./config/errors");

module.exports = {
    name: 'googleApi',
    settings: {
        googleCredentials: {
            "client_id": "CREDENTIAL",
            "project_id": "stash-267313",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": "CREDENTIAL",
            "redirect_uris": [
                "https://api.stashresearch.org/v2/googleWebhook/oauthcallback"
            ]
        },
        googleScope: ['https://www.googleapis.com/auth/drive.file', 'openid', /*'email'*/],
        googleWebhook: "https://api.stashresearch.org/v2/notifications",
    },
    actions: {
        downloadData: {
            params: {
                sourceId: "string",
                user: {
                    type: "object",
                    props: {
                        id: "string"
                    }
                }
            },
            hooks: {
                before: ["googleAuthorize"]
            },
            handler(ctx) {
                const log = this.logger;
                async function exportFile(auth, dataSource) {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const drive = google.drive({version: 'v3', auth});
                            const result = await drive.files.export(
                                {fileId: dataSource.sourceId, mimeType: 'text/csv'},
                                {responseType: 'stream'});
                            resolve(result.data)
                        } catch (error) {
                            const errorParams = {sourceId: dataSource.sourceId};
                            log.error("Google export error", error);
                            if (error.code == 404) {
                                reject(getError(errors.DOWNLOAD_ERROR, errorParams));
                            } else if (error.code == 400) {
                                reject(getError(errors.PROVIDER_BAD_REQUEST, errorParams));
                            } else {
                                reject(error)
                            }
                        }
                    });
                }
                async function getFileMetadata(auth, dataSource) {
                    return new Promise(async (resolve, reject) => {
                        const drive = google.drive({version: 'v3', auth});
                        try {
                            const response = await drive.files.get({fileId: dataSource.sourceId});
                            resolve(_.get(response, "data.name"));
                        } catch (error) {
                            reject(error)
                        }
                    });
                }
                return new Promise(async (resolve, reject) => {
                    const dataSource = ctx.params;
                    try {
                        const oAuth2Client = ctx.params.oAuth2Client;
                        const dataStream = await exportFile(oAuth2Client, dataSource);
                        const csv = await ctx.call("util.csvParser", dataStream);
                        const sourceName = await getFileMetadata(oAuth2Client, dataSource);
                        resolve({data: csv.data, meta: {columns: csv.columns, sourceName, keyColumn: "Timestamp"}});
                    } catch (error) {
                        this.handleAuthError(error, reject);
                    }
                });
            }
        },
        startSync: {
            params: {
                id: "string",
                sourceId: "string",
                syncExpiresAt: "date|optional",
                user: {
                    type: "object",
                    props: {
                        id: "string"
                    }
                }
            },
            hooks: {
                before: ["googleAuthorize"]
            },
            handler(ctx) {
                const googleWebhook = this.settings.googleWebhook;

                const watch = async (auth, dataSource, syncExpiresAt) => {
                    const drive = google.drive({version: 'v3', auth});
                    return new Promise(async (resolve, reject) => {
                        try {
                            const dataSourceId = dataSource.id;
                            const response = await drive.files.watch({
                                    "fileId": dataSource.sourceId,
                                    "requestBody": {
                                        "id": dataSourceId,
                                        "expiration": syncExpiresAt.getTime(), // google allows 1 day anyhow
                                        "type": "web_hook",
                                        "address": googleWebhook + "/" + dataSourceId
                                    }
                                });
                            this.logger.debug("Google watch response", response);
                            resolve(response.data);
                        } catch (error) {
                            if (error.code == 404) { // file is not found
                                reject(getError(errors.SYNC_ERROR));
                            } else {
                                reject(error)
                            }
                        }
                    });
                };
                return new Promise(async (resolve, reject) => {
                    const dataSource = ctx.params;
                    try {
                        const oAuth2Client = ctx.params.oAuth2Client;
                        const response = await watch(oAuth2Client, dataSource, dataSource.syncExpiresAt);
                        this.logger.debug("Google watch file response", response);
                        resolve({
                            expiration: parseInt(response.expiration),
                            resourceId: response.resourceId
                        });
                    } catch (error) {
                        this.handleAuthError(error, reject);
                    }
                });
            }
        },
        stopSync: {
            params: {
                id: "string",
                sourceId: "string",
                sourceResourceId: "string",
                user: {
                    type: "object",
                    props: {
                        id: "string",
                    }
                }
            },
            hooks: {
                before: ["googleAuthorize"]
            },
            handler(ctx) {
                const unwatch = async (auth, dataSource) => {
                    const drive = google.drive({version: 'v3', auth});
                    return new Promise(async (resolve, reject) => {
                        try {
                            const response = await drive.channels.stop({
                                    "resource": {
                                        "id": dataSource.uuid,
                                        "resourceId": dataSource.sourceResourceId,
                                    }
                            });
                            resolve(response);
                        } catch (error) {
                            if (error.code == 404) { // sync is not set
                                this.logger.warn(error);
                            }
                            resolve()
                        }
                    });
                };
                return new Promise(async (resolve, reject) => {
                    try {
                        const oAuth2Client = ctx.params.oAuth2Client;
                        const response = await unwatch(oAuth2Client, ctx.params);
                        this.logger.debug("Google unwatch file response", response);
                        resolve();
                    } catch (error) {
                        this.handleAuthError(error, reject);
                    }
                });
            }
        },
        refreshAccessToken: {
            params: {
                user: {
                    type: "object",
                    props: {
                        id: "string",
                        userCredential: {
                            type: "object",
                            optional: true
                        }
                    }
                },
            },
            hooks: {
                before: ["googleAuthorize"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const oAuth2Client = ctx.params.oAuth2Client;
                        const response = await oAuth2Client.refreshAccessToken();
                        this.logger.debug("Google refresh token response", response);
                        resolve(response.res.data);
                    } catch (error) {
                        this.handleAuthError(error, reject);
                    }
                });
            }
        },
        revokeToken: {
            params: {
                user: {
                    type: "object",
                    props: {
                        id: "string",
                        userCredential: {
                            type: "object",
                            optional: true
                        }
                    }
                },
            },
            hooks: {
                before: ["googleAuthorize"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        if (_.get(ctx, "params.tokens.refresh_token")) {
                            const oAuth2Client = ctx.params.oAuth2Client;
                            const response = await oAuth2Client.revokeToken(ctx.params.tokens.refresh_token);
                            this.logger.debug("Google revoke token response", response);
                            resolve(true);
                        } else {
                            this.logger.warn("Google no token to revoke");
                            resolve(true);
                        }
                    } catch (error) {
                        this.handleAuthError(error, reject);
                    }
                });
            }
        },
        getTokenWithAuthCode: {
            params: {
                code: "string",
                user: {
                    type: "object",
                    props: {
                        id: "string"
                    }
                }
            },
            hooks: {
                before: ["googleAuthorize"]
            },
            handler(ctx) {
                const authorizationCode = ctx.params.code;
                return new Promise(async (resolve, reject) => {
                    try {
                        const oAuth2Client = ctx.params.oAuth2Client;
                        const response = await oAuth2Client.getToken(authorizationCode);
                        this.logger.debug("Google get token response", response);
                        const accessToken = _.get(response, 'tokens.access_token');
                        const tokenInfo = await oAuth2Client.getTokenInfo(accessToken);
                        this.logger.debug("Token info", tokenInfo);
                        this.broker.emit("provider.newToken", {tokens: response.tokens, userId: ctx.params.user.id, provider: dataProviders.GOOGLE, tokenInfo});
                        resolve(response);
                    } catch (error) {
                        this.logger.error(error);
                        reject(error)
                    }
                });
            }
        }
    },
    methods: {
        getAccessTokenForApi(userCredential) {
            return {
                access_token: _.get(userCredential, 'accessToken'),
                refresh_token: _.get(userCredential, 'refreshToken')
            }
        },
        async googleAuthorize(ctx) {
            const googleCredentials = this.settings.googleCredentials;
            let tokens;
            let user = ctx.params.user;
            if (user) {
                if (!user.userCredential) {
                    user = await this.broker.call("user.get", user);
                    user.userCredential = user.credentials[dataProviders.GOOGLE];
                }
                tokens = this.getAccessTokenForApi(user.userCredential);
            }
            const {client_secret, client_id, redirect_uris} = googleCredentials;
            const oAuth2Client = new google.auth.OAuth2(
                client_id, client_secret, redirect_uris[0]);
            if (tokens) oAuth2Client.setCredentials(tokens);
            if (user) oAuth2Client.on('tokens', (tokens) => {
                this.broker.emit("provider.newToken", {tokens: tokens, userId: user.id, provider: dataProviders.GOOGLE});
            });
            ctx.params.tokens = tokens;
            ctx.params.oAuth2Client = oAuth2Client;
        },
        handleAuthError(error, callback) {
            this.logger.error(error);
            if (error.type == errors.NOT_FOUND.type || error.code == 401 ||_.get(error, 'response.data.error') == 'invalid_grant') { // delete access_token...
                callback(getError(errors.PROVIDER_AUTH_ERROR));
            }
            callback(error);
        }
    }
};
