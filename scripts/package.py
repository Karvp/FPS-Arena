"""Build a deterministic zip of the FPS Arena Combat Suite extension and source tests."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
from subprocess import run
root=Path(__file__).resolve().parent.parent
release=root.parent/'FPS-Arena-Combat-Suite-v2.9.11-Engagement-Opportunity-Lab.zip'
run(['node',str(root/'scripts'/'build.mjs')],check=True)
files=[p for p in root.rglob('*') if p.is_file() and not p.name.endswith(('.pyc','.swp')) and '__pycache__' not in p.parts]
with ZipFile(release,'w',ZIP_DEFLATED,compresslevel=9) as archive:
    for file in sorted(files):
        name=file.relative_to(root).as_posix()
        entry=ZipInfo(name, date_time=(2026,10,11,12,0,0))
        entry.compress_type=ZIP_DEFLATED
        entry.external_attr=0o644 << 16
        archive.writestr(entry,file.read_bytes(),compress_type=ZIP_DEFLATED,compresslevel=9)
print(f'Packaged {len(files)} files into {release} ({release.stat().st_size} bytes)')
