from dataclasses import dataclass
from datetime import datetime
from firebase_admin import initialize_app, firestore
from google.cloud.firestore import Client, FieldFilter
from google.cloud.firestore_v1.document import DocumentReference


@dataclass
class User:
    uid: str
    created: datetime
    birth: datetime
    exp_years: int
    entries: list["Entry"]
    tags: list["Tag"]
    email: str
    
    def __init__(self, data: dict):
        self.id = 0
        self.created = datetime.now()
        self.birth = data["birth"]
        self.exp_years = data["expYears"]
        self.email = data["email"]
    
    def add(self) -> DocumentReference:
        firestore_client: Client = firestore.client()
        _, doc_ref = firestore_client.collection("users").add(self.asdict())
        return doc_ref
    
    def update_or_add(self) -> DocumentReference:
        firestore_client: Client = firestore.client()
        try:
            docs = firestore_client.collection("users").where(filter=FieldFilter("uid", "==", self.uid)).stream()
            doc = next(docs)
            _ = next(docs).reference.update(self.asdict())
            print(f"Matching user found, doc ref: {doc.reference}")
            return doc.reference
        except StopIteration:
            return self.add()
    
    @staticmethod
    def by_id(uid: str) -> "User":
        firestore_client: Client = firestore.client()
        docs = firestore_client.collection("users").where(filter=FieldFilter("uid", "==", uid)).stream()
        try:
            doc = next(docs)
            print(f"Matching user found at doc ID {doc.reference}")
            return User(doc.to_dict())


class Entry:
    id: int
    created: datetime
    start: datetime
    tags: list["Tag"]
    note: str
    
    def __init__(self, data: dict):
        self.id = 0
        self.created = datetime.now()
        self.start = data["start"]
        self.tags = data["tags"]
        self.note = data["note"]
    
    def add(self) -> DocumentReference:
        firestore_client: Client = firestore.client()
        _, doc_ref = firestore_client.collection("users").add(self.asdict())
        return doc_ref


class Tag:
    id: int
    created: datetime
    name: str
    color: str
    
    # category: int
    
    def __init__(self, data: dict):
        self.id = 0
        self.created = datetime.now()
        self.name = data["name"]
        self.color = data["color"]
