"""A simple user service for testing purposes."""
import datetime


class UserService:
    def __init__(self, db, email_sender):
        self._db = db
        self._email_sender = email_sender

    def register(self, username, email):
        if not username or not email:
            raise ValueError("Username and email required")
        if "@" not in email:
            raise ValueError("Invalid email")
        user = {
            "username": username,
            "email": email,
            "created_at": datetime.datetime.now(),
            "active": True,
        }
        self._db.save("users", user)
        self._email_sender.send(email, "Welcome!", f"Hello {username}")
        return user

    def deactivate(self, username):
        user = self._db.find("users", {"username": username})
        if not user:
            raise ValueError(f"User {username} not found")
        user["active"] = False
        self._db.update("users", user)
        return user

    def find_active_users(self):
        all_users = self._db.find_all("users")
        return [u for u in all_users if u.get("active")]
