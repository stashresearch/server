'use strict';
const fs = require('fs-extra');
const { Octokit } = require("@octokit/rest");
const { getError, errors } = require("./config/errors");
const { gitProviders } = require('./config/config');
const _ = require("lodash");

module.exports = {
    name: 'git',
    settings: {
        repoFolder: "/srv/git/",
        githubToken: "CREDENTIAL",
        gitUser: {
            name: "stashresearch",
            email: "admin@stashresearch.org"
        }
    },
    actions: {
        initRepo: {
            params: {
                path: 'string'
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const __dirname = this.settings.repoFolder + ctx.params.path;

                        if (!fs.existsSync(__dirname)) {
                            fs.ensureDirSync(__dirname);
                            const git = await this.getGit(ctx.params.path);
                            await git.init();
                            resolve({gitRepo: __dirname});
                        } else {
                            reject(getError(errors.FOLDER_EXISTS, {path: __dirname}));
                        }
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        checkout: {
            params: {
                path: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const path = ctx.params.path;
                        this.logger.debug("Checking out file", {path});
                        const git = await this.getGit(path);
                        const filePath = path.split("/").slice(2).join("/");
                        await git.checkout(filePath);
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        commit: {
            params: {
                commitMessage: "string|optional",
                project: {
                    type: "object",
                    optional: true,
                    props: {
                        path: "string"
                    }
                },
                dataSource: {
                    type: "object",
                    optional: true,
                    props: {
                        //uuid: "string",
                        //name: "string",
                        localPath: "string"
                    }
                }
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        //const dataSourceName = ctx.params.dataSource.name;
                        let path;
                        const projectPath = _.get(ctx.params, "project.path");
                        const dataSourcePath = _.get(ctx.params, "dataSource.localPath");
                        if (projectPath) {
                            path = projectPath;
                        } else if (dataSourcePath) {
                            path = dataSourcePath;
                        }
                        //const path = ctx.params.dataSource.localPath;
                        this.logger.debug("Committing file/repo", {path});
                        const git = await this.getGit(path);
                        const toStage = dataSourcePath ? path.split("/").slice(2).join("/") : "."; // either the file or all
                        await git.add(toStage);
                        let response = await git.commit(ctx.params.commitMessage || dataSourcePath ? "file content changed" : "repo changed");
                        this.logger.debug(response);
                        response.commit = response.commit.replace("(root-commit) ",""); // sometimes first commit contains (root-commit) prefix
                        resolve(response);
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        deleteFile: {
            params: {
                name: "string",
                localPath: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                        try {
                            const removed = await ctx.call("file.removeFile", {path: ctx.params.localPath});
                            if (removed) {
                                await ctx.call("git.commit", {commitMessage: "File deletion", dataSource: ctx.params});
                            }
                            resolve();
                        } catch (error) {
                            reject(error)
                        }
                });
            }
        },
        getFileContent: {
            /*cache: {
                keys: ["localPath", "commitId"],
                ttl: 60 // 1 min
            },*/
            params: {
                localPath: 'string',
                commitId: "string|optional",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const path = ctx.params.localPath;
                        const commitId = ctx.params.commitId;
                        this.logger.debug("Getting file content", {path, commitId});
                        const git = await this.getGit(path);
                        const filePath = path.split("/").slice(2).join("/").replace(/" "/, "\\\ ");
                        const gitRevision = commitId ? (commitId + ":./" + filePath) : ("HEAD:./" + filePath);
                        const response = await git.show([gitRevision]);
                        resolve(response);
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        setupGitConnection: {
            params: {
                gitRepo: "string",
                provider: {
                    type: "enum",
                    values: _.values(gitProviders)
                }
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const {invitation} = await ctx.call("git.checkInvitation", ctx.params);
                        const invitationId = invitation.id;
                        await ctx.call("git.acceptInvitation", {invitationId});
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        checkInvitation: {
            params: {
                gitRepo: "string",
                provider: {
                    type: "enum",
                    values: _.values(gitProviders)
                }
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        //const repoUserAndName = await ctx.call("git.getUserRepoFromClone", ctx.params);
                        const gitRepo = ctx.params.gitRepo;
                        const repoHttps = "https://" + ctx.params.provider + ".com/" + ctx.params.gitRepo;
                        const octokit = new Octokit({
                            auth: this.settings.githubToken,
                        });
                        const { data } = await octokit.repos.listInvitationsForAuthenticatedUser();
                        this.logger.debug("Github invitation", {data, gitRepo, repoHttps});
                        const invitation = _.find(data, (d) => d.repository.html_url == repoHttps);
                        if (invitation) {
                            ctx.meta.$statusCode = 202;
                            resolve({invitation});
                        } else {
                            throw getError(errors.VALIDATION_ERROR, {message: "No pending invitation found.", field: "cloneCommand"})
                        }
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        acceptInvitation: {
            params: {
                invitationId: "number"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const octokit = new Octokit({
                            auth: this.settings.githubToken,
                        });
                        const response = await octokit.repos.acceptInvitation({invitation_id: ctx.params.invitationId});
                        resolve(response)
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        removeCollaborator: {
            params: {
                gitRepo: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const octokit = new Octokit({
                            auth: this.settings.githubToken,
                        });
                        const response = await octokit.repos.removeCollaborator({
                            owner: ctx.params.gitRepo.split("/")[0],
                            repo: ctx.params.gitRepo.split("/")[1],
                            username: this.settings.gitUser.name,
                        });
                        this.logger.debug("Git remove collaborator", response);
                        resolve(true)
                    } catch (error) {
                        if (error.status == 404) {
                            resolve()
                        } else {
                            reject(error)
                        }
                    }
                })
            }
        },
        getFile: {
            params: {
                fileName: "string",
                gitRepo: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const octokit = new Octokit({
                            auth: this.settings.githubToken,
                        });
                        const content = await octokit.repos.getContent({
                            "owner": ctx.params.gitRepo.split("/")[0],
                            "repo": ctx.params.gitRepo.split("/")[1],
                            "path": ctx.params.fileName,
                        });
                        this.logger.debug("Git get file response", {response: content});
                        resolve(content.data)
                    } catch (error) {
                        if (error.status == 404) {
                           resolve()
                        } else {
                            reject(error)
                        }
                    }
                })
            }
        },
        updateFile: {
            params: {
                fileName: "string",
                content: "string",
                sha: "string|optional",
                gitRepo: "string",
                //initialUpload: "boolean|optional"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const gitUser = this.settings.gitUser;
                        const currentSha = ctx.params.sha;
                        const octokit = new Octokit({
                            auth: this.settings.githubToken,
                        });
                        /*const exists = await ctx.call("git.getFile", ctx.params);
                        if (exists) {
                            this.logger.debug("Git file exists", exists);
                            if (ctx.params.initialUpload) {
                                throw getError(errors.ALREADY_EXISTS, {message: "File already exists in gitRepo", gitRepo: ctx.params.gitRepo, fileName: ctx.params.fileName})
                            }
                        }*/
                        /*if (!currentSha) { // file doesn't exist in our system so should not exist on github
                            const exists = await ctx.call("git.getFile", ctx.params);
                            if (exists) {
                                throw getError(errors.ALREADY_EXISTS, {message: "File already exists in gitRepo", gitRepo: ctx.params.gitRepo, fileName: ctx.params.fileName})
                            }
                        }*/
                        let requestBody = {
                            "owner": ctx.params.gitRepo.split("/")[0],
                            "repo": ctx.params.gitRepo.split("/")[1],
                            "path": ctx.params.fileName,
                            "message": currentSha ? "File changed" : "File created",
                            "content": Buffer.from(ctx.params.content).toString('base64'),
                            "committer.name": gitUser.name,
                            "committer.email": gitUser.email,
                            "author.name": gitUser.name,
                            "author.email": gitUser.email,
                            "sha": currentSha
                        };
                        //this.logger.debug("Git update or create request", {requestBody});
                        const response = await octokit.repos.createOrUpdateFileContents(requestBody);
                        //this.logger.debug("Git create or update file response", response);
                        resolve(response.data);
                    } catch (error) {
                        this.logger.error(error);
                        if (error.status == 422 || error.status == 409) {
                            reject(getError(errors.GIT_CONFLICT_ERROR, {message: "Conflicting file in git repo, repo name: " + ctx.params.gitRepo + ", filename: " + ctx.params.fileName}))
                        } else if (error.status == 404) {
                            reject(getError(errors.GIT_AUTH_ERROR, {message: "Git resource not found, probably authentication problem, repo name: " + ctx.params.gitRepo}))
                        }
                        /*if (error.status >= 400 && error.status < 500) {
                            this.logger.error(error);
                            reject(getError(errors.GIT_UPLOAD_ERROR))
                        }*/
                        reject(error)
                    }
                })
            }
        },
        removeFile: {
            params: {
                fileName: "string",
                gitRepo: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const gitUser = this.settings.gitUser;
                        const octokit = new Octokit({
                            auth: this.settings.githubToken,
                        });
                        const exists = await ctx.call("git.getFile", ctx.params);
                        if (exists) {
                            let requestBody = {
                                "owner": ctx.params.gitRepo.split("/")[0],
                                "repo": ctx.params.gitRepo.split("/")[1],
                                "path": ctx.params.fileName,
                                "message": "File deleted",
                                "committer.name": gitUser.name,
                                "committer.email": gitUser.email,
                                "author.name": gitUser.name,
                                "author.email": gitUser.email,
                                "sha": exists.sha
                            };
                            this.logger.debug("Git delete request", {requestBody});
                            const response = await octokit.repos.deleteFile(requestBody);
                            this.logger.debug("Git delete file response", response);
                            resolve()
                        } else {
                            resolve()
                        }
                    } catch (error) {
                        reject(error)
                    }
                })
            }
        },
        getUserRepoFromClone: {
            params: {
                cloneCommand: "string"
            },
            handler(ctx) {
                const userAndRepo = ctx.params.cloneCommand.split(/[\/:\s]/).reverse().splice(0,2);
                return userAndRepo[1] + "/" + userAndRepo[0].split(".git")[0]
            }
        }
    },
    methods: {
        getGit(path) {
            return new Promise(async (resolve, reject) => {
                try {
                    const fullPath = this.settings.repoFolder + path.split("/").slice(0,2).join("/");
                    resolve(require('simple-git/promise')(fullPath));
                } catch (error) {
                    reject(error)
                }
            })
        }
    },
    events: {
        /*"project.created"(params) {
            return this.broker.call('git.initRepo', {folder: params.path});
        },*/
    }
};
