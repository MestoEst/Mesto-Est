import os,sys,tempfile,json,csv
from pathlib import Path
sys.path.insert(0,str(Path.cwd()))
os.environ['DJANGO_SETTINGS_MODULE']='MestoEst.settings'
from django.conf import settings
with tempfile.TemporaryDirectory() as temp:
 settings.DATABASES['default']['NAME']=str(Path(temp)/'rehearsal.sqlite3')
 import django;django.setup()
 from django.core.management import call_command
 from django.core.management.base import CommandError
 from django.utils import timezone
 from main.models import ParkingSpot,SpotObservation,SpotHourStat
 call_command('migrate',verbosity=0)
 features=json.load(open('main/data/spots.geojson'))['features']
 now=timezone.localtime()
 for i,f in enumerate(features,1):
  s=ParkingSpot.objects.create(code=f'spot-{i}',geometry=f['geometry'])
  SpotObservation.objects.create(spot=s,is_occupied=bool(i%2))
  SpotHourStat.objects.create(spot=s,date=now.date(),weekday=now.isoweekday(),hour=now.hour,total=10,free=4)
 before={s.pk:(s.geometry,list(s.observations.values_list('pk',flat=True)),list(s.hour_stats.values_list('pk','total','free'))) for s in ParkingSpot.objects.all()}
 table='docs/spot-ids/code-map-confirmed.csv'
 call_command('remap_spot_codes',table,dry_run=True)
 assert ParkingSpot.objects.filter(code__startswith='spot-').count()==734
 call_command('remap_spot_codes',table)
 for row in csv.DictReader(open(table)):
  s=ParkingSpot.objects.get(code=row['new_code']);assert s.pk==int(row['old_code'].split('-')[1])
 for s in ParkingSpot.objects.all():assert before[s.pk]==(s.geometry,list(s.observations.values_list('pk',flat=True)),list(s.hour_stats.values_list('pk','total','free')))
 subset={'type':'FeatureCollection','features':[f for f in features if f['properties'].get('id')]}
 path=Path(temp)/'confirmed.geojson';path.write_text(json.dumps(subset))
 call_command('import_spots',path);call_command('import_spots',path)
 assert ParkingSpot.objects.count()==734
 try:call_command('import_spots','main/data/spots.geojson')
 except CommandError as e:print('Expected full import rejection:',e)
 else:raise AssertionError('unresolved file must fail')
 assert ParkingSpot.objects.count()==734
 print('PASS: temporary DB, 734 PKs and histories/stats preserved; 434 remapped; repeated subset import stays at 734; unresolved full file rejected.')
