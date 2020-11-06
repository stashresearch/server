const crypto = require('crypto');
const uuidv4 = require('uuid/v4');

module.exports = function () {
    return crypto.createHash("md5").update(uuidv4()).digest("hex");
};
