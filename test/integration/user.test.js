"use strict";

const { credentials, firstProject } = require("./../utils/config.test");
const ApiServer = require("./../utils/ApiServer");

describe("Test 'user' service", () => {

	let broker, server;
	beforeAll(() => {
		server = new ApiServer();
		broker = server.broker;
		return broker.start();
	});

	afterAll(() => {
		return broker.stop()
	});

	let user;

	describe("Signup/login", () => {

		beforeAll(() => {
			return server.login(credentials);
		});

		it("POST /auth/signup", async () => {
			if (!server.token) {
				return server.signup(credentials);
			} else {
				return server.signup(credentials, 409);
			}
		});

		it("POST /auth/signup - EMAIL DUPLICATE", async () => {
			return server.signup(credentials, 409);
		});

		it("POST /auth/login", async () => {
			return server.login(credentials);
		});

		it("GET /user/me", async () => {
			user = await server.getUser();
		});

		it("PUT /user/me", async () => {
			user = await server.updateUser({lastName: "Tester"});
		});
	});


	describe("Credentials, basic user requests", () => {
		beforeAll(() => {
			return server.login(credentials);
		});

		// google credential is set up previously in the DB

		it("GET /user/me/credentials", async () => {
			await server.getCredentials("google");
		});

		it("POST /user/me/credentials", async () => {
			const formRCredentials = {
				"provider": "formr",
				"clientId": "c367699223f260ce4f4f6d594e749e6b",
				"clientSecret": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9ImMzNjc2OTkyMjNmMjYwY2U0"
			};
			await server.createCredentials(formRCredentials);
		});

		it("POST /user/me/password/reset - INIT PWD RESET", async () => {
			await server.initializePasswordReset(credentials.email);
		});

		it("PUT /user/me/password", async () => {
			credentials.password = "s";
			await server.updatePassword(credentials);
		});
		//  pwd reset form schema: https://stashresearch.org/passwordReset/a9b7b0bf52edc4b88d94a2b043b4b86f

		it("POST /auth/login/ - NEW PASSWORD", async () => {
			return server.login(credentials, 200);
		});

		it("POST /user/me/password/reset - INIT PWD RESET FOR CHANGING BACK PWD", async () => {
			await server.initializePasswordReset(credentials.email);
		});

		it("PUT /user/me/password - CHANGE BACK PWD", async () => {
			credentials.password = "a";
			await server.updatePassword(credentials);
		});

		it("POST /user/me/email/verify - INITIALIZE VERIFY EMAIL", async () => {
			return server.initializeEmailVerification();
		});

		it("GET user/me/verify - VERIFY EMAIL", async () => {
			return server.verifyEmail();
		});

		// TODO check user table emailVerified

		it("POST /user/me/profileImage - UPLOAD PROFILE IMAGE", async () => {
			const userToMerge = await server.uploadProfileImage();
			Object.assign(user, userToMerge);
		});
	});
	/*
        describe("Basic project requests", () => {
            beforeAll(() => {
                return server.login(credentials);
            });

            let projects;
            it("GET /projects", async () => {
                projects = await server.getProjects();
                expect(projects.length).toBe(0);
            });

            it("POST /projects/:projectUUID", async () => {
                const project = await server.createProject(firstProject);
                projects.push(project);
            });

            it("GET /projects/:projectUUID", () => {
                return server.getProject(projects[0].uuid);
            });

            it("DELETE /projects/:projectUUID", () => {
                return server.deleteProject(projects[0].uuid);
            });

            it("GET /projects", async () => {
                projects = await server.getProjects();
                expect(projects.length).toBe(0);
            });
        })
    */

});

