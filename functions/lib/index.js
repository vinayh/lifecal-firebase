"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addUser = exports.helloWorld = void 0;
const zod_1 = require("zod");
const fs_1 = require("fs");
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const { getFirestore, Timestamp, FieldValue, Filter } = require('firebase-admin/firestore');
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
initializeApp();
const db = {
    users: getFirestore().collection('users')
};
const TagZ = zod_1.z.object({
    id: zod_1.z.number(), created: zod_1.z.date(), name: zod_1.z.string(), color: zod_1.z.string()
});
const EntryZ = zod_1.z.object({
    id: zod_1.z.number(), created: zod_1.z.date(), start: zod_1.z.date(), note: zod_1.z.string(), tags: zod_1.z.array(TagZ)
});
const UserZ = zod_1.z.object({
    uid: zod_1.z.string(), created: zod_1.z.date(), birth: zod_1.z.date(), expYears: zod_1.z.number(), email: zod_1.z.string().email().optional(), entries: zod_1.z.array(EntryZ), tags: zod_1.z.array(TagZ)
});
// function isUser(user: User): user is User {
//     return user.uid !== undefined && user.created !== undefined
//         && user.birth !== undefined && user.expYears !== undefined
//         && user.expYears !== undefined && !isNaN(user.expYears)
// }
const secretNames = ["GITHUB_CLIENT_ID"];
const secrets = Object.fromEntries(secretNames.map(x => [x, (0, fs_1.readFileSync)(`../.secrets/${x.toLowerCase()}`, 'utf-8')]));
exports.helloWorld = (0, https_1.onRequest)((request, response) => {
    logger.info("Hello logs!", { structuredData: true });
    response.send("Hello again !");
});
exports.addUser = (0, https_1.onRequest)(async (request, response) => {
    const { uid, birth, expYears, email } = request.query;
    var user = { uid: uid, created: new Date(), birth: new Date(birth), expYears: parseInt(expYears), entries: [], tags: [] };
    user = UserZ.parse(Object.assign(Object.assign({}, user), (email && { email })));
    db.users.add(user)
        .then(res => { response.send(res); })
        .catch(error => { console.error("Caught error!", error); });
});
//# sourceMappingURL=index.js.map