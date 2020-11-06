"use strict";

const { ServiceBroker } = require("moleculer");
const { MoleculerError } = require("moleculer").Errors;
const serviceBroker = require('./../../moleculer.config');
const gitService = require('../../services/git.service');
const fs = require("fs-extra");
const path = require('path');

describe("Test 'git' service", () => {

	const broker = new ServiceBroker(serviceBroker);

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());


	broker.createService(gitService, {
		settings: {
			repoFolder: "/srv/git/",
		}
	});

	const gitRepoName = "testRepo";
	let gitRepoFullPath;
	it("should create a repo", () => {
		return broker.call("git.initRepo", {
			path: gitRepoName
		}).then(res => {
			expect(fs.existsSync(res.gitRepo)).toBe(true);
			expect(fs.existsSync(res.gitRepo + "/.git")).toBe(true);
			gitRepoFullPath = res.gitRepo;
		})
	});

	it("should reject create repo again", () => {
		expect(broker.call("git.initRepo", {
			path: gitRepoName
		})).rejects.toBeInstanceOf(MoleculerError)
	});

	const testFile = "testFile";
	let commit;
	it("should commit a file", () => {
		return fs.copy(path.join(__dirname,"../utils/", testFile), gitRepoFullPath + "/" + testFile)
			.then(() => {
				return broker.call("git.commit", {
					dataSource: {
						uuid: testFile,
						localPath: gitRepoName + "/" + testFile
					}
				})
			}).then(res => {
			commit = res.commit;
			expect(res.commit.length).toBe(7);
		})
	});

	it("should get back file content", () => {
		return broker.call("git.getFileContent", {
			commitId: commit,
			localPath: gitRepoName + "/" + testFile
		}).then(res => {
			const file = fs.readFileSync(gitRepoFullPath + "/" + testFile).toString();
			expect(res).toBe(file);
			fs.removeSync(gitRepoFullPath);
		})

	});

});

