const {workerData} = require('worker_threads');

// Script to make WebWorkers (written in TypeScript) executable in JavaScript
require('ts-node').register();
require(workerData.workerPath);
