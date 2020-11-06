const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
    name: {
        type: String,
        unique: true,
        required: true
    },
    email: {
        type: String,
        unique: true,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    locale: String,
    emailVerified: {
        type: Boolean,
        default: 0
    },
    emailAllowed: {
        type: Boolean,
        default: 1
    },
    profileImage: {
        type: String,
        default: "5035004a4770c9782397c9188221429f"
    },
    active: {
        type: Boolean,
        default: 1
    },
    credentials: {
        type: Schema.Types.Mixed,
        default: {}
    },
    /*projects: {
        type: Array,
        default: []
    }*/
}, { retainKeyOrder: true, timestamps: true, minimize: false });

userSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

/*userSchema.methods.addCredential = function (credential) {
    this.credential[credential.provider] = credential
};
userSchema.methods.getCredential = function (provider) {
    return this.credential[provider];
};
userSchema.methods.deleteCredential = function (provider) {
    delete this.credential[provider];
};*/

module.exports = userSchema;