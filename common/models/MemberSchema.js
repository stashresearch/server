const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const memberSchema = new Schema({
        userId: mongoose.Types.ObjectId,
        email: String,
        name: String,
        firstName: String,
        lastName: String,
        profileImage: String,
        role: String,
        //privateKey: mongoose.Types.ObjectId,
        encryptedPrivateKey: mongoose.Types.ObjectId,
        invitedAt: Date,
        acceptedAt: Date,
        declinedAt: Date,
        needsRecovery: Boolean
}, { retainKeyOrder: true, timestamps: true, minimize: false });

memberSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = memberSchema;