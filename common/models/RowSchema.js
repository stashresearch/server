const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const rowSchema = new Schema({
    key: {
        type: String,
        index: true
    },
    checksum: String,
    cells: [mongoose.Types.ObjectId],
    dataSourceId: mongoose.Types.ObjectId,
    //participantKey: String,
    comment: String,
    deletedAt: Date
}, { retainKeyOrder: true, timestamps: true, minimize: false, autoIndex: false });

rowSchema.index({key: 1, dataSourceId: 1});

rowSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = rowSchema;