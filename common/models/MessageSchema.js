const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema({
    to: String,
    userId: mongoose.ObjectId,
    channel: String,
    template: String,
    queued: {
        type: Boolean,
        default: 1
    },
    sent: {
        type: Boolean,
        default: 0
    },
    delivered: {
        type: Boolean,
        default: 0
    },
    bounced: {
        type: Boolean,
        default: 0
    },
    open: {
        type: Boolean,
        default: 0
    },
    click: {
        type: Boolean,
        default: 0
    },
    unsubscribe: {
        type: Boolean,
        default: 0
    },
    complaint: {
        type: Boolean,
        default: 0
    },
    location: {
        country: String,
        region: String,
        city: String,
        latitude: Number,
        longitude: Number
    },
    params: {},
    expiresAt: Date,
}, { retainKeyOrder: true, timestamps: true, minimize: false });

messageSchema.set('toJSON', { // to include id from _id
    virtuals: true
});
module.exports = messageSchema;