const crypto = require('crypto');
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const uuidv4 = require('uuid/v4');
const bcrypt = require("bcrypt");
const md5 = require('md5');
const hash = require('object-hash');
const parser = require('csv-parse');
const transform = require('stream-transform');
const _ = require("lodash");
const openpgp = require('openpgp');
const Papa = require("papaparse");
const { getError, errors } = require("./config/errors");

module.exports = {
    name: "util",
    settings: {
        tokenOptions: {
            expiresIn: 24 * 60 * 60, // 1 day
            algorithm: "RS256"
        },
    },
    actions: {
        getUUID: {
            handler() {
                return crypto.createHash("md5").update(uuidv4()).digest("hex");
            }
        },
        generateToken: {
            params: {
                object: "object",
                expiration: "number",
                //privateKey: {type: "class", instanceOf: Buffer}, // probably works with new version of fastest-validator
            },
            handler(ctx) {
                const tokenOptions = this.settings.tokenOptions;
                if (ctx.params.expiration) {
                    tokenOptions.expiresIn = ctx.params.expiration
                }
                return this.sign(ctx.params.object, ctx.params.privateKey, tokenOptions);
            }
        },
        verifyToken: {
            params: {
                token: "string",
                //publicKey: {type: "class", instanceOf: Buffer} // probably works with new version of fastest-validator
            },
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const decoded = await this.verify(ctx.params.token, ctx.params.publicKey);
                        resolve(decoded)
                    } catch (error) {
                        this.logger.error(error);
                        if (error.name == "JsonWebTokenError" || error.message == 'invalid signature') {
                            reject(getError(errors.INVALID_TOKEN))
                        }
                        reject(error)
                    }
                });
            }
        },
        md5: {
            params: {
                input: "string"
            },
            handler(ctx) {
                return md5(ctx.params.input)
            }
        },
        generatePasswordHash: {
            params: {
                password: "string"
            },
            async handler(ctx) {
                const salt = bcrypt.genSaltSync(10);
                return bcrypt.hashSync(ctx.params.password, salt);
            }
        },
        passwordCheck: {
            params: {
                password: "string",
                passwordHash: "string"
            },
            async handler(ctx) {
                const passwordOK = await bcrypt.compare(ctx.params.password, ctx.params.passwordHash);
                if (!passwordOK) {
                    throw getError(errors.UNPROCESSED_REQUEST, [{type: "credentials", field: "*", message: "Email or password not valid"}])
                }
            }
        },
        getDecryptionKey: { // from encrypted key it returns KeyObject to use for decryption
            params: {
                privateKey: "string",
                password: "string"
            },
            handler(ctx) {
                return crypto.createPrivateKey({
                    'key': ctx.params.privateKey,
                    'type': 'pkcs8',
                    'format': 'pem',
                    'cipher': 'aes-256-cbc',
                    'passphrase': ctx.params.password
                });
            }
        },
        exportKey: { // from KeyObject returns an encrypted key
            params: {
                KeyObject: "object",
                password: "string"
            },
            handler(ctx) {
                return ctx.params.KeyObject.export({
                    type: 'pkcs8',
                    format: 'pem',
                    cipher: 'aes-256-cbc',
                    passphrase: ctx.params.password
                });
          }
        },
        encryptString: {
            params: {
                key: "string",
                toEncrypt: "string"
            },
            async handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const encrypted = await openpgp.encrypt({
                            message: openpgp.message.fromText(ctx.params.toEncrypt),
                            publicKeys: (await openpgp.key.readArmored(ctx.params.key)).keys,
                        });
                        resolve(encrypted.data);
                    } catch (error) {
                        reject(error)
                    }
                });
                //ctx.params.key = "-----BEGIN PUBLIC KEY-----\\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtCBUWkYzkEvvSR5pvtS7\\nZbTFWG6VC/wgfMzCL6wJ+KYL2jyHOCAnm+rwcSjT1ifn6sKklv2/qtz9gf1pD+6l\\nIt5yPiZdltPiRroQKdAcIKew1cNJHLUVRbWnqznaVgS8vxqndaa7yBjRTn9o3Syk\\nuWnoyQrZaVp5oOUoiJrM2H4OFLdenk0z2KQ99L0UoUjA1tZN1GaBrD1P+EEe7kpD\\nDRU8RtP7Irt8OC2JKPwz5uGBeZeP4Nd+ac39pIC0CHzEXFsB8NqmpmlqirgaUpHH\\n5cPqjCdcRdImHFp2mbRbdjSJ2QM7JDMf3YUdljZHLGgDg/4kgEpmrw0RDBARmP8C\\n4Zo2SBVPs2SETEtq51+6o40ygbff9S2L3VjQKoOeZSd4j7a4Sg3+S20T1Lae7x9L\\nD0utpYp2oRKdOHJkfbMcWsubrIPyvt4HEpX1wl3ZtwwlOiQtPcaRNEL5XTd2FVnl\\nQMahCH3OXAjj8bx0idJbTRB6iYzggmvSd6zC6r5eyut04awHp45SRcac/coarH4v\\nOuU4bjuFGKQUeQAZYnulGM2xpTO/Lzyyt5iFh9TAAQObDkvigjbAIGh5iIwcdfwe\\nzp7V7+/87gUrl9+ZZsgMtx9dL/efrrHbQbtrt1OetODYHZPXsweIJ+OMXZDN/snh\\nq7tT1MxMKJyvq14pLTFppU0CAwEAAQ==\\n-----END PUBLIC KEY-----\\n".replace(/\\n/gm, '\n')

                /*ctx.params.key = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n" +
                "\n" +
                "xsBNBF8jF4QBCADFhgr0wahb45Q1+OHEAdxCEoIb/Nle4MUD5ZHpobpMFv7j\n" +
                "mIisB+Dp4jryhycLG5C3El1SujhmZghx++SFWQrxy4vk6OrnsBxELsGVu4AB\n" +
                "uBISLhun3pfzYkQNojc7Zmb2/X2LyrBUMPQAyu5rKd8xOfONhPRItaPcKq/K\n" +
                "zpGuyhaRPpXJ/mFkV+562ClQCV1Vn0GDXOXkIVsPKstZVv0vyHdUEXN+zXv4\n" +
                "omHG0sbNxDd0y5h5f9bXUOYd3rLJokc7nsXvVM9BssQTTlpZXIOaTaF5g/Ld\n" +
                "wYtsEFIWu8jtrZUTS8b0KblrMLTe21xlJmnw5dCiW+keYEUzCtJ5hWl5ABEB\n" +
                "AAHNK1N0ZXZlbiBTYWxhdW4gPHN0ZXZlbkByZXNlYXJjaGFyY2hpdmVzLm9y\n" +
                "Zz7CwI0EEAEIACAFAl8jF4QGCwkHCAMCBBUICgIEFgIBAAIZAQIbAwIeAQAh\n" +
                "CRBCwVzX7USZxRYhBIcdsrAtmOoglHS/5kLBXNftRJnFlzMH/2nTxKJvG3bw\n" +
                "Y5bwL/+ECSW/EHMcSh0521Nh8aZUfWZWs2h/YPGayUHc/Gg4Dwsv3O/Kzdjd\n" +
                "iE2ksWsrvFcXrDgqfSoM7w74uQlLCXQ9Gyc5QdCekqlYhTRa1luysLdplOYh\n" +
                "T3K67N4oGf7OFEggWpI9ZfnxXDTZyJoAQu6FrdGnlUEp+2LWIRIdtVqgdUiX\n" +
                "cczTAVExhwMtkYSygxWQWjp77RNXc43D7Js02BRAeh6Nsj4cv/PZqMOdoha3\n" +
                "RjzRUYsVbYvUKCBFLhq0baMH4TlZBEoZ4JOzMxlhlZ60+wS00hQYxmo6SXUw\n" +
                "7UFJkLZxZ9mVT6nRHplApPGgShVxKMDOwE0EXyMXhAEIAJxbzZIQHiw/ikfY\n" +
                "jgTZQxOey/9P3f0W5Ufo+qBaDhTadG32mdhOiaXr92+5+Wr9JDJDn5VBQl/8\n" +
                "DI+iR2P+ucvgEn8XZ3aDS7ltSAuSQJgoIcaue66RSbJJOqNGY9ruJ5HHfsfi\n" +
                "EAeho28fvFEZ9m+Z5csp4/lbsS8wmqKlMKcKPefSM5o4tKmFIDPAUqYzGlIx\n" +
                "E8JPZkGUqmdhU3Au2l2qBo2XyILjfIqY1o/a3WFHQpMs9UQ5O8VTgrzvY1pA\n" +
                "wPMeIacJwUKH9vcyEU3ogdaIoggEwUrwI3fHFsGpkaXygkFmgE61PF/tceNd\n" +
                "dI2asnsKWLEVUzh9I9hUw+5pesUAEQEAAcLAdgQYAQgACQUCXyMXhAIbDAAh\n" +
                "CRBCwVzX7USZxRYhBIcdsrAtmOoglHS/5kLBXNftRJnFVxwH/0dkYApiID03\n" +
                "1HHTCuIwDIzBQSq4pVa8MjScQLCyI8M2LHiydJvPhNtH/V6nja09MUDNJD2O\n" +
                "FXcBANuwpeqcBSR405vlwbvY/ja/vaDVpud2V7jAwnmhPUhsVdrfhZMq+EhS\n" +
                "JtVa1Q8jWkh9AoLh0sDENow1iNvg03ChVuBW2URg9ewrVRQkLs6KnQZwFILt\n" +
                "F7EfJrR5atCQ0bpqYP4MMjlQ9AwslENJ7vdXbz3W/JpL61xWQdDml2C8E2Mu\n" +
                "Xt/AJZUylFtAiQhfPKi8brBWU3OeOxy99fitAHetL0zK+INIqDa3ExSawn1x\n" +
                "oBtXHAgpAs/AfFAcXBS2ztvwNFgjpeg=\n" +
                "=nfFr\n" +
                "-----END PGP PUBLIC KEY BLOCK-----\n"
                 */
                //return crypto.publicEncrypt(ctx.params.key, Buffer.from(ctx.params.toEncrypt)).toString("base64")
            }
        },
        decryptString: {
            params: {
                KeyObject: "object",
                toDecrypt: "string"
            },
            handler(ctx) {
                return crypto.privateDecrypt(ctx.params.KeyObject, Buffer.from(ctx.params.toDecrypt, "base64")).toString("utf8");
            }
        },
        generateKeyPair: {
            params: {
                password: "string"
            },
            async handler(ctx) {
                return crypto.generateKeyPairSync('rsa', {
                    modulusLength: 4096,
                    publicKeyEncoding: {
                        type: 'spki',
                        format: 'pem'
                    },
                    privateKeyEncoding: {
                        type: 'pkcs8',
                        format: 'pem',
                        cipher: 'aes-256-cbc',
                        passphrase: ctx.params.password
                    }
                })
            }
        },
        getRandomHex: {
            params: {
                length: "number|optional|default:4"
            },
            async handler(ctx) {
                let randomInt = await ctx.call('util.getRandomInt', {
                    min: Math.pow(16, ctx.params.length - 1),
                    max: Math.pow(16, ctx.params.length) - 1
                });
                return randomInt.toString(16);
            }
        },
        getRandomInt: {
            params: {
                min: 'number',
                max: 'number'
            },
            handler(ctx) {
                let min = Math.ceil(ctx.params.min);
                let max = Math.floor(ctx.params.max);
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }
        },
        getRandomDate: {
            params: {
                start: {
                    type: "date",
                    convert: true
                },
                end: {
                    type: "date",
                    convert: true
                }
            },
            handler(ctx) {
                const date = new Date(+ctx.params.start + Math.random() * (ctx.params.end - ctx.params.start));
                return date
            }
        },
        hashObject: {
            params: {
                input: "any"
            },
            handler(ctx) {
               return hash(ctx.params.input);
            }
        },
        csvParserOld: {
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    let data = [];
                    let columns;
                    let i = 0;
                    ctx.params
                        .on('error', (error) => reject(error))
                        .pipe(parser())
                        .pipe(transform(function (record, callback) {
                            if (i === 0) {
                                columns = record;
                                if (_.uniq(columns).length != columns.length) throw getError(errors.NOT_UNIQUE, {columns})
                            } else {
                                data.push(_.map(columns, (value, index) => { // iterate the columns, don't care if there is data outside the tabular csv
                                    return {columnName: value, value: record[index]}
                                }));
                            }
                            i++;
                            callback()
                        }))
                        .on("error", (error) => reject(error))
                        .on("finish", () => resolve({data, columns}))
                })
            }
        },
        csvParser: {
            handler(ctx) {
                return new Promise(async (resolve, reject) => {
                    return Papa.parse(ctx.params, {
                        complete: function(results) {
                            resolve({data: results.data, columns: results.data[0]});
                        },
                        error: function(error, file, input, reason)
                        {
                            this.logger.error("Parse error", {error, file, input, reason});
                            reject(error)
                        },
                    })
                })
            }
        },
        arrayToCSV: {
            params: {
                array: "array"
            },
            handler(ctx) {
                return Papa.unparse(ctx.params.array)
            }
        },
        isEqualArray: {
            params: {
                array1: "array",
                array2: "array"
            },
            handler(ctx) {
                const array1 = ctx.params.array1.sort();
                const array2 = ctx.params.array2.sort();
                return _.isEqual(array1, array2)
            }
        }
    },
    created() {
        this.sign = promisify(jwt.sign);
        this.verify = promisify(jwt.verify);
    },
};