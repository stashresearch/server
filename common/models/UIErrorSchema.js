const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const uiErrorSchema = new Schema({
    error: Schema.Types.Mixed,
}, { retainKeyOrder: true, timestamps: true, minimize: false, autoIndex: false, strict: false});

uiErrorSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = uiErrorSchema;