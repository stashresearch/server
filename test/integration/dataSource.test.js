"use strict";

const { syncMethods, syncStatus, dataProviders } = require("../../services/config/config");
const { credentials, project } = require("./../utils/config.test");
const _ = require("lodash");
const ApiServer = require("./../utils/ApiServer");

describe("Test 'dataSource' service", () => {

	let broker, server;
	beforeAll(() => {
		server = new ApiServer();
		broker = server.broker;
		return broker.start();
	});

	afterAll(() => {
		broker.stop()
	});

	let project;
	describe("Create test project", () => {
		beforeAll(() => {
			return server.login(credentials);
		});

		it("POST /projects/:projectUUID", async () => {
			project = await server.createProject(project);
		});

		it("GET /projects/:projectUUID", () => {
			return server.getProject(project.uuid);
		});

		it("GET /projects", () => {
			return server.getProjects();
		});

		it("GET /projects/:projectUUID/dataSources", () => {
			return server.getDataSources(project.uuid)
		});

	});

	let dataSource;
	describe("Test formR provider", () => {

		let dataSourceParam;
		it("POST /projects/:projectUUID/ - formR", async () => {
			dataSourceParam = {
				"provider": dataProviders.FORMR,
				"sourceName": "First",
				"sourceSurveyName": "test",
			};
			dataSource = await server.createDataSource(project.uuid, dataSourceParam)
		});

		it("POST /projects/:projectUUID/dataSources/startSync - FormR, periodic sync EVERY TWO MINUTES", async () => {
			const startParam = {
				"syncMethod": syncMethods.PERIODIC,
				"schedule": "every 2 minutes",
				"syncExpiresAt": new Date(Date.now() + 25*3600*1000)
			};
			dataSource = await server.startSyncTest(project.uuid, dataSource.uuid, startParam, dataSource, 120000);
		}, 125000);

		it("POST /projects/:projectUUID/dataSources/startSync - FormR, periodic", async () => {
			const startParam = {
				"syncMethod": syncMethods.PERIODIC,
				"schedule": "every minute",
				"syncExpiresAt": new Date(Date.now() + 25*3600*1000)
			};
			dataSource = await server.startSyncTest(project.uuid, dataSource.uuid, startParam, dataSource, 60000);

		}, 65000);

		it("POST /projects/:projectUUID/dataSources/stopSync - FormR, periodic", async () => {
			dataSource = await server.stopDataSourceSync(project.uuid, dataSource.uuid, dataSource.syncStatus)
		});

		it("POST /projects/:projectUUID/dataSources/startSync - FormR, test EXPIRATION", async () => {
			const syncExpiresAt = new Date(Date.now() + 15000);
			const startParam = {
				"syncMethod": syncMethods.PERIODIC,
				"schedule": "every minute",
				"syncExpiresAt": syncExpiresAt
			};
			dataSource = await server.startSyncTest(project.uuid, dataSource.uuid, startParam, dataSource, false, true);
		}, 20000);

		it("POST /projects/:projectUUID/dataSources/stopSync - FormR, periodic ALREADY EXPIRED", async () => {
			dataSource = await server.stopDataSourceSync(project.uuid, dataSource.uuid, dataSource.syncStatus)
		});

		it("POST /projects/:projectUUID/dataSources/startSync - FormR, periodic", async () => {
			const startParam = {
				"syncMethod": syncMethods.PERIODIC,
				"schedule": "every minute",
				"syncExpiresAt": new Date(Date.now() + 25*3600*1000)
			};
			dataSource = await server.startSyncTest(project.uuid, dataSource.uuid, startParam, dataSource, false);
		});

	});

	describe("Test google provider", () => {
		beforeAll(() => {
			return server.login(credentials);
		});

		let dataSourceGoogle;
		it("POST /projects/:projectUUID/ - google", async () => {
			const dataSourceParam = {
				"provider": dataProviders.GOOGLE,
				"sourceId": "1nLgyxHDsEMoqfjjvCbJoez3W08qjE-q9lt4XvMIf6hk",
				"sourceName": "DMS schedule"
			};
			dataSourceGoogle = await server.createDataSource(project.uuid, dataSourceParam);
		});

		it("POST /projects/:projectUUID/dataSources/startSync - Google/continuous", async () => {
			const startParam = {
				"syncMethod": syncMethods.CONTINUOUS,
				"syncExpiresAt": new Date(Date.now() + 25*3600*1000)
			};
			dataSourceGoogle = await server.startSyncTest(project.uuid, dataSourceGoogle.uuid, startParam, dataSourceGoogle, 60000);
		}, 65000);

		it("POST /projects/:projectUUID/dataSources/startSync - Google/continuous test EXPIRATION", async () => {
			const syncExpiresAt = new Date(Date.now() + 15000);
			const startParam = {
				"syncMethod": syncMethods.CONTINUOUS,
				"syncExpiresAt": syncExpiresAt
			};
			dataSourceGoogle = await server.startSyncTest(project.uuid, dataSourceGoogle.uuid, startParam, dataSourceGoogle, false, true);
		}, 20000);

		it("POST /projects/:projectUUID/dataSources/startSync - Google/continuous TEST PAST EXPIRATION", async () => {
			const syncExpiresAt = new Date(Date.now() - 1000);
			const startParam = {
				"syncMethod": syncMethods.CONTINUOUS,
				"syncExpiresAt": syncExpiresAt
			};
			dataSourceGoogle = await server.startSyncTest(project.uuid, dataSourceGoogle.uuid, startParam, dataSourceGoogle, false, true);
		});

		it("DELETE /projects/:projectUUID/dataSources/:dataSourceUUID", async () => {
			return server.deleteDataSource(project.uuid, dataSourceGoogle.uuid);
		});
	});

	describe("Delete test project", () => {
		beforeAll(() => {
			return server.login(credentials);
		});

		it("DELETE /projects/:projectUUID", async () => {
			return server.deleteProject(project.uuid);
		});

		it("GET /projects/:projectUUID/dataSources/:dataSourceUUID", async () => {
			const currentSyncStatus = dataSource.syncStatus;
			await server.delay(500); // previous delete effect is async
			dataSource = await server.getDataSource(project.uuid, dataSource.uuid);
			if (currentSyncStatus == syncStatus.STARTED) {
				expect(dataSource.syncStatus).toBe(syncStatus.STOPPED);
			} else {
				expect(dataSource.syncStatus).toBe(currentSyncStatus);
			}
		});

	})

});

