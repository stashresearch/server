const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const memberSchema = require("./MemberSchema");

const projectSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    access: {
        type: String,
    },
    /*path: {
        type: String,
        unique: true,
    },*/
    salt: String,
    gitRepo: String,
    gitProvider: String,
    gitSyncStatus: String,
    gitSyncStoppedAt: Date,
    publicKey: String,
    members: [memberSchema],
    dataSourceNumber: Number,
}, { retainKeyOrder: true, timestamps: true, minimize: false });

projectSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = projectSchema;