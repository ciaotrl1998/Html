"""Build the installable legacy add-on ZIP with Python's standard library."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)
archive = DIST / 'Biped_Builder_1.2.0.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    for source in sorted((ROOT / 'biped_builder').glob('*.py')):
        z.write(source, f'biped_builder/{source.name}')
    z.write(ROOT / 'README.md', 'biped_builder/README.md')
with ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'biped_builder/__init__.py' in z.namelist()
    assert not any('__pycache__' in name for name in z.namelist())
print('INSTALL_ZIP', archive, archive.stat().st_size)
