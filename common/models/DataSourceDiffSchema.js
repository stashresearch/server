const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const dataSourceSchema = new Schema({
    dSId: mongoose.Types.ObjectId,
    previousFileId: mongoose.Types.ObjectId,
    previousCSId: mongoose.Types.ObjectId,
    fileId: mongoose.Types.ObjectId,
    cSId: mongoose.Types.ObjectId,
    addedRowIds: Array,
    deletedRowIds: Array,
    deletedRows: Schema.Types.Mixed,
    cellValueChanges: Array,
    numberOfLines: Number,
    numberOfColumns: Number,
    message: String
}, { retainKeyOrder: true, timestamps: true, minimize: false });

dataSourceSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = dataSourceSchema;