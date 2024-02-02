"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = exports.editUserProfile = exports.deleteUser = exports.addUser = void 0;
const zod_1 = require("zod");
// import { readFileSync } from 'fs';
// import * as logger from "firebase-functions/logger";
const https_1 = require("firebase-functions/v2/https");
const functions = require("firebase-functions/v1");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
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
const InitialUserZ = zod_1.z.object({
    uid: zod_1.z.string(), created: zod_1.z.date()
});
const UserZ = zod_1.z.object({
    uid: zod_1.z.string(), created: zod_1.z.date(), name: zod_1.z.string(), birth: zod_1.z.date(), expYears: zod_1.z.number(), email: zod_1.z.string().email().optional(), entries: zod_1.z.array(EntryZ), tags: zod_1.z.array(TagZ),
});
// type User = z.infer<typeof UserZ>
// const secretNames: [string] = ["GITHUB_CLIENT_ID"]
// const secrets = Object.fromEntries(secretNames.map(x => [x, readFileSync(`../.secrets/${x.toLowerCase()}`, 'utf-8')]))
async function validateUid(request) {
    const { idToken } = request.query;
    return (0, auth_1.getAuth)().verifyIdToken(idToken)
        .then((decodedToken) => decodedToken.uid);
}
async function userFromRequest(request) {
    return validateUid(request)
        .then((uid) => db.users.where("uid", "==", uid).limit(1))
        .then((query) => query.get())
        .then((querySnapshot) => querySnapshot.docs[0]);
}
// export const helloWorld = onRequest((request, response) => {
//     logger.info("Hello logs!", { structuredData: true });
//     response.send("Hello again !");
// });
exports.addUser = functions.auth.user().onCreate(async (user) => {
    console.log("Add user triggered", user);
    return await db.users.doc(user.uid).set({ created: new Date() });
});
exports.deleteUser = functions.auth.user().onDelete(async (user) => {
    console.log("Delete user triggered", user);
    return await db.users.doc(user.uid).delete();
});
exports.editUserProfile = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const { name, birth, expYears, email } = request.query;
    validateUid(request)
        .then((uid) => {
        return { uid: uid, created: new Date(), name: name, birth: new Date(birth), expYears: parseInt(expYears), entries: [], tags: [] };
    })
        .then(newUser => UserZ.parse(Object.assign(Object.assign({}, newUser), (email && { email }))))
        .then(newUser => db.users.add(newUser))
        .then((res) => res.get())
        .then(user => response.send(user))
        .catch(error => console.error("Error adding user!", error));
});
// export const deleteUser = onRequest({ cors: true }, async (request, response) => {
//     userFromRequest(request)
//         .then(user => user.ref.delete())
//         .then(_ => response.status(200).send("Deleted"))
//         .catch(error => response.status(500).send(`Error ${error}`))
// });
exports.getUser = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    userFromRequest(request)
        .then(user => {
        console.log(user);
        return InitialUserZ.parse(user);
    })
        .then((user) => response.status(200).send(user))
        .catch(error => response.status(500).send(`Error ${error}`));
});
//# sourceMappingURL=index.js.map