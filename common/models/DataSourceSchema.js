const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const dataSourceSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    provider: String,
    sourceId: String,
    sourceName: String,
    sourceSurveyName: String,
    sourceResourceId: String,
    sourceUrl: String,
    sourceEmbedUrl: String,
    syncMethod: String,
    schedule: String,
    schedulePattern: String,
    syncStatus: String,
    syncError: String,
    syncExpiresAt: Date,
    rowNumber: Number,
    columnNumber: Number,
    lastModifiedAt: Date,
    lastDownloadedAt: Date,
    columns: [mongoose.Types.ObjectId],
    dataChecksum: String,
    columnChecksum: String,
    projectId: mongoose.Types.ObjectId,
    createdByUserId: mongoose.Types.ObjectId,
    fileId: mongoose.Types.ObjectId,
    checksumId: mongoose.Types.ObjectId,
    gitSyncStatus: String,
    gitSyncStoppedAt: Date,
    gitSha: String,
    gitUploadAt: Date,
}, { retainKeyOrder: true, timestamps: true, minimize: false });

dataSourceSchema.set('toJSON', { // to include id from _id
    virtuals: true
});

module.exports = dataSourceSchema;