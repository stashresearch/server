const fs = require("fs");
let path = require("path");
const messageTemplateDir = "services/config/messageTemplates";

const messageTemplateList = fs.readdirSync(path.join(__dirname, "messageTemplates"));

let messageTemplates = {};
messageTemplateList.map((template) => {
    messageTemplates[template.toUpperCase()] = template
});

module.exports = {
    projectAccessLevel: {
        PRIVATE: "private",
        PUBLIC: "public"
    },
    projectRole: {
        OWNER: "owner",
        ADMIN: "admin",
        RESEARCHER: "researcher",
        PENDING: "pendingInvitation",
        VIEWER: "viewer"
    },
    projectPermissions: {
        viewer: {
            "allowed": ["project.getProject", "dataSource.findProjectDS", "dataSource.getData", "dataSource.getCSV"]
        },
        pendingInvitation: {
            "allowed": ["project.accept", "project.decline"],
        },
        researcher: {
            "allowed": ["project.getProject", "dataSource.findProjectDS", "dataSource.create", "dataSource.getDataSource", "data.get", "dataSource.upload", "project.accept", "project.decline"],
            "allowedIfCreated": ["dataSource.setup", "dataSource.startSync", "dataSource.download", "dataSource.setupGitUpload"]
        },
        admin: {
            "allowed": ["*.*"],
            "disallowed": ["project.remove", "dataSource.remove"]
        },
        owner: {
            "allowed": ["*.*"]
        }
    },
    events: {
        CREATED: 'created',
        DOWNLOADED: 'downloaded',
        DOWNLOAD_ERROR: 'downloadError', // not used
        COMMITTED: 'committed',
        SYNC_STARTED: 'syncStarted',
        SYNC_STOPPED: 'syncStopped',
        SYNC_EXPIRED: 'syncExpired',
        DELETED: 'deleted'
    },
    syncStatus: {
        STARTED: "started",
        STOPPED: "stopped",
        EXPIRED: "expired",
        BROKEN: "broken"
    },
    syncMethods: {
        CONTINUOUS: "continuous",
        PERIODIC: "periodic",
        MANUAL: "manual"
    },
    syncErrors: {
        NOT_FOUND: "notFound",
        AUTH_ERROR: "authError",
        AUTH_REVOKEN: "authRevoken",
        DATA_VERIFICATION_ERROR: "dataVerificationError"
    },
    messageTemplateList: messageTemplateList,
    messageTemplateDir: messageTemplateDir,
    messageTemplates: messageTemplates,
    channels: {
        EMAIL: "email",
        NOTIFICATION: "notification",
        SMS: "sms"
    },
    messageEvents: {
        QUEUED: "queued",
        SENT: "sent",
        DELIVERED: "delivered",
        BOUNCED: "bounced",
        UNSUBSCRIBE: "unsubscribe",
        COMPLAINT: "complaint",
        OPEN: "open",
        CLICK: "click"
    },
    dataProviders: {
        GOOGLE: "google",
        FORMR: "formr",
        FILEUPLOAD: "fileUpload"
    },
    gitProviders: {
        GITHUB: "github"
    },
    gitRepoSyncStatus: {
        SYNCING: "syncing",
        STOPPED: "stopped",
        ERROR: "error"
    },
    scheduleValues: {
        "EVERY_MINUTE": "every minute",
        "EVERY_2_MINUTES": "every 2 minutes",
        "EVERY_3_MINUTES": "every 3 minutes",
        "EVERY_5_MINUTES": "every 5 minutes",
        "EVERY_6_MINUTES": "every 6 minutes",
        "EVERY_10_MINUTES": "every 10 minutes",
        "EVERY_12_MINUTES": "every 12 minutes",
        "EVERY_15_MINUTES": "every 15 minutes",
        "EVERY_20_MINUTES": "every 20 minutes",
        "EVERY_30_MINUTES": "every 30 minutes",
        "EVERY_HOUR": "every hour",
        "EVERY_2_HOURS": "every 2 hours",
        "EVERY_3_HOURS": "every 3 hours",
        "EVERY_4_HOURS": "every 4 hours",
        "EVERY_6_HOURS": "every 6 hours",
        "EVERY_8_HOURS": "every 8 hours",
        "EVERY_12_HOURS": "every 12 hours",
        "EVERY_DAY": "every day",
    },
    server: {
        apiserver: "https://api.stashresearch.org/v2",
        webserver: "https://www.stashresearch.org"
    }
};