const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const dataRowSchema = new Schema({
    row: String,
    column: String,
    value: Schema.Types.Mixed,
    dataSourceId: String,
    participantId: String,
}, { retainKeyOrder: true, timestamps: true, minimize: false, autoIndex: false });

dataRowSchema.index({row: 1, column: 1, createdAt: 1}, {unique: true});

dataRowSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = dataRowSchema;