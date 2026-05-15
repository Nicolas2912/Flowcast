from pydantic import BaseModel


class CategoryResponse(BaseModel):
    id: int
    name: str
    behavior_type: str
    is_essential: bool
    is_variable: bool
    is_income: bool
    is_saving: bool
    sort_order: int
