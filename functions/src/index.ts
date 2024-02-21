import { z } from "zod"
import { Request, onRequest } from "firebase-functions/v2/https"
import * as functions from "firebase-functions/v1"
import {
    CollectionReference,
    FieldValue,
    getFirestore,
} from "firebase-admin/firestore"
import { initializeApp } from "firebase-admin/app"
import { DecodedIdToken, getAuth } from "firebase-admin/auth"
import { log, debug, error } from "firebase-functions/logger"
import { formatISO } from "date-fns"

initializeApp()
const db = {
    users: getFirestore().collection("users"),
}

// const TagZ = z.object({
//     id: z.number(),
//     created: z.date(),
//     name: z.string(),
//     color: z.string(),
// })

const ISODateZ = z.string().refine(i => /^\d{4}-\d{2}-\d{2}$/.test(i))

const EntryZ = z.object({
    created: z.date(),
    start: ISODateZ,
    note: z.string(),
    tags: z.array(z.string()),
})
type Entry = z.infer<typeof EntryZ>

// TODO: Update db schema to use ISO date strings as keys/properties mapping to entry objects
const UserZ = z.object({
    uid: z.string(),
    created: z.coerce.date(),
    name: z.string(),
    birth: z.coerce.date(),
    expYears: z.number().refine(i => i > 0),
    email: z.string().email(),
    entries: z.record(ISODateZ, EntryZ).optional(),
    // tags: z.array(TagZ),
})

type User = z.infer<typeof UserZ>
// const InitialUserZ = UserZ.partial({ name: true, birth: true, expYears: true, email: true })
const ProfileUpdateZ = UserZ.partial({
    uid: true,
    created: true,
    entries: true,
    tags: true,
    email: true,
})

async function validateUid(request: Request): Promise<string> {
    const { uid, idToken } = request.query as { uid: string; idToken: string }
    debug(`UID: ${uid}, idToken: ${idToken}`)
    return getAuth()
        .verifyIdToken(idToken)
        .then((decodedToken: DecodedIdToken) => decodedToken.uid)
        .then(decodedUid => {
            if (uid === decodedUid) {
                return decodedUid
            } else {
                throw Error("UID provided does not match session token")
            }
        })
        .catch(e => {
            throw Error("Failed to decode UID from idToken: " + e.message)
        })
}

async function entriesObject(entriesRef: CollectionReference): Promise<Record<string, Entry>> {
    if (!entriesRef) {
        return {}
    }
    const entries: Record<string, Entry> = {}
    const entriesSnapshot = await entriesRef.get()
    entriesSnapshot.docs.forEach(d => {
        const result = d.data()
        if (result.created) {
            result.created = result.created.toDate()
        }
        entries[result.start] = EntryZ.parse(result)
    })
    return entries
}

async function getUserAndEntries(uid: string): Promise<[User, Record<string, Entry>]> {
    const user = await db.users
        .doc(uid)
        .get()
        .then(docSnapshot => docSnapshot.data())
        .catch(e => {
            throw new Error("Failed to get user from request: " + e.message)
        })
    if (!user) {
        throw new Error("No user found")
    }
    if (user.created) {
        user.created = user.created.toDate()
    }
    if (user.birth) {
        user.birth = user.birth.toDate()
    }
    return [UserZ.parse(user), await entriesObject(user.entries)]
}

export const addUser = functions.auth.user().onCreate(async user => {
    const { uid, email } = user
    const newUser = {
        uid: uid,
        created: FieldValue.serverTimestamp(),
        updated: FieldValue.serverTimestamp(),
        email: email,
    }
    log("Add user triggered", newUser)
    return await db.users.doc(user.uid).set(newUser)
})

export const deleteUser = functions.auth.user().onDelete(async user => {
    log("Delete user triggered", user)
    const docRef = db.users.doc(user.uid)
    return docRef.get().then(doc => {
        if (doc.exists) {
            log(`Deleting user with UID: ${user.uid}`)
            return docRef.delete()
        } else {
            error(`No user with UID ${user.uid} found in db`)
            return null
        }
    })
})

export const updateUserProfile = onRequest(
    { cors: true },
    async (request, response) => {
        const { name, birth, expYears } = request.query as {
            name: string
            birth: string
            expYears: string
        }
        const newUser = ProfileUpdateZ.safeParse({
            name: name,
            birth: new Date(birth),
            expYears: parseInt(expYears),
        })
        if (!newUser.success) {
            response.status(400).send("Invalid user profile")
            return
        }
        const uid = await validateUid(request)
        db.users
            .doc(uid)
            .update({
                updated: FieldValue.serverTimestamp(),
                ...newUser.data,
            })
            .then(result =>
                response
                    .status(200)
                    .send({ uid: uid, updated: result.writeTime })
            )
            .catch(e => {
                error("Error editing user profile: " + e.message)
                response.status(500).send(e.message)
            })
    }
)

export const getUser = onRequest({ cors: true }, async (request, response) => {
    const [user, entries] = await validateUid(request)
        .then(uid => getUserAndEntries(uid))
        .catch(e => {
            response.status(500).send(user)
            throw new Error(
                `Error getting user from request: ${e}, user object: ${user}`
            )
        })
    user.entries = entries
    debug(user)
    response.status(200).send(user)
})

export const addUpdateEntry = onRequest(
    { cors: true },
    async (request, response) => {
        const uid = await validateUid(request)
        const { start, note, tags } = request.query as {
            start: string
            note: string
            tags: string
        }
        const newEntry = {
          updated: FieldValue.serverTimestamp(),
          start: formatISO(start, { representation: "date" }),
          note: note,
          tags: JSON.parse(tags),
        }
        const entriesRef = db.users.doc(uid).collection("entries")
        const res = await entriesRef
            .doc(newEntry.start)
            .get()
            .then(entryDoc => {
                if (entryDoc.exists) {
                    return entryDoc.ref.update(newEntry)
                } else {
                    return entryDoc.ref.create({
                        created: FieldValue.serverTimestamp(),
                        ...newEntry,
                    })
                }
            })
            .catch(e => {
                throw new Error("Error adding/updating entry: " + e.message)
                // response.status(500).send(e.message)
            })
        return entriesObject(entriesRef)
            .then(entries => {
                response.status(200).send({
                    uid: uid,
                    updated: res.writeTime,
                    entries: entries,
                })
            })
            .catch(e => {
                error("Error getting updated entries: " + e.message)
                response.status(500).send(e.message)
            })
    }
)

// export const addTagHelper = async (tagName: string): Promise<WriteResult> => {

// }

// export const addTag = onRequest({ cors: true }, async (request, response) => {
//     const uid = await validateUid(request)
//     const { tagName } = request.query as { tagName: string }
//     addTagHelper(tagName)
//         .then(res => response.status(200).send({ uid: uid, updated: res.writeTime }))
//         .catch(e => response.status(500).send(e.message))
// })
