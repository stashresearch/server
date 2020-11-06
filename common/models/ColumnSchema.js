const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const columnSchema = new Schema({
    name: String,
    key: {
        type: Boolean,
        default: false
    },
    /*participantKey: {
        type: Boolean,
        default: false
    },*/
    omit: {
        type: Boolean,
        default: false
    },
    encrypt: {
        type: Boolean,
        default: false
    },
    type: String,
    category: String,
    description: String,
    deletedAt: Date,
    dataSourceId: mongoose.Types.ObjectId
});

columnSchema.index({dataSourceId: 1});

columnSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = columnSchema;