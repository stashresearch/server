const uiErrorSchema = require("./../common/models/UIErrorSchema");
const mongoMixin = require("./mixins/mongo.mixin");

module.exports = {
    name: "uiError",
    mixins: [mongoMixin],
    modelName: "UIError",
    schema: uiErrorSchema,
    actions: {}
};
