"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addUpdateEntry = exports.getUserAndEntries = exports.updateUserProfile = exports.deleteUser = exports.addUser = void 0;
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
// const TagZ = z.object({
//     id: z.number(),
//     created: z.date(),
//     name: z.string(),
//     color: z.string(),
// })
const ISODateZ = zod_1.z.string().refine(i => /^\d{4}-\d{2}-\d{2}$/.test(i));
const EntryZ = zod_1.z.object({
    created: zod_1.z.date(),
    start: ISODateZ,
    note: zod_1.z.string(),
    tags: zod_1.z.array(zod_1.z.string()),
});
const UserZ = zod_1.z.object({
    uid: zod_1.z.string(),
    created: zod_1.z.coerce.date(),
    name: zod_1.z.string(),
    birth: zod_1.z.coerce.date(),
    expYears: zod_1.z.number().refine(i => i > 0),
    email: zod_1.z.string().email(),
    entries: zod_1.z.record(ISODateZ, EntryZ).optional(),
    // tags: z.array(TagZ),
});
const InitialUserZ = UserZ.partial({
    name: true,
    birth: true,
    expYears: true,
});
// type User = z.infer<typeof UserZ>
const ProfileUpdateZ = UserZ.partial({
    uid: true,
    created: true,
    entries: true,
    tags: true,
    email: true,
});
async function validateUid(request) {
    const { uid, idToken } = request.query;
    (0, logger_1.debug)(`UID: ${uid}, idToken: ${idToken}`);
    return (0, auth_1.getAuth)()
        .verifyIdToken(idToken)
        .then((decodedToken) => decodedToken.uid)
        .then(decodedUid => {
        if (uid === decodedUid) {
            return decodedUid;
        }
        else {
            throw Error("UID provided does not match session token");
        }
    })
        .catch(e => {
        throw Error("Failed to decode UID from idToken: " + e.message);
    });
}
async function entriesObject(entriesRef) {
    if (!entriesRef) {
        return {};
    }
    const entries = {};
    const entriesSnapshot = await entriesRef.get();
    entriesSnapshot.docs.forEach(d => {
        const result = d.data();
        if (result.created) {
            result.created = result.created.toDate();
        }
        entries[result.start] = EntryZ.parse(result);
    });
    return entries;
}
exports.addUser = functions.auth.user().onCreate(async (user) => {
    const { uid, email } = user;
    const newUser = {
        uid: uid,
        created: firestore_1.FieldValue.serverTimestamp(),
        updated: firestore_1.FieldValue.serverTimestamp(),
        email: email,
    };
    (0, logger_1.log)("Add user triggered", newUser);
    return await db.users.doc(user.uid).set(newUser);
});
exports.deleteUser = functions.auth.user().onDelete(async (user) => {
    (0, logger_1.log)("Delete user triggered", user);
    const docRef = db.users.doc(user.uid);
    return docRef.get().then(doc => {
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
    const newUser = ProfileUpdateZ.safeParse({
        name: name,
        birth: new Date(birth),
        expYears: parseInt(expYears),
    });
    if (!newUser.success) {
        response.status(400).send("Invalid user profile");
        return;
    }
    const uid = await validateUid(request);
    db.users
        .doc(uid)
        .update(Object.assign({ updated: firestore_1.FieldValue.serverTimestamp() }, newUser.data))
        .then(result => response
        .status(200)
        .send({ uid: uid, updated: result.writeTime }))
        .catch(e => {
        (0, logger_1.error)("Error editing user profile: " + e.message);
        response.status(500).send(e.message);
    });
});
exports.getUserAndEntries = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const userRef = await validateUid(request).then(uid => db.users.doc(uid));
    const user = await userRef
        .get()
        .then(docSnapshot => docSnapshot.data())
        .then(user => {
        if (!user) {
            throw new Error("No user found");
        }
        if (user.created) {
            user.created = user.created.toDate();
        }
        if (user.birth) {
            user.birth = user.birth.toDate();
        }
        return user;
    })
        .then(user => {
        const completeParsed = UserZ.safeParse(user);
        if (completeParsed.success) {
            return completeParsed.data;
        }
        else {
            const initialParsed = InitialUserZ.safeParse(user);
            if (initialParsed.success) {
                return initialParsed.data;
            }
            else {
                throw new Error("Invalid user profile");
            }
        }
    })
        .catch(e => {
        throw new Error("Failed to get user from request: " + e.message);
    });
    user.entries = await entriesObject(userRef.collection("entries"));
    (0, logger_1.debug)(user);
    response.status(200).send(user);
});
exports.addUpdateEntry = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
    const uid = await validateUid(request);
    const { start, note, tags } = request.query;
    const newEntry = {
        updated: firestore_1.FieldValue.serverTimestamp(),
        start: (0, date_fns_1.formatISO)(start, { representation: "date" }),
        note: note,
        tags: JSON.parse(tags),
    };
    const entriesRef = db.users.doc(uid).collection("entries");
    const res = await entriesRef
        .doc(newEntry.start)
        .get()
        .then(entryDoc => {
        if (entryDoc.exists) {
            return entryDoc.ref.update(newEntry);
        }
        else {
            return entryDoc.ref.create(Object.assign({ created: firestore_1.FieldValue.serverTimestamp() }, newEntry));
        }
    })
        .catch(e => {
        throw new Error("Error adding/updating entry: " + e.message);
        // response.status(500).send(e.message)
    });
    return entriesObject(entriesRef)
        .then(entries => {
        response.status(200).send({
            uid: uid,
            updated: res.writeTime,
            entries: entries,
        });
    })
        .catch(e => {
        (0, logger_1.error)("Error getting updated entries: " + e.message);
        response.status(500).send(e.message);
    });
});
// export const addTagHelper = async (tagName: string): Promise<WriteResult> => {
// }
// export const addTag = onRequest({ cors: true }, async (request, response) => {
//     const uid = await validateUid(request)
//     const { tagName } = request.query as { tagName: string }
//     addTagHelper(tagName)
//         .then(res => response.status(200).send({ uid: uid, updated: res.writeTime }))
//         .catch(e => response.status(500).send(e.message))
// })
//# sourceMappingURL=index.js.map