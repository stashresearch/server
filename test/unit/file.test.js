"use strict";

const { ServiceBroker } = require("moleculer");
const serviceBroker = require('./../../moleculer.config');
const fs = require("fs-extra");
const path = require('path');

describe("Test 'file' service", () => {
	const broker = new ServiceBroker(serviceBroker);

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	broker.loadServices('./services', ["file.service.js"]);
	const projectFolder = broker.getLocalService("file").schema.settings.repoFolder;

	it("should save project file to `path` location", () => {
		const testFolder = "testFolder";
		const testFile = "testFile";
		const sourceFullPath = path.join(__dirname, "../utils/", testFile);
		const targetFolder = projectFolder + testFolder;
		const targetFullPath = targetFolder + "/" + testFile;
		const targetRelativePath = testFolder + "/" + testFile;
		fs.mkdirpSync(targetFolder);
		const stream = fs.createReadStream(sourceFullPath);
		return broker.call("file.saveProjectFile", stream, {meta: {path: targetRelativePath}}).then(res => {
			expect(fs.existsSync(targetFullPath)).toBe(true);
			fs.removeSync(targetFolder);
		})
	});

});

