"""User external storage service — S3-compatible client for Cloudflare R2 and Backblaze B2."""

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError
import structlog

logger = structlog.get_logger()

# Backblaze B2 S3-compatible endpoint pattern
B2_S3_ENDPOINT = "https://s3.{region}.backblazeb2.com"
B2_DEFAULT_REGION = "us-west-004"


def _build_r2_client(config: dict):
    """Build an S3 client for Cloudflare R2."""
    endpoint = config.get("r2_endpoint") or ""
    if not endpoint:
        account_id = config.get("r2_account_id") or ""
        if account_id:
            endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        else:
            raise ValueError("R2 endpoint veya Account ID gerekli")

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=config.get("r2_access_key") or "",
        aws_secret_access_key=config.get("r2_secret_key_encrypted") or "",
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 2, "mode": "standard"},
            connect_timeout=10,
            read_timeout=15,
        ),
    )


def _build_b2_client(config: dict):
    """Build an S3 client for Backblaze B2."""
    endpoint = config.get("b2_endpoint") or ""

    if not endpoint:
        raise ValueError(
            "B2 S3 Endpoint gerekli. Backblaze B2 panelinden bucket'ınızın "
            "S3 endpoint'ini alın (örn: s3.us-west-004.backblazeb2.com)"
        )

    # Ensure endpoint has https:// prefix
    if not endpoint.startswith("http"):
        endpoint = f"https://{endpoint}"

    # Extract region from endpoint URL (e.g. s3.us-west-004.backblazeb2.com -> us-west-004)
    region = B2_DEFAULT_REGION
    try:
        import re
        match = re.search(r"s3\.([a-z0-9-]+)\.backblazeb2\.com", endpoint)
        if match:
            region = match.group(1)
    except Exception:
        pass

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=config.get("b2_key_id") or "",
        aws_secret_access_key=config.get("b2_app_key_encrypted") or "",
        region_name=region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 2, "mode": "standard"},
            connect_timeout=10,
            read_timeout=15,
        ),
    )


def _get_bucket_name(config: dict) -> str:
    """Get bucket name from config based on provider."""
    provider = config.get("provider", "r2")
    if provider == "r2":
        return config.get("r2_bucket_name") or ""
    else:
        return config.get("b2_bucket_name") or ""


def build_s3_client(config: dict):
    """Build an S3-compatible client based on provider type."""
    provider = config.get("provider", "r2")
    if provider == "r2":
        return _build_r2_client(config)
    elif provider == "b2":
        return _build_b2_client(config)
    else:
        raise ValueError(f"Desteklenmeyen depolama sağlayıcısı: {provider}")


def test_connection(config: dict) -> dict:
    """
    Test the storage connection by performing a HeadBucket + PutObject + DeleteObject.
    Returns {"ok": True/False, "message": str, "details": ...}
    """
    try:
        client = build_s3_client(config)
        bucket = _get_bucket_name(config)
        if not bucket:
            return {"ok": False, "message": "Bucket adı belirtilmemiş"}

        # 1. HeadBucket — check bucket exists and credentials work
        try:
            client.head_bucket(Bucket=bucket)
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "403":
                return {"ok": False, "message": "Erişim reddedildi — API anahtarlarını kontrol edin"}
            elif code == "404":
                return {"ok": False, "message": f"Bucket bulunamadı: {bucket}"}
            else:
                return {"ok": False, "message": f"Bucket hatası: {e.response['Error'].get('Message', code)}"}

        # 2. PutObject — test write permission
        test_key = ".subtranslate-connection-test"
        try:
            client.put_object(
                Bucket=bucket,
                Key=test_key,
                Body=b"subtranslate-test",
                ContentType="text/plain",
            )
        except ClientError as e:
            return {"ok": False, "message": f"Yazma izni yok: {e.response['Error'].get('Message', '')}"}

        # 3. DeleteObject — cleanup
        try:
            client.delete_object(Bucket=bucket, Key=test_key)
        except Exception:
            pass  # Non-critical

        provider_label = "Cloudflare R2" if config.get("provider") == "r2" else "Backblaze B2"
        return {
            "ok": True,
            "message": f"{provider_label} bağlantısı başarılı — bucket: {bucket}",
        }

    except NoCredentialsError:
        return {"ok": False, "message": "API anahtarları eksik veya geçersiz"}
    except EndpointConnectionError:
        return {"ok": False, "message": "Endpoint'e bağlanılamadı — URL'yi kontrol edin"}
    except ValueError as e:
        return {"ok": False, "message": str(e)}
    except Exception as e:
        logger.warning("user_storage_test_failed", error=str(e))
        return {"ok": False, "message": f"Bağlantı hatası: {str(e)[:200]}"}


