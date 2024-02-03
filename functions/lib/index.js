"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = exports.updateUser = exports.deleteUser = exports.addUser = void 0;
const zod_1 = require("zod");
const https_1 = require("firebase-functions/v2/https");
const functions = require("firebase-functions/v1");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const logger_1 = require("firebase-functions/logger");
(0, app_1.initializeApp)();
const db = {
    users: (0, firestore_1.getFirestore)().collection("users"),
};
const TagZ = zod_1.z.object({
    id: zod_1.z.number(), created: zod_1.z.date(), name: zod_1.z.string(), color: zod_1.z.string(),
});
// type Tag = z.infer<typeof TagZ>
const EntryZ = zod_1.z.object({
    id: zod_1.z.number(), created: zod_1.z.date(), start: zod_1.z.date(), note: zod_1.z.string(), tags: zod_1.z.array(TagZ),
});
// type Entry = z.infer<typeof EntryZ>
const UserZ = zod_1.z.object({
    uid: zod_1.z.string(), created: zod_1.z.coerce.date(), name: zod_1.z.string(), birth: zod_1.z.coerce.date(), expYears: zod_1.z.number(), email: zod_1.z.string().email().optional(), entries: zod_1.z.array(EntryZ), tags: zod_1.z.array(TagZ),
});
const InitialUserZ = UserZ.partial({ name: true, birth: true, expYears: true, email: true });
const UserProfileZ = UserZ.partial({ uid: true, created: true, entries: true, tags: true });
// const secretNames: [string] = ["GITHUB_CLIENT_ID"]
// const secrets = Object.fromEntries(secretNames.map(x => [x, readFileSync(`../.secrets/${x.toLowerCase()}`, 'utf-8')]))
async function validateUid(request) {
    const { uid, idToken } = request.query;
    (0, logger_1.debug)(`UID: ${uid}, idToken: ${idToken}`);
    return (0, auth_1.getAuth)().verifyIdToken(idToken)
        .then((decodedToken) => decodedToken.uid)
        .then(decodedUid => {
        if (uid == decodedUid) {
            return decodedUid;
        }
        else {
            throw Error("UID provided does not match session token");
        }
    })
        .catch(error => { throw Error("Failed to decode UID from idToken: " + error.message); });
}
async function userFromRequest(request) {
    return validateUid(request)
        .then(uid => db.users.doc(uid).get())
        .then(docSnapshot => docSnapshot.data())
        .then(user => {
        if (user == null) {
            throw Error;
        }
        else {
            if (!(user.created == null)) {
                user.created = user.created.toDate();
            }
            if (!(user.birth == null)) {
                user.birth = user.birth.toDate();
            }
            return InitialUserZ.parse(user);
        }
    })
        .catch(error => { throw Error("Failed to get user from request: " + error.message); });
}
// export const helloWorld = onRequest((request, response) => {
//     logger.info("Hello logs!", { structuredData: true });
//     response.send("Hello again !");
// });
exports.addUser = functions.auth.user().onCreate(async (user) => {
    const { uid, email } = user;
    const newUser = { uid: uid, created: new Date(), entries: [], tags: [] };
    (0, logger_1.log)("Add user triggered", newUser);
    return await db.users.doc(user.uid).set(Object.assign(Object.assign({}, newUser), (email && { email })));
});
exports.deleteUser = functions.auth.user().onDelete(async (user) => {
    (0, logger_1.log)("Delete user triggered", user);
    return await db.users.doc(user.uid).delete();
});
exports.updateUser = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const { name, birth, expYears, email } = request.query;
    const newUser = UserProfileZ.parse({ name: name, email: email, birth: new Date(birth), expYears: parseInt(expYears) });
    const uid = await validateUid(request);
    db.users.doc(uid).update(newUser)
        .then(result => response.status(200).send({ uid: uid, updated: result.writeTime }))
        .catch(error => {
        error("Error editing user profile: " + error.message);
        response.status(500).send(error.message);
    });
});
exports.getUser = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const user = await userFromRequest(request);
    (0, logger_1.debug)(user);
    try {
        (0, logger_1.debug)(user);
        response.status(200).send(user);
    }
    catch (e) {
        (0, logger_1.error)(`Error getting user from request: ${e}, user object: ${user}`);
        response.status(500).send(user);
    }
    // .then(user => {
    //   log(user);
    //   return InitialUserZ.parse(user);
    // })
    // .then((user: InitialUser) => response.status(200).send(user))
    // .catch(error => response.status(500).send(error.message));
});
//# sourceMappingURL=index.js.map