const Email = require('email-templates');
const { messageTemplateDir } = require('./config/config');

module.exports = {
    name: 'mail',
    settings: {
        templateFolder: "./" + messageTemplateDir,
        from: '"StashResearch" noreply@stashresearch.org',
        transport: {
            service: 'Mandrill',
            auth: {
                user: 'CREDENTIAL',
                pass: 'CREDENTIAL'
            }
        },
    },
    actions: {
        send: {
            params: {
                to: "email",
                template: "string",
                data: "object|optional"
            },
            handler(ctx) {
                this.logger.debug("Sending mail", ctx.params);
                return new Promise(async (resolve, reject) => {
                    try {
                        const result = await this.sender.send({
                            template: ctx.params.template,
                            message: {
                                headers: ctx.params.headers,
                                to: ctx.params.to
                            },
                            locals: ctx.params.data
                        });
                        resolve(result)
                    } catch (error) {
                        reject(error);
                    }
                })
            }
        }
    },
    methods: {

    },
    created() {
        const sender = new Email({
            message: {
                from: this.settings.from
            },
            views: { root: this.settings.templateFolder },
            // uncomment below to send emails in development/test env:
            send: true,
            transport: this.settings.transport
        });
        this.sender = sender;
    }
};
