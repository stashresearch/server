const request = require("supertest");
const { ServiceBroker } = require("moleculer");
const serviceBroker = require('./../../moleculer.config');
const { syncStatus, syncMethods, dataProviders } = require("../../services/config/config");
const _ = require("lodash");
const fs = require("fs");
const path = require("path");

class ApiServer {
    constructor() {
        [ this.broker, this.apiService, this.apiServer ] = this.setup();
        this.token = null;
    }

    setup() {
        process.env.PORT = 3030;
        let broker = new ServiceBroker(Object.assign({}, serviceBroker, {logger: false}));
        broker.loadServices('./services2', '*.service.js');
        const service = broker.getLocalService("api");
        const apiServer = service.server;
        return [broker, service, apiServer];
    }

    signup(authParams, statusCode) {
        return request(this.apiServer)
            .post("/auth/signup")
            .send(authParams)
            .then(response => {
                expect(response.statusCode).toBe(statusCode || 200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                if (response.statusCode == 200) {
                    this.token = response.body.token
                } else {
                    //console.log(response.body);
                }
            });
    }

    login(authParams, statusCode) {
        return request(this.apiServer)
            .post("/auth/login")
            .send(authParams)
            .then(response => {
                if (statusCode) {
                    expect(response.statusCode).toBe(statusCode);
                }
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                if (response.statusCode == 200) {
                    this.token = response.body.token
                } else {
                    //console.log(response.body);
                }
            });
    }

    getUser() {
        return request(this.apiServer)
            .get("/user/me")
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(response.body.name).not.toBeNull();
                expect(response.body.firstName).not.toBeNull();
                expect(response.body.lastName).not.toBeNull();
                return response.body;
            });
    }

    updateUser(user) {
        return request(this.apiServer)
            .put("/user/me")
            .set('Authorization', 'Bearer ' + this.token)
            .send(user)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(response.body).toEqual(expect.objectContaining(user));
                return response.body;
            });
    }

    getCredentials(provider) {
        return request(this.apiServer)
            .get("/user/me/credentials/" + provider)
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body;
            });
    }

    createCredentials(providerCredentials) {
        return request(this.apiServer)
            .post("/user/me/credentials")
            .set('Authorization', 'Bearer ' + this.token)
            .send(providerCredentials)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(response.body).toEqual(expect.objectContaining(_.omit(providerCredentials, ["clientSecret"]))); // secret fields are not given back
                return response.body;
            });
    }

    initializePasswordReset(email) {
        return request(this.apiServer)
            .post("/user/me/password/reset")
            .send({email: email})
            .then(response => {
                expect(response.statusCode).toBe(202);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body;
            });
    }

    async updatePassword(credentials) {
        await this.delay(1000); // message initiation not synchronous
        const message = await this.broker.call('message.getLastMessage');
        console.log(message);
        return request(this.apiServer)
            .put("/user/me/password")
            .send({password: credentials.password, id: message.id})
            .then(response => {
                console.log(response.body)
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");

                return response.body;
            });
    }

    initializeEmailVerification() {
        return request(this.apiServer)
            .post("/user/me/email/verify")
            .set('Authorization', 'Bearer ' + this.token)
            .send()
            .then(response => {
                expect(response.statusCode).toBe(202);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body;
            });
    }

    async verifyEmail() {
        await this.delay(1000); // message initiation not synchronous
        const message = await this.broker.call('message.getLastMessage');
        return request(this.apiServer)
            .get("/user/me/verify/" + message.id)
            .then(response => {
                console.log(response.body)
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body;
            });
    }

    uploadProfileImage() {
        const imagePath = path.join(__dirname, "../utils/totoro.jpg");
        const image = fs.readFileSync(imagePath);
        return request(this.apiServer)
            .post('/user/me/profileImage')
            .set('Authorization', 'Bearer ' + this.token)
            .attach('profileImage', image)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body;
            })
    }

    getProject(projectUUID) {
        return request(this.apiServer)
            .get("/projects/" + projectUUID)
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(response.body.name).not.toBeNull();
                return response.body;
            });
    }

    getProjects() {
        return request(this.apiServer)
            .get("/projects")
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(Array.isArray(response.body)).toBe(true);
                return response.body;
            });
    }

    createProject(project) {
        return request(this.apiServer)
            .post("/projects")
            .set('Authorization', 'Bearer ' + this.token)
            .send({name: project.name})
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(response.body.name).not.toBeNull();
                return response.body;
            });
    }

    deleteProject(projectUUID) {
        return request(this.apiServer)
            .delete("/projects/" + projectUUID)
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
            });
    }

    getDataSources(projectUUID) {
        return request(this.apiServer)
            .get("/projects/" + projectUUID + "/dataSources")
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(Array.isArray(response.body)).toBe(true);
                return response.body;
            });
    }
    getDataSource(projectUUID, dataSourceUUID) {
        return request(this.apiServer)
            .get("/projects/" + projectUUID + "/dataSources/" + dataSourceUUID)
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body;
            });
    }

    createDataSource(projectUUID, dataSourceParam) {
        return request(this.apiServer)
            .post("/projects/" + projectUUID + "/dataSources")
            .set('Authorization', 'Bearer ' + this.token)
            .send(dataSourceParam)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                expect(response.body).toMatchObject(dataSourceParam);
                return response.body;
            });
    }

    async deleteDataSource(projectUUID, dataSourceUUID) {
        return request(this.apiServer)
            .delete("/projects/" + projectUUID + "/dataSources/" + dataSourceUUID)
            .set('Authorization', 'Bearer ' + this.token)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body
        });
    }


    startSync(projectUUID, dataSourceUUID, startParam) {
        return  request(this.apiServer)
            .post("/projects/" + projectUUID + "/dataSources/" + dataSourceUUID + "/startSync")
            .set('Authorization', 'Bearer ' + this.token)
            .send(startParam)
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body
            });
    }

    stopSync(projectUUID, dataSourceUUID) {
        return request(this.apiServer)
            .post("/projects/" + projectUUID + "/dataSources/" + dataSourceUUID + "/stopSync")
            .set('Authorization', 'Bearer ' + this.token)
            .send()
            .then(response => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
                return response.body
            });
    }

    getDataSourceEventHistory(projectUUID, dataSourceUUID) {
        return request(this.apiServer)
            .get("/projects/" + projectUUID + "/dataSources/" + dataSourceUUID + "/history")
            .set('Authorization', 'Bearer ' + this.token)
            .then(res => {
                expect(res.statusCode).toBe(200);
                expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
                return res.body
            })
    }

    async startSyncTest(projectUUID, dataSourceUUID, startParam, dataSourceCurrent, checkDownloadDelay = 60000, checkExpiration = false) {
        let dataSource = await this.startSync(projectUUID, dataSourceUUID, startParam);

        expect(dataSource.syncMethod).toBe(startParam.syncMethod);

        expect(dataSource.syncStatus).toBe(syncStatus.STARTED);
        let syncExpiresAt = new Date(dataSource.syncExpiresAt);
        expect(syncExpiresAt.getTime()).toBe(startParam.syncExpiresAt.setMilliseconds(0));

        // check periodic sync worker if syncExpires is in the future
        if (syncExpiresAt.getTime() > Date.now()) {
            const jobs = await this.broker.call("downloadQueue.getRepeatableJobs");
            expect(_.findIndex(jobs, {id: dataSource.uuid, cron: dataSource.schedulePattern, endDate: new Date(dataSource.syncExpiresAt).getTime()})).toBeGreaterThan(-1);
        }

        if (checkDownloadDelay) {
            await this.delay(checkDownloadDelay); // wait for download
            dataSource = await this.getDataSource(projectUUID, dataSource.uuid);
            if (dataSource.provider == dataProviders.GOOGLE && dataSource.syncMethod == syncMethods.CONTINUOUS) { // google channel ID
                expect(dataSource.sourceResourceId).not.toBeNull();
            }
            // file needs to exist
            const repoFolder = this.broker.getLocalService("git").schema.settings.repoFolder;
            expect(fs.existsSync(repoFolder + dataSource.localPath)).toBe(true);

            const dSHistory = await this.getDataSourceEventHistory(projectUUID, dataSource.uuid);
            const lastCommitEvent = _.find(dSHistory, {event: "committed"});
            const fileContent = await this.broker.call("git.getFileContent", {localPath: dataSource.localPath, commitId: lastCommitEvent.commitId});

            const file = fs.readFileSync(repoFolder + dataSource.localPath).toString();
            expect(fileContent).toBe(file);
        }
        if (checkExpiration) {
            let syncExpiresAt = new Date(dataSource.syncExpiresAt);
            await this.delay(Math.abs(syncExpiresAt.getTime() - Date.now()) + 50); // wait until expires
            dataSource = await this.getDataSource(projectUUID, dataSource.uuid);
            expect(dataSource.syncStatus).toBe(syncStatus.EXPIRED);
            syncExpiresAt = new Date(dataSource.syncExpiresAt);
            expect(syncExpiresAt.getTime()).toBeLessThan(Date.now());
        }
        return dataSource;
    }

    async stopDataSourceSync(projectUUID, dataSourceUUID, currentSyncStatus) {
        let dataSource = await this.stopSync(projectUUID, dataSourceUUID);

        if (currentSyncStatus == syncStatus.STARTED) {
            expect(dataSource.syncStatus).toBe(syncStatus.STOPPED);
        } else {
            expect(dataSource.syncStatus).toBe(currentSyncStatus);
        }
        const syncExpiresAt = new Date(dataSource.syncExpiresAt);
        expect(syncExpiresAt.getTime()).toBeLessThan(Date.now());

        const jobs = await this.broker.call("downloadQueue.getRepeatableJobs");
        expect(_.findIndex(jobs, {id: dataSource.uuid, cron: dataSource.schedulePattern, endDate: dataSource.syncExpiresAt})).toBe(-1);

        return dataSource
    }

    delay(t, v) {
        return new Promise(function(resolve) {
            setTimeout(resolve.bind(null, v), t)
        });
    }
}

module.exports = ApiServer;
