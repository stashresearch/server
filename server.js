const serviceBroker = require('./moleculer.config');
const {ServiceBroker} = require("moleculer");

let broker = new ServiceBroker(serviceBroker);

broker.loadServices('./services', '**/*.service.js');

broker.start();
