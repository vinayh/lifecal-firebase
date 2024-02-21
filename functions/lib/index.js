"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addUpdateEntry = exports.getUser = exports.updateUserProfile = exports.deleteUser = exports.addUser = void 0;
const zod_1 = require("zod");
const https_1 = require("firebase-functions/v2/https");
const functions = require("firebase-functions/v1");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const logger_1 = require("firebase-functions/logger");
const date_fns_1 = require("date-fns");
(0, app_1.initializeApp)();
const db = {
    users: (0, firestore_1.getFirestore)().collection("users"),
};
const TagZ = zod_1.z.object({
    id: zod_1.z.number(), created: zod_1.z.date(), name: zod_1.z.string(), color: zod_1.z.string(),
});
const EntryZ = zod_1.z.object({
    id: zod_1.z.number(), created: zod_1.z.date(), start: zod_1.z.date(), note: zod_1.z.string(), tags: zod_1.z.array(zod_1.z.string()),
});
// TODO: Update db schema to use ISO date strings as keys/properties mapping to entry objects
const UserZ = zod_1.z.object({
    uid: zod_1.z.string(), created: zod_1.z.coerce.date(), name: zod_1.z.string(), birth: zod_1.z.coerce.date(), expYears: zod_1.z.number().refine(i => i > 0), email: zod_1.z.string().email(), entries: zod_1.z.array(EntryZ), tags: zod_1.z.array(TagZ),
});
// const InitialUserZ = UserZ.partial({ name: true, birth: true, expYears: true, email: true })
const ProfileUpdateZ = UserZ.partial({ uid: true, created: true, entries: true, tags: true, email: true });
async function validateUid(request) {
    const { uid, idToken } = request.query;
    (0, logger_1.debug)(`UID: ${uid}, idToken: ${idToken}`);
    return (0, auth_1.getAuth)().verifyIdToken(idToken)
        .then((decodedToken) => decodedToken.uid)
        .then(decodedUid => {
        if (uid === decodedUid) {
            return decodedUid;
        }
        else {
            throw Error("UID provided does not match session token");
        }
    })
        .catch(error => { throw Error("Failed to decode UID from idToken: " + error.message); });
}
async function getUserAndEntries(uid) {
    const user = await db.users.doc(uid).get()
        .then(docSnapshot => docSnapshot.data())
        .catch(error => { throw new Error("Failed to get user from request: " + error.message); });
    if (!user) {
        throw new Error("No user found");
    }
    if (user.created) {
        user.created = user.created.toDate();
    }
    if (user.birth) {
        user.birth = user.birth.toDate();
    }
    return user.entries.get()
        .then((entries) => {
        user.entries = entries;
        return UserZ.parse(user);
    })
        .catch((error) => { throw new Error("Failed to get entries for user: " + error.message); });
}
exports.addUser = functions.auth.user().onCreate(async (user) => {
    const { uid, email } = user;
    const newUser = { uid: uid, created: new Date(), entries: [], tags: [] };
    (0, logger_1.log)("Add user triggered", newUser);
    return await db.users.doc(user.uid).set(Object.assign(Object.assign({}, newUser), (email && { email })));
});
exports.deleteUser = functions.auth.user().onDelete(async (user) => {
    (0, logger_1.log)("Delete user triggered", user);
    const docRef = db.users.doc(user.uid);
    docRef.get()
        .then(doc => {
        if (doc.exists) {
            (0, logger_1.log)(`Deleting user with UID: ${user.uid}`);
            return docRef.delete();
        }
        else {
            (0, logger_1.error)(`No user with UID ${user.uid} found in db`);
            return null;
        }
    });
});
exports.updateUserProfile = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const { name, birth, expYears } = request.query;
    const newUser = ProfileUpdateZ.safeParse({ name: name, birth: new Date(birth), expYears: parseInt(expYears) });
    if (!newUser.success) {
        response.status(400).send("Invalid user profile");
        return;
    }
    const uid = await validateUid(request);
    db.users.doc(uid).update(newUser.data)
        .then(result => response.status(200).send({ uid: uid, updated: result.writeTime }))
        .catch(error => {
        error("Error editing user profile: " + error.message);
        response.status(500).send(error.message);
    });
});
exports.getUser = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const user = await validateUid(request)
        .then(uid => getUserAndEntries(uid));
    (0, logger_1.debug)(user);
    try {
        (0, logger_1.debug)(user);
        response.status(200).send(user);
    }
    catch (e) {
        (0, logger_1.error)(`Error getting user from request: ${e}, user object: ${user}`);
        response.status(500).send(user);
    }
});
exports.addUpdateEntry = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const uid = await validateUid(request);
    const { start, note, tags } = request.query;
    const entryStart = (0, date_fns_1.formatISO)(start, { representation: "date" });
    const entries = db.users.doc(uid).collection("entries");
    const newEntry = {
        updated: firestore_1.FieldValue.serverTimestamp(),
        start: start,
        note: note,
        tags: tags
    };
    entries.doc(entryStart).get()
        .then(entryDoc => {
        if (entryDoc.exists) {
            return entryDoc.ref.update(newEntry);
        }
        else {
            return entryDoc.ref.create(Object.assign({ created: firestore_1.FieldValue.serverTimestamp() }, newEntry));
        }
    })
        .then(res => response.status(200).send({ uid: uid, updated: res.writeTime }))
        .catch(error => {
        error("Error adding/updating entry: " + error.message);
        response.status(500).send(error.message);
    });
});
// export const addTagHelper = async (tagName: string): Promise<WriteResult> => {
// }
// export const addTag = onRequest({ cors: true }, async (request, response) => {
//     const uid = await validateUid(request)
//     const { tagName } = request.query as { tagName: string }
//     addTagHelper(tagName)
//         .then(res => response.status(200).send({ uid: uid, updated: res.writeTime }))
//         .catch(error => response.status(500).send(error.message))
// })
//# sourceMappingURL=index.js.map