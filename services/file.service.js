'use strict';
const fs = require("fs-extra");
const mkdir = require("mkdirp").sync;
const path = require("path");
const sharp = require("sharp");
const mime = require("mime");
const generateUUID = require("./../common/helpers/generateUUID");
const parser = require('csv-parse');
const transform = require('stream-transform');

module.exports = {
    name: "file",
    settings: {
        imageFolder: "/var/www/profileImages/",
        repoFolder: "/srv/git/",
        repoArchiveFolder: "/srv/gitArchive/",
        imageSize: 1000
    },
    actions: {
        saveProfileImage: {
            handler(ctx) {
                return new Promise((resolve, reject) => {
                    const fileNameHash = generateUUID();
                    const folder = this.settings.imageFolder + fileNameHash.substring(0, 1) + "/" + fileNameHash.substring(1, 3) + "/" + fileNameHash.substring(3, 5) + "/";

                    mkdir(folder);
                    const mimetype = mime.getExtension(ctx.meta.mimetype);
                    const filePath = path.join(folder, fileNameHash + '_orig' + (mimetype ? "." + mimetype : ""));
                    const file = fs.createWriteStream(filePath);
                    file.on("close", () => {
                        this.logger.info(`Uploaded file stored in '${filePath}'`);
                        return this.convertToJPEG(file, folder, fileNameHash)
                            .then(() => resolve({fileName: fileNameHash}))
                            .catch(err => reject(err))
                    });
                    file.on("error", err => reject(err));
                    ctx.params.pipe(file);
                });
            }
        },
        saveProjectFile: {
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const stream = fs.createWriteStream(this.getFullPath(ctx.meta.path));
                        ctx.params
                            .on('error', (error) => reject(error))
                            /*.pipe(parser())
                            .pipe(transform(function (record, callback) {
                                callback(null, record.join("\t") + "\n")
                            }))*/
                            .pipe(stream)
                            .on('error', (error) => reject(error))
                            .on('finish', () => resolve());
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        saveTest: {
            handler(ctx) {
                console.log(ctx);
                return {}
            }
        },
        removeFile: {
            params: {
                path: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const path = this.getFullPath(ctx.params.path);
                        if (fs.existsSync(path)) {
                            fs.unlinkSync(path);
                            resolve(true)
                        } else {
                            resolve(false)
                        }
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        getFileMeta: {
            params: {
                path: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const path = this.getFullPath(ctx.params.path);
                        if (fs.existsSync(path)) {
                            const meta = fs.statSync(path);
                            resolve(meta)
                        } else {
                            resolve({})
                        }
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        removeFolder: {
            params: {
                path: "string",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const path = this.getFullPath(ctx.params.path);
                        fs.removeSync(path);
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        copyFolder: {
            params: {
                fromPath: "string",
                toPath: "string"
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const fromPath = this.getFullPath(ctx.params.fromPath);
                        const toPath = this.getFullPath(ctx.params.toPath);
                        fs.copySync(fromPath, toPath, ctx.options);

                        /*let newPath = this.settings.repoArchiveFolder + ctx.params.path;
                        if (fs.existsSync(path)) { // if path exists move it
                            let destFolderFound = 0;
                            while (!destFolderFound) { // create a notexisting path
                                const randomHex = await ctx.call("util.getRandomHex");
                                newPath = newPath + "-" + randomHex;
                                if (!fs.existsSync(newPath)) {
                                    destFolderFound = 1
                                }
                            }
                            fs.moveSync(path, newPath);
                        }*/
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
        moveFolder: {
            params: {
                path: "string",
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
//                        const fromPath = this.getFullPath(ctx.params.fromPath);
//                        const toPath = this.getFullPath(ctx.params.toPath);
//                        fs.copySync(fromPath, toPath, ctx.options);
                        const fromPath = this.getFullPath(ctx.params.path);
                        let toPath = this.settings.repoArchiveFolder + ctx.params.path;
                        if (fs.existsSync(fromPath)) { // if path exists move it
                            let destFolderFound = 0;
                            while (!destFolderFound) { // create a non-existing path
                                const randomHex = await ctx.call("util.getRandomHex");
                                toPath = toPath + "-" + randomHex;
                                if (!fs.existsSync(toPath)) {
                                    destFolderFound = 1
                                }
                            }
                            fs.moveSync(fromPath, toPath);
                        }
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                });
            }
        },
    },
    methods: {
        convertToJPEG(file, folder, fileName) {
            return sharp(file.path)
                .rotate()
                //.resize(fieldName == 'result' ? this.settings.imageSize : undefined) // scale down if result upload
                .jpeg()
                .toFile(folder + fileName + '.jpeg');
        },
        getFullPath(path) {
            return this.settings.repoFolder + path;
        },
    },
    created() {
        mkdir(this.settings.repoArchiveFolder);
        mkdir(this.settings.repoFolder);
    }
};
