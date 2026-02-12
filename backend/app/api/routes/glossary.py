from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import structlog

from app.core.security import get_current_user
from app.core.supabase import get_supabase_admin
from app.models.schemas import GlossaryTermCreate

logger = structlog.get_logger()
router = APIRouter(prefix="/glossary", tags=["Glossary"])


@router.get("")
def list_glossary_terms(
    source_lang: Optional[str] = None,
    target_lang: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List user's glossary terms with optional language filter."""
    sb = get_supabase_admin()
    query = sb.table("glossary_terms").select("*").eq("user_id", user["id"])
    if source_lang:
        query = query.eq("source_lang", source_lang)
    if target_lang:
        query = query.eq("target_lang", target_lang)
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.post("")
def create_glossary_term(body: GlossaryTermCreate, user: dict = Depends(get_current_user)):
    """Add a new glossary term."""
    sb = get_supabase_admin()
    result = sb.table("glossary_terms").insert({
        "user_id": user["id"],
        "source_term": body.source_term,
        "target_term": body.target_term,
        "source_lang": body.source_lang,
        "target_lang": body.target_lang,
    }).execute()
    return result.data


@router.delete("/{term_id}")
def delete_glossary_term(term_id: str, user: dict = Depends(get_current_user)):
    """Delete a glossary term."""
    sb = get_supabase_admin()
    sb.table("glossary_terms").delete().eq("id", term_id).eq("user_id", user["id"]).execute()
    return {"deleted": True}
