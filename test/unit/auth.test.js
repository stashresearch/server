"use strict";

const { ServiceBroker } = require("moleculer");
const { credentials } = require("./../utils/config.test");
const serviceBroker = require('./../../moleculer.config');

describe("Test 'git' service", () => {

	const broker = new ServiceBroker(serviceBroker);

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	broker.loadServices('./services', ["auth.service.js", "user.service.js"]);

	it("should successfully login", () => {
		return broker.call("auth.login", credentials)
			.then(res => {
				expect(res.token).not.toBeNull()
			})
	});

});

