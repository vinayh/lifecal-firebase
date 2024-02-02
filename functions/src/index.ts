import {z} from "zod";
// import { readFileSync } from 'fs';
// import * as logger from "firebase-functions/logger";
import {Request, onRequest} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v1";
import {QueryDocumentSnapshot, DocumentReference, getFirestore} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import {DecodedIdToken, getAuth} from "firebase-admin/auth";

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

const InitialUserZ = z.object({
    uid: z.string(), created: z.date()
});
type InitialUser = z.infer<typeof InitialUserZ>

const UserZ = z.object({
  uid: z.string(), created: z.date(), name: z.string(), birth: z.date(), expYears: z.number(), email: z.string().email().optional(), entries: z.array(EntryZ), tags: z.array(TagZ),
});
// type User = z.infer<typeof UserZ>


// const secretNames: [string] = ["GITHUB_CLIENT_ID"]
// const secrets = Object.fromEntries(secretNames.map(x => [x, readFileSync(`../.secrets/${x.toLowerCase()}`, 'utf-8')]))

async function validateUid(request: Request): Promise<string> {
  const {idToken} = request.query as { idToken: string };
  return getAuth().verifyIdToken(idToken)
    .then((decodedToken: DecodedIdToken) => decodedToken.uid);
}

async function userFromRequest(request: Request): Promise<QueryDocumentSnapshot> {
  return validateUid(request)
    .then((uid) => db.users.where("uid", "==", uid).limit(1))
    .then((query) => query.get())
    .then((querySnapshot) => querySnapshot.docs[0]);
}

// export const helloWorld = onRequest((request, response) => {
//     logger.info("Hello logs!", { structuredData: true });
//     response.send("Hello again !");
// });

export const addUser = functions.auth.user().onCreate(async (user) => {
  console.log("Add user triggered", user);
  return await db.users.doc(user.uid).set({created: new Date()});
});

export const deleteUser = functions.auth.user().onDelete(async (user) => {
  console.log("Delete user triggered", user);
  return await db.users.doc(user.uid).delete();
});

export const editUserProfile = onRequest({ cors: true }, async (request, response) => {
  const {name, birth, expYears, email} = request.query as { name: string, birth: string, expYears: string, email: string };
  validateUid(request)
    .then((uid) => {
      return {uid: uid, created: new Date(), name: name, birth: new Date(birth), expYears: parseInt(expYears), entries: [], tags: []};
    })
    .then(newUser => UserZ.parse({...newUser, ...(email && {email})}))
    .then(newUser => db.users.add(newUser))
    .then((res: DocumentReference) => res.get())
    .then(user => response.send(user))
    .catch(error => console.error("Error adding user!", error));
});

// export const deleteUser = onRequest({ cors: true }, async (request, response) => {
//     userFromRequest(request)
//         .then(user => user.ref.delete())
//         .then(_ => response.status(200).send("Deleted"))
//         .catch(error => response.status(500).send(`Error ${error}`))
// });

export const getUser = onRequest({ cors: true }, async (request, response) => {
  userFromRequest(request)
    .then(user => {
      console.log(user);
      return InitialUserZ.parse(user);
    })
    .then((user: InitialUser) => response.status(200).send(user))
    .catch(error => response.status(500).send(`Error ${error}`));
});
