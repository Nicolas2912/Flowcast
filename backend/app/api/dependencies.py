from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db_session


def get_session(session: Session = Depends(get_db_session)) -> Session:
    return session
