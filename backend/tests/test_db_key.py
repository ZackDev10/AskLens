from app.core.config import ENV_FILE, REPO_ROOT, Settings, mask
from app.core.db import sanitize_key

CLEAN = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig"


def test_env_file_is_pinned_to_repo_root_not_cwd():
    assert ENV_FILE == REPO_ROOT / ".env"
    assert ENV_FILE.is_file()
    assert not (REPO_ROOT / "backend" / ".env").exists()


def test_mask_never_reveals_the_secret():
    long_key = "a" * 40 + "SECRETMIDDLE" + "b" * 40
    out = mask(long_key)
    assert "SECRETMIDDLE" not in out and "a" * 40 not in out
    assert "len=" in out
    assert mask("") == "<empty>"
    assert mask("abc") == "***"


def test_sanitize_key_removes_multiline_paste_artifacts():
    wrapped = "  eyJhbGciOiJIUzI1NiJ9.\r\n  eyJyb2xlIjoic2VydmljZV9yb2xlIn0\r\n.sig\n"
    assert sanitize_key(wrapped) == CLEAN


def test_sanitize_key_removes_wrapping_quotes():
    assert sanitize_key(f'"{CLEAN}"') == CLEAN
    assert sanitize_key(f"'{CLEAN}'") == CLEAN


def test_sanitize_key_is_a_noop_for_clean_keys():
    assert sanitize_key(CLEAN) == CLEAN


def test_settings_scrub_multiline_service_key():
    s = Settings(
        _env_file=None,
        supabase_url="http://localhost",
        supabase_service_key="  abc\r\n def  ",
        gemini_api_key="key",
    )
    assert s.supabase_service_key == "abcdef"