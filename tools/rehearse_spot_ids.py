"""Full migration rehearsal, always isolated; never opens the project's db.sqlite3."""
import os
import sys
import json
import tempfile
import sqlite3
from contextlib import closing, ExitStack
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
os.environ['DJANGO_SETTINGS_MODULE']='MestoEst.settings'
with tempfile.TemporaryDirectory() as temp, ExitStack() as database_connections:
    database=Path(temp)/'rehearsal.sqlite3'
    os.environ['MESTO_DB_PATH']=str(database)
    import django
    django.setup()
    from django.core.management import call_command
    from django.core.management.base import CommandError
    from django.contrib.auth import get_user_model
    from django.utils import timezone
    from django.db import models,connection,connections
    # Close even on assertion/error, before TemporaryDirectory removes SQLite files.
    database_connections.callback(connections.close_all)
    from main.models import ParkingSpot,SpotObservation,SpotHourStat,UserProfile
    from main.spot_identity import DATASET
    call_command('migrate',verbosity=0)
    # Seed the ACTUAL previous schema before exercising migration 0004.
    call_command('migrate','main','0003',verbosity=0)
    from django.db.migrations.executor import MigrationExecutor
    old_apps=MigrationExecutor(connection).loader.project_state([('main','0003_userprofile')]).apps
    OldSpot=old_apps.get_model('main','ParkingSpot')
    OldObservation=old_apps.get_model('main','SpotObservation')
    OldStat=old_apps.get_model('main','SpotHourStat')
    canonical=json.loads((ROOT/'main/data/spots.geojson').read_text())
    old=json.loads((ROOT/'main/data/archive/spots-satellite-original.geojson').read_text())['features']
    now=timezone.localtime()
    for i,f in enumerate(old,1):
        spot=OldSpot.objects.create(code=f'spot-{i}',geometry=f['geometry'],is_occupied=bool(i%2),status_updated_at=now)
        OldObservation.objects.create(spot=spot,is_occupied=bool(i%2))
        OldStat.objects.create(spot=spot,date=now.date(),weekday=now.isoweekday(),hour=now.hour,total=10,free=4)
    # An identical old/new code must still create a NEW ParkingSpot and keep old history separate.
    collision_old=OldSpot.objects.create(code=canonical['features'][0]['properties']['id'],geometry=old[0]['geometry'])
    OldObservation.objects.create(spot=collision_old,is_occupied=True)
    user=get_user_model().objects.create_user(username='retained-user',email='retained@example.test',password='test12345')
    profile=UserProfile.objects.create(user=user,phone='test')
    before={s.pk:(s.code,s.geometry,s.is_occupied,s.status_updated_at,list(s.observations.values_list('pk','is_occupied')),list(s.hour_stats.values_list('pk','total','free'))) for s in OldSpot.objects.all()}
    import subprocess
    schema_backup=Path(temp)/'before-schema.sqlite3'
    subprocess.run([sys.executable,str(ROOT/'tools/backup_sqlite.py'),'--source',str(database),'--output',str(schema_backup)],check=True)
    with closing(sqlite3.connect(schema_backup)) as db:
        assert 'dataset' not in [r[1] for r in db.execute('PRAGMA table_info(main_parkingspot)')]
    call_command('migrate',verbosity=0)
    assert ParkingSpot.objects.filter(dataset='legacy',is_active=True).count()==735
    collision=ParkingSpot.objects.get(pk=collision_old.pk)
    canonical_path=ROOT/'main/data/spots.geojson'
    try:call_command('import_spots',canonical_path)
    except CommandError:pass
    else:raise AssertionError('normal import must block active legacy records')
    call_command('transition_spots',canonical_path,dry_run=True)
    assert ParkingSpot.objects.filter(dataset=DATASET).count()==0
    # Test a real dependent booking model: preflight must block BEFORE backup or changes.
    class RehearsalBooking(models.Model):
        spot=models.ForeignKey(ParkingSpot,on_delete=models.PROTECT)
        class Meta:app_label='main'
    with connection.schema_editor() as editor:editor.create_model(RehearsalBooking)
    booking=RehearsalBooking.objects.create(spot=collision)
    try:call_command('transition_spots',canonical_path,dry_run=True)
    except CommandError as e:assert 'RehearsalBooking' in str(e)
    else:raise AssertionError('booking must block transition')
    # Only the synthetic test fixture is removed, not a real booking.
    booking.delete()
    backup=Path(temp)/'before-switch.sqlite3'
    call_command('transition_spots',canonical_path,backup=str(backup))
    with closing(sqlite3.connect(backup)) as db:
        assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert db.execute('select count(*) from main_parkingspot').fetchone()[0]==735
        assert db.execute('select count(*) from auth_user').fetchone()[0]==1
    for s in ParkingSpot.objects.exclude(dataset=DATASET):
        assert not s.is_active
        assert before[s.pk]==(s.code,s.geometry,s.is_occupied,s.status_updated_at,list(s.observations.values_list('pk','is_occupied')),list(s.hour_stats.values_list('pk','total','free')))
    new=ParkingSpot.objects.get(dataset=DATASET,code=collision.code)
    assert new.pk!=collision.pk and new.observations.count()==0 and new.is_occupied is None
    assert get_user_model().objects.get(pk=user.pk).username=='retained-user'
    assert UserProfile.objects.get(pk=profile.pk).phone=='test'
    call_command('import_spots',canonical_path);call_command('import_spots',canonical_path)
    assert ParkingSpot.objects.filter(dataset=DATASET).count()==734
    assert ParkingSpot.objects.count()==1469
    # A deliberately failed transition must roll back archive changes too.
    from unittest.mock import patch
    ParkingSpot.objects.filter(pk=collision.pk).update(is_active=True)
    with patch('main.management.commands.transition_spots.write_records',side_effect=RuntimeError('simulated interruption')):
        try:call_command('transition_spots',canonical_path,backup=str(Path(temp)/'failed-switch.sqlite3'))
        except RuntimeError:pass
        else:raise AssertionError('failure expected')
    collision.refresh_from_db();assert collision.is_active
    print('PASS: previous schema -> migration 0004 (PK/FK preserved), pre-schema full backup, isolated SQLite; 735 legacy PKs/history/stats preserved, 734 NEW spots, code collision separated, unrelated user/profile retained, full backup verified, booking blocks switch, repeated import unchanged, failed transition rolled back.')
