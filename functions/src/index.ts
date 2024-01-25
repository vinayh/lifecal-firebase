import { z } from "zod";
import { readFileSync } from 'fs';
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
const { getFirestore, Timestamp, FieldValue, Filter } = require('firebase-admin/firestore');
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');

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
        .then(res => { response.send(res) })
        .catch(error => { console.error("Caught error!", error) })
});