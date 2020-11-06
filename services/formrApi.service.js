'use strict';
const axios = require('axios');
const { dataProviders } = require('./config/config');
const _ = require("lodash");
const { getError, errors } = require("./config/errors");

module.exports = {
    name: 'formrApi',
    settings: {
        formrApiRoot: "https://api.formr.org/",
        clientId: "CREDENTIAL", // TODO: move to UserCredentials until formR doesn't implement oauth auth code grant type
        clientSecret: "CREDENTIAL", // TODO: move to UserCredentials until formR doesn't implement oauth auth code grant type
    },
    actions: {
        downloadData: {
            params: {
                sourceName: "string|min:1",
                sourceSurveyName: "string|min:1",
                user: {
                    type: "object",
                    props: {
                        id: "string"
                    }
                }
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const surveyName = ctx.params.sourceSurveyName;
                        const surveyNameParamName = "surveys[" + surveyName +"]";
                        const tokens = await ctx.call('formrApi.refreshAccessToken', ctx.params); // OR could call userCredential.getAccessToken which calls refreshAccessToken
                        const response = await axios.get(this.settings.formrApiRoot + "get/results", {
                                params: {
                                    "access_token": tokens.access_token,
                                    "run[name]": ctx.params.sourceName,
                                    [surveyNameParamName]: ""
                                }});
                        this.logger.debug("FormR get results response", response.data);
                        //const surveyResponses = await converter.json2csvAsync(response.data[surveyName] || []);
                        //await ctx.call('file.saveProjectFile', Readable.from(surveyResponses != "\n" ? surveyResponses : ""), {meta: {path: ctx.params.localPath}}); // for empty [] json2csv gives back \n
                        const responseData = response.data[surveyName] || [];
                        const data = responseData.map((row) => Object.keys(row).map(key => {
                            return {columnName: key, value: row[key]}
                        }));
                        const columns = Object.keys(Object.assign({}, ...responseData));
                        resolve({data: data, meta: {columns: columns}})
                        //resolve(response.data[surveyName] || [])
                    } catch (error) {
                        if (_.get(error, 'response.data.error') == 'Not Found') {
                            this.logger.error(error);
                            reject(getError(errors.DOWNLOAD_ERROR, {description: _.get(error, 'response.data.error_description')}));
                        }
                        reject(error)
                    }
                });
            }
        },
        refreshAccessToken: {
            cache: {
                keys: ["user.id"],
                ttl: 30*60 // 30 min
            },
            params: {
                user: {
                    type: "object",
                    props: {
                        id: "string",
                        userCredential: {
                            type: "object",
                            optional: true,
                            props: {
                                clientId: "string",
                                clientSecret: "string"
                            }
                        }
                    }
                }
            },
            hooks: {
                before: ["getUser"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    const userId = ctx.params.user.id;
                    try {
                        const response = await axios.post(this.settings.formrApiRoot + "oauth/access_token", {
                            client_id: ctx.params.user.userCredential.clientId,
                            client_secret: ctx.params.user.userCredential.clientSecret,
                            grant_type: "client_credentials"
                        });
                        this.logger.debug("FormR get token response", response);
                        this.broker.emit("provider.newToken", {tokens: response.data, userId, provider: dataProviders.FORMR});
                        resolve(response.data);
                    } catch (error) {
                        this.logger.error(error);
                        if (_.get(error, 'response.data.error') == 'invalid_client') {
                            reject(getError(errors.PROVIDER_AUTH_ERROR));
                        }
                        reject(error)
                    }
                });
            }
        },
    },
    methods: {
        async getUser(ctx) {
            if (!ctx.params.user.userCredential) {
                const user = await ctx.call("user.get", ctx.params.user);
                ctx.params.user.userCredential = user.credentials[dataProviders.FORMR];
            }
        },
    }
};
