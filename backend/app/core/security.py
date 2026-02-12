from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.core.config import get_settings
from app.core.supabase import get_supabase_admin

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate JWT via Supabase Auth API and return user data.
    Sync function — FastAPI runs it in a thread pool so it won't block the event loop."""
    token = credentials.credentials

    try:
        sb = get_supabase_admin()
        user_response = sb.auth.admin.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        user = user_response.user
        profile = sb.table("profiles").select("*").eq("id", str(user.id)).single().execute()

        return {
            "id": str(user.id),
            "email": user.email,
            "profile": profile.data if profile.data else {},
            "token": token,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require admin role."""
    if user.get("profile", {}).get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
