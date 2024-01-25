# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

import json
import requests

from firebase_functions import firestore_fn, https_fn
from firebase_admin import initialize_app, firestore, auth
from google.cloud.firestore import Client, FieldFilter

from config import SECRETS

initialize_app()


@https_fn.on_request()
def verified_id_token(req: https_fn.Request) -> https_fn.Response:
    try:
        decoded = auth.verify_id_token(req.args["id_token"])
        return https_fn.Response(decoded["uid"])
    except:
        return https_fn.Response("Invalid user session", status=401)
