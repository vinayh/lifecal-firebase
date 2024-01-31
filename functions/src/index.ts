import { z } from "zod";
import { readFileSync } from 'fs';
import * as logger from "firebase-functions/logger";
import { Request, onRequest } from "firebase-functions/v2/https";
import { DocumentReference, QueryDocumentSnapshot, QuerySnapshot, WriteResult } from "firebase-admin/firestore";
import { getFirestore, Timestamp, FieldValue, Filter } from "firebase-admin/firestore";
import { initializeApp, applicationDefault, cert, getAuth } from "firebase-admin/app";
import { DecodedIdToken } from "firebase-admin/auth"

initializeApp();
const db = {
    users: getFirestore().collection('users')
}

const TagZ = z.object({
    id: z.number(), created: z.date(), name: z.string(), color: z.string()
})
type Tag = { id: number, created: Date, name: string, color: string }


const EntryZ = z.object({
    id: z.number(), created: z.date(), start: z.date(), note: z.string(), tags: z.array(TagZ)
})
type Entry = { id: number, created: Date, start: Date, note: string, tags: Tag[] }


const UserZ = z.object({
    uid: z.string(), created: z.date(), birth: z.date(), expYears: z.number(), email: z.string().email().optional(), entries: z.array(EntryZ), tags: z.array(TagZ)
})
type User = { uid: string, created: Date, birth: Date, expYears: number, email?: string, entries: Entry[], tags: Tag[] }

// function isUser(user: User): user is User {
//     return user.uid !== undefined && user.created !== undefined
//         && user.birth !== undefined && user.expYears !== undefined
//         && user.expYears !== undefined && !isNaN(user.expYears)
// }

const secretNames: [string] = ["GITHUB_CLIENT_ID"]
const secrets = Object.fromEntries(secretNames.map(x => [x, readFileSync(`../.secrets/${x.toLowerCase()}`, 'utf-8')]))

async function validateUid(request: Request) {
    const { idToken } = request.query as { idToken: string }
    return getAuth().verifyIdToken(idToken)
    .then((decodedToken: DecodedIdToken) => decodedToken.uid)
}

export const helloWorld = onRequest((request, response) => {
    logger.info("Hello logs!", { structuredData: true });
    response.send("Hello again !");
});

export const addUser = onRequest(async (request, response) => {
    const { uid, birth, expYears, email } = request.query as { uid: string, birth: string, expYears: string, email: string }
    var user: User = { uid: uid, created: new Date(), birth: new Date(birth), expYears: parseInt(expYears), entries: [], tags: [] }
    user = UserZ.parse({
        ...user, ...(email && { email }),
    })
    db.users.add(user)
        .then((res: DocumentReference) => { response.send(res) })
        .catch((error: Error) => { console.error("Caught error!", error) })
});

export const deleteUser = onRequest(async (request, response) => {
    validateUid(request)
    .then(uid => db.users.where("uid", "==", uid))
    .then(query => query.get())
    .then((querySnapshot: QuerySnapshot) => querySnapshot.forEach((doc: QueryDocumentSnapshot) => doc.ref.delete()))
    .then(_ => response.status(200).send("Deleted"))
    .catch((error: Error) => response.status(500).send(`Error ${error}`))
});