def list_bucket_files(config: dict, prefix: str = "", max_keys: int = 200) -> dict:
    """
    List files in the user's bucket.
    Returns {"ok": True, "files": [...], "truncated": bool}
    """
    try:
        client = build_s3_client(config)
        bucket = _get_bucket_name(config)
        if not bucket:
            return {"ok": False, "files": [], "message": "Bucket adı belirtilmemiş"}

        params = {"Bucket": bucket, "MaxKeys": max_keys}
        if prefix:
            params["Prefix"] = prefix

        response = client.list_objects_v2(**params)

        files = []
        for obj in response.get("Contents", []):
            files.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat(),
                "etag": obj.get("ETag", "").strip('"'),
            })

        return {
            "ok": True,
            "files": files,
            "truncated": response.get("IsTruncated", False),
            "count": len(files),
        }

    except ClientError as e:
        code = e.response["Error"]["Code"]
        return {"ok": False, "files": [], "message": f"Listeleme hatası ({code}): {e.response['Error'].get('Message', '')}"}
    except Exception as e:
        return {"ok": False, "files": [], "message": f"Hata: {str(e)[:200]}"}


def delete_bucket_file(config: dict, key: str) -> dict:
    """Delete a file from the user's bucket."""
    try:
        client = build_s3_client(config)
        bucket = _get_bucket_name(config)
        if not bucket:
            return {"ok": False, "message": "Bucket adı belirtilmemiş"}

        client.delete_object(Bucket=bucket, Key=key)
        return {"ok": True, "message": f"Dosya silindi: {key}"}

    except ClientError as e:
        return {"ok": False, "message": f"Silme hatası: {e.response['Error'].get('Message', '')}"}
    except Exception as e:
        return {"ok": False, "message": f"Hata: {str(e)[:200]}"}


def rename_bucket_file(config: dict, old_key: str, new_key: str) -> dict:
    """Rename (copy + delete) a file in the user's bucket."""
    try:
        client = build_s3_client(config)
        bucket = _get_bucket_name(config)
        if not bucket:
            return {"ok": False, "message": "Bucket adı belirtilmemiş"}

        # Copy to new key
        client.copy_object(
            Bucket=bucket,
            CopySource={"Bucket": bucket, "Key": old_key},
            Key=new_key,
        )

        # Delete old key
        client.delete_object(Bucket=bucket, Key=old_key)

        return {"ok": True, "message": f"Dosya yeniden adlandırıldı: {old_key} → {new_key}"}

    except ClientError as e:
        return {"ok": False, "message": f"Yeniden adlandırma hatası: {e.response['Error'].get('Message', '')}"}
    except Exception as e:
        return {"ok": False, "message": f"Hata: {str(e)[:200]}"}


def get_presigned_url(config: dict, key: str, expires_in: int = 3600) -> dict:
    """Generate a presigned download URL for a file in the user's bucket."""
    try:
        client = build_s3_client(config)
        bucket = _get_bucket_name(config)
        if not bucket:
            return {"ok": False, "message": "Bucket adı belirtilmemiş"}

        # Check file exists
        try:
            client.head_object(Bucket=bucket, Key=key)
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return {"ok": False, "message": f"Dosya bulunamadı: {key}"}
            raise

        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )

        return {"ok": True, "url": url, "expires_in": expires_in}

    except ClientError as e:
        return {"ok": False, "message": f"URL oluşturma hatası: {e.response['Error'].get('Message', '')}"}
    except Exception as e:
        return {"ok": False, "message": f"Hata: {str(e)[:200]}"}


def get_file_info(config: dict, key: str) -> dict:
    """Get metadata for a specific file in the user's bucket."""
    try:
        client = build_s3_client(config)
        bucket = _get_bucket_name(config)
        if not bucket:
            return {"ok": False, "message": "Bucket adı belirtilmemiş"}

        response = client.head_object(Bucket=bucket, Key=key)

        return {
            "ok": True,
            "key": key,
            "size": response["ContentLength"],
            "content_type": response.get("ContentType", "application/octet-stream"),
            "last_modified": response["LastModified"].isoformat(),
            "etag": response.get("ETag", "").strip('"'),
        }

    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return {"ok": False, "message": f"Dosya bulunamadı: {key}"}
        return {"ok": False, "message": f"Hata: {e.response['Error'].get('Message', '')}"}
    except Exception as e:
        return {"ok": False, "message": f"Hata: {str(e)[:200]}"}
