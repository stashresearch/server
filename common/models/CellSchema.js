const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const cellSchema = new Schema({
//const cellSchema = mongoose.Schema({
    v: Schema.Types.Mixed, // value
    cS: String, // checksum
    rId: {
        type: mongoose.Types.ObjectId,
        index: true
    },
    cId: {
        type: mongoose.Types.ObjectId,
        index: true
    },
    dSId: {
        type: mongoose.Types.ObjectId,
        index: true
    },
    co: String, // comment
    dAt: Date
}, { retainKeyOrder: true, timestamps: { createdAt: 'cAt', updatedAt: 'uAt' }, minimize: false, autoIndex: false });

cellSchema.set('toJSON', { // to include id from _id
    virtuals: true
});
//module.exports = mongoose.model('Cell', cellSchema);
module.exports = cellSchema;