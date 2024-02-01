import { z } from "zod";
// import { readFileSync } from 'fs';
// import * as logger from "firebase-functions/logger";
import { Request, onRequest } from "firebase-functions/v2/https";
import { QueryDocumentSnapshot, DocumentReference } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { DecodedIdToken, getAuth } from "firebase-admin/auth"

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
    uid: z.string(), created: z.date(), name: z.string(), birth: z.date(), expYears: z.number(), email: z.string().email().optional(), entries: z.array(EntryZ), tags: z.array(TagZ)
})
type User = { uid: string, created: Date, name: string, birth: Date, expYears: number, email?: string, entries: Entry[], tags: Tag[] }


// const secretNames: [string] = ["GITHUB_CLIENT_ID"]
// const secrets = Object.fromEntries(secretNames.map(x => [x, readFileSync(`../.secrets/${x.toLowerCase()}`, 'utf-8')]))

async function validateUid(request: Request): Promise<string> {
    const { idToken } = request.query as { idToken: string }
    return getAuth().verifyIdToken(idToken)
        .then((decodedToken: DecodedIdToken) => decodedToken.uid)
}

async function userFromRequest(request: Request): Promise<QueryDocumentSnapshot> {
    return validateUid(request)
        .then(uid => db.users.where("uid", "==", uid).limit(1))
        .then(query => query.get())
        .then(querySnapshot => querySnapshot.docs[0])
}

// export const helloWorld = onRequest((request, response) => {
//     logger.info("Hello logs!", { structuredData: true });
//     response.send("Hello again !");
// });

export const addUser = onRequest(async (request, response) => {
    const { uid, name, birth, expYears, email } = request.query as { uid: string, name: string, birth: string, expYears: string, email: string }
    var user: User = { uid: uid, created: new Date(), name: name, birth: new Date(birth), expYears: parseInt(expYears), entries: [], tags: [] }
    user = UserZ.parse({
        ...user, ...(email && { email }),
    })
    db.users.add(user)
        .then((res: DocumentReference) => res.get())
        .then(user => response.send(user))
        .catch((error: Error) => console.error("Caught error!", error))
});

export const deleteUser = onRequest(async (request, response) => {
    userFromRequest(request)
        .then(user => user.ref.delete())
        .then(_ => response.status(200).send("Deleted"))
        .catch(error => response.status(500).send(`Error ${error}`))
});

export const getUser = onRequest(async (request, response) => {
    userFromRequest(request)
        .then(user => UserZ.parse(user))
        .then((user: User) => response.status(200).send(user))
        .catch(error => response.status(500).send(`Error ${error}`))
});

