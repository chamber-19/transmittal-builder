# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the Transmittal Builder backend sidecar.
#
# Build (from the backend/ directory):
#   pip install pyinstaller
#   pyinstaller transmittal_backend.spec
#
# Output: dist/transmittal-backend/  (one-dir build)
# Copy the entire dist/transmittal-backend/ folder to:
#   frontend/src-tauri/binaries/transmittal-backend/
#
# NOTE: Use console=True (console subsystem) so that Rust can read the
# port number from stdout.  The Rust launcher sets CREATE_NO_WINDOW so
# the console window never appears to the end user.

block_cipher = None

a = Analysis(
    ['app.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('core',   'core'),
        ('emails', 'emails'),
    ],
    hiddenimports=[
        # uvicorn internals that are loaded dynamically
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
        # FastAPI / pydantic
        'pydantic',
        'pydantic.deprecated.class_validators',
        # openpyxl, pandas engines
        'openpyxl',
        'pandas',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zlib_data, cipher=block_cipher)

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
    # console=True keeps the process as a console-subsystem binary so
    # the parent Rust process can capture stdout (the port number).
    # CREATE_NO_WINDOW on the Rust side prevents a visible terminal.
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
