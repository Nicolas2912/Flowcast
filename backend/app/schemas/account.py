from pydantic import BaseModel


class AccountResponse(BaseModel):
    id: int
    name: str
    provider: str
    account_type: str | None
    currency: str
    opening_balance: float
    current_balance_manual: float | None
    is_active: bool
