const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const keySchema = new Schema({
    //privateKey: String,
    encryptedPrivateKey: String
}, { retainKeyOrder: true, timestamps: true, minimize: false });

keySchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = keySchema;