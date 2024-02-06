import { z } from "zod";
import { Request, onRequest } from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v1";
import { DocumentData, getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { DecodedIdToken, getAuth } from "firebase-admin/auth";
import { log, debug, error } from "firebase-functions/logger";

initializeApp();
const db = {
  users: getFirestore().collection("users"),
};

const TagZ = z.object({
  id: z.number(), created: z.date(), name: z.string(), color: z.string(),
});
// type Tag = z.infer<typeof TagZ>


const EntryZ = z.object({
  id: z.number(), created: z.date(), start: z.date(), note: z.string(), tags: z.array(TagZ),
});
// type Entry = z.infer<typeof EntryZ>

const UserZ = z.object({
  uid: z.string(), created: z.coerce.date(), name: z.string(), birth: z.coerce.date(), expYears: z.number(), email: z.string().email(), entries: z.array(EntryZ), tags: z.array(TagZ),
});
const InitialUserZ = UserZ.partial({ name: true, birth: true, expYears: true, email: true })
const UserProfileZ = UserZ.partial({ uid: true, created: true, entries: true, tags: true })

// const secretNames: [string] = ["GITHUB_CLIENT_ID"]
// const secrets = Object.fromEntries(secretNames.map(x => [x, readFileSync(`../.secrets/${x.toLowerCase()}`, 'utf-8')]))

async function validateUid(request: Request): Promise<string> {
  const { uid, idToken } = request.query as { uid: string, idToken: string };
  debug(`UID: ${uid}, idToken: ${idToken}`)
  return getAuth().verifyIdToken(idToken)
    .then((decodedToken: DecodedIdToken) => decodedToken.uid)
    .then(decodedUid => {
      if (uid == decodedUid) { return decodedUid }
      else { throw Error("UID provided does not match session token") }
    })
    .catch(error => { throw Error("Failed to decode UID from idToken: " + error.message) })
}

async function userFromRequest(request: Request): Promise<DocumentData> {
  return validateUid(request)
    .then(uid => db.users.doc(uid).get())
    .then(docSnapshot => docSnapshot.data())
    .then(user => {
      if (user == null) { throw Error }
      else {
        if (user.created) { user.created = user.created.toDate() }
        if (user.birth) { user.birth = user.birth.toDate() }
        return InitialUserZ.parse(user)
      }
    })
    .catch(error => { throw Error("Failed to get user from request: " + error.message) })
}

// export const helloWorld = onRequest((request, response) => {
//     logger.info("Hello logs!", { structuredData: true });
//     response.send("Hello again !");
// });

export const addUser = functions.auth.user().onCreate(async (user) => {
  const { uid, email } = user
  const newUser = { uid: uid, created: new Date(), entries: [], tags: [] }
  log("Add user triggered", newUser)
  return await db.users.doc(user.uid).set({ ...newUser, ...(email && { email }) })
});

export const deleteUser = functions.auth.user().onDelete(async (user) => {
  log("Delete user triggered", user)
  const docRef = db.users.doc(user.uid)
  docRef.get()
  .then(doc => {
    if (doc.exists) {
      log(`Deleting user with UID: ${user.uid}`)
      return docRef.delete()
    } else {
      error(`No user with UID ${user.uid} found in db`)
      return null
    }
  })
});

export const updateUserProfile = onRequest({ cors: true }, async (request, response) => {
  const { name, birth, expYears, email } = request.query as { name: string, birth: string, expYears: string, email: string }
  const newUser = UserProfileZ.parse({ name: name, email: email, birth: new Date(birth), expYears: parseInt(expYears) })
  const uid = await validateUid(request)
  db.users.doc(uid).update(newUser)
    .then(result => response.status(200).send({ uid: uid, updated: result.writeTime }))
    .catch(error => {
      error("Error editing user profile: " + error.message)
      response.status(500).send(error.message)
    })
});

export const getUser = onRequest({ cors: true }, async (request, response) => {
  const user = await userFromRequest(request)
  debug(user)
  try {
    debug(user)
    response.status(200).send(user)
  } catch (e) {
    error(`Error getting user from request: ${e}, user object: ${user}`)
    response.status(500).send(user)
  }
  // .then(user => {
  //   log(user);
  //   return InitialUserZ.parse(user);
  // })
  // .then((user: InitialUser) => response.status(200).send(user))
  // .catch(error => response.status(500).send(error.message));
});
