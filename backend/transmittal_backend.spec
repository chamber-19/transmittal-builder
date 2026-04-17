# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the Transmittal Builder backend sidecar.
# Requires PyInstaller >= 6.10 (Python 3.13 support).
#
# Build (from the backend/ directory):
#   pip install -r requirements.txt -r requirements-build.txt
#   pyinstaller transmittal_backend.spec --distpath dist-sidecar --workpath build-sidecar
#
# Output: dist-sidecar/transmittal-backend/  (one-dir build)
# Copy the entire dist-sidecar/transmittal-backend/ folder to:
#   frontend/src-tauri/binaries/transmittal-backend/
#
# NOTE: Use console=True (console subsystem) so that Rust can read the
# port number from stdout.  The Rust launcher sets CREATE_NO_WINDOW so
# the console window never appears to the end user.

a = Analysis(
    ['app.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('core',   'core'),
        ('emails', 'emails'),
    ],
    hiddenimports=[
        # uvicorn internals loaded dynamically
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # FastAPI / Starlette internals
        'fastapi',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        # pydantic / templates
        'pydantic',
        'pydantic.deprecated.class_validators',
        # jinja2, docxtpl, pdf2docx are pulled in transitively by installed
        # packages (docxtpl→jinja2, pdf2docx). PyInstaller resolves them via
        # the installed packages' own hooks, so listing them here only causes
        # "Hidden import 'X' not found" errors when the package's top-level
        # module name differs from the import path PyInstaller expects.
        # openpyxl, pandas engines
        'openpyxl',
        'openpyxl.styles',
        'openpyxl.utils',
        'pandas',
        # python-docx
        'docx',
        # pypdf
        'pypdf',
        # python-multipart (FastAPI file upload)
        'multipart',
        'multipart.multipart',
        # email internals used by emails/ package
        'email',
        'email.mime',
        'email.mime.multipart',
        'email.mime.text',
        'email.mime.base',
        'email.mime.application',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='transmittal-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='transmittal-backend',
)