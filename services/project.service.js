'use strict';
const bcrypt = require("bcrypt");
const projectSchema = require("./../common/models/ProjectSchema");
const mongoMixin = require("./mixins/mongo.mixin");
const { projectAccessLevel, projectRole, channels, gitProviders, gitRepoSyncStatus, messageTemplates } = require("./config/config");
const { getError, errors } = require("./config/errors");
const _ = require("lodash");

module.exports = {
    name: 'project',
    mixins: [mongoMixin],
    modelName: "Project",
    schema: projectSchema,
    settings: {
        _ids: ["id",
            //"path"
            ],
        //fields: ["name", "members", "id", "salt", "access", "publicKey"],
        populates: {
            //"members.privateKey": "key.get",
            //"members.userId": "user.get",
            //"publicKey": "key.get"
        }
    },
    dependencies: ["user"],
    actions: {
        // we use this instead of "built-in" get action as in the getProject we set needsRecovery...
        getProject: {
            hooks: {
                before: ["getProject"],
            },
            handler(ctx) {
                return ctx.meta.project
            }
        },
        create: { // TODO revoke (delete repo, document) if error
            hooks: {
                before: ["creationInitialParams",
                    //"gitInit"
                    ]
            },
            params: {
                name: "string|min:3|max:32|pattern:^[a-zA-Z0-9\-\.]*$",
                //password: "string",
                access: {
                    type: "enum",
                    values: _.values(projectAccessLevel),
                    default: projectAccessLevel.PUBLIC
                },
                description: "string|optional"
            },
        },
        findUserProjects: {
            params: {
                withKeys: {
                    type: "boolean",
                    optional: true,
                    convert: true
                }
            },
            hooks: {
                before: ["setQuery"],
                after: ["setProjectKey"]
            },
            handler(ctx) {
                return ctx.call("project.find", ctx.params)
            }
        },
        getKey: {
            hooks: {
                before: ["getProject"],
                after: ["setPrivateKey"]
            },
            handler(ctx) {}
        },
        setKey: {
            params: {
                publicKey: "string|optional",
                encryptedPrivateKey: "string"
            },
            hooks: {
                before: ["getProject"],
                after: ["setPrivateKey"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let project = ctx.meta.project;
                        const key = await ctx.call("key.create", {encryptedPrivateKey: ctx.params.encryptedPrivateKey});
                        const mongoKey = {
                            "_id": project.id,
                            "members.userId": ctx.meta.user.id
                        };
                        const mongoUpdate = {
                            "$set": {
                                "members.$.encryptedPrivateKey": key.id,
                                "members.$.needsRecovery": false
                            }};
                        if (ctx.params.publicKey && !project.publicKey)
                            mongoUpdate.$set.publicKey = ctx.params.publicKey;
                        project = await ctx.call("project.updateOne", {mongoKey, mongoUpdate});
                        ctx.meta.project = project;
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        setupGit: {
            params: {
                cloneCommand: "string",
                provider: {
                    type: "enum",
                    values: _.values(gitProviders)
                }
            },
            hooks: {
                before: ["getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let project = ctx.meta.project;
                        const provider = ctx.params.provider;
                        const gitRepo = await ctx.call("git.getUserRepoFromClone", ctx.params);

                        if (gitRepo == project.gitRepo && provider == project.gitProvider && project.gitSyncStatus == gitRepoSyncStatus.SYNCING) {
                            // TODO 'already set up' response to the client
                            resolve({})
                        } else {
                            const conflictingProject = await ctx.call("project.getGitRepo", {
                                gitRepo, gitProvider: provider
                            });
                            if (conflictingProject.length == 1) {
                                throw getError(errors.VALIDATION_ERROR, {message: "An other project uses the same repo", projectName: conflictingProject[0].name})
                            } else {
                                await ctx.call("git.setupGitConnection", {...ctx.params, gitRepo});
                                project = await ctx.call("project.update", {id: project.id, gitRepo, gitProvider: provider, gitSyncStatus: gitRepoSyncStatus.SYNCING, gitSyncStoppedAt: null});
                                await ctx.call("project.gitUpload", project);
                                resolve(project)
                            }
                        }
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        gitUpload: {
            params: {
                id: "string"
            },
            hooks: {
                before: ["getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const project = ctx.meta.project;
                        const dataSources = await ctx.call("dataSource.findProjectDS", project);
                        for (const dataSource of dataSources) {
                            await ctx.call("dataSource.gitUpload", {id: dataSource.id})
                        }
                        resolve({})
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        getGitRepo: {
            params: {
                gitRepo: "string",
                gitProvider: {
                    type: "enum",
                    values: _.values(gitProviders)
                }
            },
            handler(ctx) {
                return ctx.call("project.find", {query: {...ctx.params, gitSyncStatus: gitRepoSyncStatus.SYNCING}, limit: 1})
            }
        },
        removeGit: {
            params: {
                id: "string",
                removeFiles: {
                    type: "boolean",
                    optional: true,
                    convert: true
                }
            },
            hooks: {
                before: ["getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let project = ctx.meta.project;
                        const dataSources = await ctx.call("dataSource.findProjectDS", project);
                        for (const dataSource of dataSources) {
                            await ctx.call("dataSource.gitRemove", {id: dataSource.id, gitRepo: project.gitRepo})
                        }
                        await ctx.call("git.removeCollaborator", {gitRepo: project.gitRepo});
                        project = await ctx.call("project.update", {id: project.id, gitRepo: null, gitSyncStatus: null, gitProvider: null, gitSyncStoppedAt: null});
                        resolve(project)
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        needsRecovery: {
            params: {
                id: "string",
                member: {
                    type: "object",
                    props: {
                        userId: "string",
                        needsRecovery: "boolean"
                    }
                }
            },
            hooks: {
                before: ["getProject"],
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let project = ctx.meta.project;
                        const mongoKey = {
                            "_id": project.id,
                            "members.userId": ctx.params.member.userId
                        };
                        const mongoUpdate = {
                            "$set": {
                                "members.$.needsRecovery": ctx.params.member.needsRecovery
                            }};
                        await ctx.call("project.updateOne", {mongoKey, mongoUpdate});
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        /*metadata: {
            params: {
                uuid: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const project = await ctx.call("project.get", ctx.params);
                        project.dataValues.rows = _.sumBy(project.dataSources, 'rows');
                        project.dataValues.columns = _.sumBy(project.dataSources, 'columns');
                        project.dataValues.lastModifiedAt = _.get(_.maxBy(project.dataSources, 'lastModifiedAt'), 'lastModifiedAt');
                        project.dataValues.lastDownloadedAt = _.get(_.maxBy(project.dataSources, 'lastDownloadedAt'), 'lastDownloadedAt');
                        resolve(project)
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },*/
        invite: {
            params: {
                email: "email",
                role: {
                    type: "enum",
                    values: _.values(projectRole)
                }
            },
            hooks: {
                before: ["getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let project = ctx.meta.project;
                        const member = {
                            email: ctx.params.email,
                            role: ctx.params.role,
                        };
                        const mongoKey = {
                            "_id": project.id,
                        };
                        let mongoUpdate;
                        const invitedUser = await ctx.call("user.find", {query: {email: member.email}});
                        const invitedUserId = invitedUser && invitedUser[0] ? invitedUser[0].id : null;
                        member.firstName = invitedUser && invitedUser[0] ? invitedUser[0].firstName : null;
                        const idx = this.findMember(member.email, project.members);
                        if (idx >= 0) {
                            mongoKey["members.email"] = project.members[idx].email;
                            mongoUpdate = {
                                "$set": {
                                    "members.$.firstName": member.firstName,
                                    "members.$.role": member.role,
                                    "members.$.invitedAt": new Date()
                                }};
                        } else {
                            mongoUpdate = {
                                "$push": {
                                    "members": {
                                        email: member.email,
                                        firstName: member.firstName,
                                        role: member.role,
                                        invitedAt: new Date()}
                                }};
                        }
                        project = await ctx.call("project.updateOne", {mongoKey, mongoUpdate});
                        //const token = await ctx.call("util.generateToken", {object: {member}, privateKey: this.settings.JWT_PRIVATE_KEY, expiration: 30 * 24 * 60 * 60});
                        const token = await ctx.call("token.generate", {object: {member: {...member, userId: invitedUserId}, projectId: project.id}, expiration: 30 * 24 * 60 * 60});
                        ctx.call('messageQueue.sendMessage', {toUser: member, template: messageTemplates.INVITATION, channel: channels.EMAIL, urlParams: {token},
                                                                    params: {
                                                                        fromUser: _.pick(ctx.meta.user, "firstName"),
                                                                        project: _.pick(project, "name")
                                                                }});
                        resolve(project)
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        acceptOrDecline: {
            params: {
                token: "string",
                accept: "boolean"
            },
            hooks: {
                before: ["getProject"]
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        let project = ctx.meta.project;
                        const decoded = await ctx.call("token.verify", {token: ctx.params.token});
                        const { email, role, firstName } = decoded.member;
                        const idx = this.findMember(email, project.members);
                        if (idx < 0) {
                            throw getError(errors.UNPROCESSED_REQUEST, {email})
                        }
                        if (ctx.params.accept) {
                            const idxUserId = this.findMemberByUserId(ctx.meta.user.id, project.members);
                            if (idxUserId > -1 && idx != idxUserId) { // already accepted and user already among members
                                throw getError(errors.NOT_UNIQUE, {userId: ctx.meta.user.id, email});
                            }
                        }
                        const mongoKey = {
                            "_id": project.id,
                            "members.email": email
                        };
                        const mongoUpdate = ctx.params.accept ? {
                            "$set": {
                                "members.$.userId": ctx.meta.user.id,
                                "members.$.firstName": firstName,
                                "members.$.role": role,
                                "members.$.acceptedAt": new Date()
                            },
                            "$unset": {
                                "members.$.declinedAt": undefined,
                            }
                        } : {
                            "$set": {
                                "members.$.declinedAt": new Date()
                            },
                            "$unset": {
                                "members.$.userId": undefined,
                            }
                        };
                        project = await ctx.call("project.updateOne", {mongoKey, mongoUpdate});
                        resolve(ctx.params.accept ? project : {})
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        accept: {
            params: {
                token: "string"
            },
            handler(ctx) {
                ctx.params.accept = true;
                return ctx.call("project.acceptOrDecline", ctx.params)
                /*return new Promise(async (resolve, reject) => {
                    try {
                        let project = ctx.meta.project;
                        //const decoded = await ctx.call("util.verifyToken", {token: ctx.params.token, publicKey: this.settings.JWT_PUBLIC_KEY});
                        const decoded = await ctx.call("token.verify", {token: ctx.params.token});
                        const email = decoded.member.email;
                        const idx = this.findMember(email, project.members);
                        if (idx < 0) {
                            throw getError(errors.NOT_FOUND, {email})
                        }
                        const idxUserId = this.findMemberByUserId(ctx.meta.user.id, project.members);
                        if (idxUserId > -1 && idx != idxUserId) { // already accepted and user already among members
                            throw getError(errors.NOT_UNIQUE, {userId: ctx.meta.user.id, email});
                        }
                        const mongoKey = {
                            "_id": project.id,
                            "members.email": email
                        };
                        const mongoUpdate = {
                            "$set": {
                                "members.$.userId": ctx.meta.user.id,
                                "members.$.acceptedAt": new Date()
                            },
                            "$unset": {
                                "members.$.declinedAt": undefined,
                            }
                        };
                        project = await ctx.call("project.updateOne", {mongoKey, mongoUpdate});
                        resolve(project)
                    } catch (error) {
                        reject(error)
                    }
                });*/
            }
        },
        decline: {
            params: {
                token: "string",
            },
            hooks: {
                before: ["getProject"]
            },
            async handler(ctx) {
                ctx.params.accept = false;
                return ctx.call("project.acceptOrDecline", ctx.params)
                /*let project = ctx.meta.project;
                const decoded = await ctx.call("util.verifyToken", {token: ctx.params.token, publicKey: this.settings.JWT_PUBLIC_KEY});
                const email = decoded.member.email;
                const idx = this.findMember(email, project.members);
                if (idx < 0) {
                    throw getError(errors.NOT_FOUND, {email})
                }
                const mongoKey = {
                    "_id": project.id,
                    "members.email": email
                };
                const mongoUpdate = {
                    "$set": {
                        "members.$.declinedAt": new Date()
                    },
                    "$unset": {
                        "members.$.userId": undefined,
                    }
                };
                project = await ctx.call("project.updateOne", {mongoKey, mongoUpdate});
                return {}*/
            }
        }
    },
    methods: {
        async gitInit(ctx) {
            ctx.params.path = this.getPath(ctx.meta.user.name, ctx.params.name);
            await ctx.call("git.initRepo", ctx.params);
        },
        // checkGitPrerequisite(ctx) {
        //     const project = ctx.meta.project;
        //     if (!project.gitRepo || project.gitSyncStatus != gitRepoSyncStatus.SYNCING) {
        //         throw getError(errors.VALIDATION_ERROR, {gitRepo: project.gitRepo, gitSyncStatus: project.gitSyncStatus})
        //     }
        // },
        async setPrivateKey(ctx, res) {
            let userId = ctx.meta.user.id;
            let members = ctx.meta.project.members;
            let publicKey = ctx.meta.project.publicKey;
            let member = _.find(members, (m) => {
                return userId == m.userId
            });
            let encryptedPrivateKey;
            if (member.encryptedPrivateKey) {
                let key = await ctx.call("key.get", {id: member.encryptedPrivateKey.toString()});
                encryptedPrivateKey = key.encryptedPrivateKey;
            }
            return {encryptedPrivateKey, publicKey}
        },

        async setProjectKey(ctx, res) {
            for (const project of res) {
                const members = project.members;
                const idx = _.get(ctx, "meta.user.id") ? this.findMemberByUserId(ctx.meta.user.id, members) : -1;
                if (idx >= 0) {
                    if (members[idx].encryptedPrivateKey && ctx.params.withKeys) {
                        const key = await ctx.call("key.get", {id: members[idx].encryptedPrivateKey.toString()});
                        project.encryptedPrivateKey = key.encryptedPrivateKey
                    }
                    project.needsRecovery = members[idx].needsRecovery;
                }
            }
            return res
        },
        async getProject(ctx) {
            const project = await ctx.call("project.get", ctx.params);
            const members = project.members;
            const idx = this.findMemberByUserId(_.get(ctx, "meta.user.id") || _.get(ctx, "params.userId"), members); // TODO is it good to get it from meta?
            if (idx>= 0 && members[idx])
            project.needsRecovery = members[idx].needsRecovery;
            ctx.meta.project = project;
            /*const project = _.get(ctx, "meta.project");
            if (!project || project.id != ctx.params.id) {
                const project = await ctx.call("project.get", {...ctx.params});
                const members = project.members;
                const idx = this.findMemberByUserId(_.get(ctx, "meta.user.id") || _.get(ctx, "params.userId"), members); // TODO is it good to get it from meta?
                if (idx>= 0 && members[idx])
                    project.needsRecovery = members[idx].needsRecovery;
                ctx.meta.project = project
            }*/
        },
        getPath(userName, projectName) {
            return userName + "/" + projectName
        },
        setQuery(ctx) {
            ctx.params.query = {"members.userId": _.get(ctx, "meta.user.id") || ctx.params.userId};
        },
        async creationInitialParams(ctx) {
            ctx.params.salt = bcrypt.genSaltSync(10);
            ctx.params.dataSourceNumber = 0;
            ctx.params.members = [{
                email: ctx.meta.user.email,
                userId: ctx.meta.user.id,
                role: projectRole.OWNER,
            }]
        },
        findMember(email, members) {
            return _.findIndex(members, (m) => {
                return m.email == email
            });
        },
        findMemberByUserId(userId, members) {
            return _.findIndex(members, (m) => {
                return (m.userId ? m.userId.toString() : "NO_USER_ID") === userId
            });
        },
        async checkPassword(ctx) {
            await ctx.call("util.passwordCheck", {password: ctx.params.password, passwordHash: ctx.meta.user.password});
        }
    },
    entityRemoved(project, ctx) {
        //ctx.call('file.removeFolder', project);
        this.logger.info("Project removed", project);
    },
    entityCreated(project, ctx) {
        this.logger.info("Project created", project);
    },
};
