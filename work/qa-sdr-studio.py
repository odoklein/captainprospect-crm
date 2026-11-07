"""Exercise local calling pages. All API requests are synthetic; external requests blocked."""
import json,re,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.codex-screenshots'/'sdr-studio'
OUT.mkdir(parents=True,exist_ok=True)
checks=[]; errors=[]; requests=[]; writes=[]
state={'journalError':False,'saved':0,'dial':0}
NOW='2026-11-07T14:15:00Z'
mission={'id':'qa-mission','name':'Développement · Atelier Nord','channel':'CALL','channels':['CALL'],'client':{'name':'Atelier Nord'}}
company={'id':'qa-company','name':'Maison Rivage','industry':'Conseil et services','country':'France','website':'https://example.test','phone':'+33100000000','status':'ACTIONABLE'}
contact={'id':'qa-contact','firstName':'Camille','lastName':'Martin','title':'Directrice commerciale','email':'camille@example.test','phone':'+33600000000','linkedin':None,'status':'ACTIONABLE'}
statuses=[{'code':c,'label':l,'color':None,'sortOrder':i,'requiresNote':False,'triggersCallback':c=='CALLBACK_REQUESTED'} for i,(c,l) in enumerate([('NO_RESPONSE','Pas de réponse'),('INTERESTED','Intéressé'),('CALLBACK_REQUESTED','À rappeler'),('MEETING_BOOKED','RDV pris'),('DISQUALIFIED','Disqualifié')])]
prospect=dict(hasNext=True,priority='NEW',missionName=mission['name'],contact=contact,company=company,campaignId='qa-campaign',script='Bonjour Camille, je vous appelle au sujet du développement de votre équipe commerciale. Comment organisez-vous votre prospection aujourd’hui ?\n\nL’objectif de cet échange : comprendre vos priorités et proposer un rendez-vous utile.',lastAction=None,lastActionBy=None,companyLastAction=None,sharedPhoneCall=None,sourceListName='Dirigeants · Île-de-France')
rows=[dict(id='qa-call-'+str(i),kind='action',at=NOW,sdr={'id':'qa-sdr','name':'Alex Laurent'},contact={'id':'qa-contact','name':name,'title':'Direction commerciale'},company={'id':'qa-company','name':co},phone='+33600000000',mission={'id':'qa-mission','name':mission['name'],'client':'Atelier Nord'},status={'code':statuses[i%5]['code'],'label':statuses[i%5]['label'],'color':None},telephonyStatus='COMPLETED',durationSec=180+i*30,hasRecording=True,hasSummary=True,note='Reprendre contact au prochain trimestre.' if i%2 else None,source='crm') for i,(name,co) in enumerate([('Camille Martin','Maison Rivage'),('Thomas Bernard','Studio Horizon'),('Sarah Moreau','Atelier Forma'),('Nicolas Petit','Groupe Solstice'),('Léa Dubois','Nova Conseil'),('Alexandre Richard','Collectif Nord')])]
contacts=[contact,{**contact,'id':'qa-contact-2','firstName':'Thomas','lastName':'Bernard','title':'Responsable des opérations'}, {**contact,'id':'qa-contact-3','firstName':'Sarah','lastName':'Moreau','title':'Directrice générale'}]
activities=[{'id':'event-'+str(i),'createdAt':at,'result':result,'channel':channel,'note':note,'duration':duration,'callSummary':summary,'sdr':{'name':'Alex Laurent'},'contactId':'qa-contact','contact':contact} for i,(at,result,channel,note,duration,summary) in enumerate([('2026-11-07T14:15:00Z','INTERESTED','CALL','Camille souhaite structurer la prospection de son équipe.',224,'Priorité : identifier les comptes à fort potentiel. Prochaine étape : présenter une approche dédiée.'),('2026-11-06T10:30:00Z','MEETING_BOOKED','CALL','Rendez-vous de découverte confirmé pour mardi à 10 h.',128,None),('2026-11-05T09:00:00Z','CALLBACK_REQUESTED','CALL','Disponible en début de semaine prochaine.',62,None),('2026-11-04T11:00:00Z','ACTIONABLE','LINKEDIN','Contact qualifié et ajouté à la campagne.',None,None)])]

def ok(d):return {'success':True,'data':d}
def intercept(route):
 u=urlparse(route.request.url);p=u.path;q=parse_qs(u.query)
 if u.hostname not in ('localhost','127.0.0.1'):route.abort();return
 if not p.startswith('/api/'):route.continue_();return
 requests.append(p)
 if route.request.method not in ('GET','HEAD'):writes.append(p)
 if p=='/api/auth/session':d={'user':{'id':'qa-sdr','name':'Alex Laurent','email':'qa@example.test','role':'SDR','isActive':True},'expires':'2099-01-01T00:00:00Z'}
 elif p=='/api/telephony/config':d=ok({'softphone':True,'recording':True,'transcription':True,'callerId':'+33100000000'})
 elif p=='/api/telephony/calls' and route.request.method=='POST':
  state['dial']+=1
  route.fulfill(status=422,json={'success':False,'error':'Numéro de démonstration : aucun appel réel effectué.'});return
 elif p=='/api/telephony/token':route.fulfill(status=403,json={'success':False,'error':'QA blocks SDK connections'});return
 elif p=='/api/sdr/missions':d=ok([mission])
 elif p=='/api/sdr/lists':d=ok([{'id':'qa-list','name':'Dirigeants · Île-de-France','mission':mission,'contactsCount':6}])
 elif p=='/api/sdr/today-blocks':d=ok({'hasBlocksToday':True,'todayMissionIds':['qa-mission'],'blocks':[],'todayBlocks':[]})
 elif p=='/api/config/action-statuses':d=ok({'statuses':statuses})
 elif p=='/api/actions/next':d=ok(prospect if state['saved']==0 else {**prospect,'contact':{**contact,'id':'qa-contact-2','firstName':'Thomas','lastName':'Bernard'}})
 elif p=='/api/actions' and route.request.method=='GET':d=ok(activities)
 elif p=='/api/campaigns':d=ok([{'id':'qa-campaign','name':'Direction commerciale','channel':'CALL','mission':mission,'missionId':'qa-mission'}])
 elif p=='/api/sdr/absent-rdvs/target':d=ok(None)
 elif p=='/api/sdr/prospect-submissions/context':d=ok({'mode':'OFF','lists':[]})
 elif p.endswith('/client-booking'):d=ok({'clientBookingUrl':None,'interlocuteurs':[]})
 elif p=='/api/email/threads':d=ok({'threads':[{'id':'qa-email','subject':'Notre échange · prochaines étapes','snippet':'Bonjour Camille, voici les éléments présentés ensemble et les créneaux proposés.','lastEmailAt':'2026-11-07T15:00:00Z','contact':contact,'latestEmail':{'direction':'OUTBOUND','date':'2026-11-07T15:00:00Z','status':'SENT'}}]})
 elif p=='/api/actions' and route.request.method=='POST':state['saved']+=1;d=ok({'id':'qa-saved'})
 elif p=='/api/sdr/action-queue':d=ok({'items':[{**prospect,'contactId':contact['id'],'companyId':company['id'],'channel':'CALL','hasContactInfo':True}],'paused':None})
 elif p=='/api/sdr/calls':
  if state['journalError']:route.fulfill(status=503,json={'success':False,'error':'Connexion momentanément indisponible'});return
  filtered=[r for r in rows if q.get('q',[''])[0].lower() in r['contact']['name'].lower()]
  d=ok({'view':'journal','start':'2026-11-07','end':'2026-11-07','page':1,'limit':50,'total':len(filtered),'rows':filtered,'kpis':{'calls':len(filtered),'meetings':1,'talkSeconds':1530,'measuredCalls':6,'withRecording':6},'unqualified':2,'facets':{'statuses':[{'id':s['code'],'label':s['label'],'count':2,'color':None} for s in statuses],'sdrs':[],'missions':[{'id':mission['id'],'label':mission['name'],'count':6}]},'telephonyEnabled':True})
 elif p.startswith('/api/sdr/calls/qa-call-'):
  r=next(r for r in rows if r['id']==p.split('/')[-1]);d=ok({**r,'callbackDate':None,'recordingUrl':None,'summary':'Le prospect souhaite développer sa prospection. Un suivi est prévu la semaine prochaine.','transcription':'Bonjour, notre priorité est de structurer la prospection.','ai':{'status':'none'},'transcript':[],'telephony':None,'history':[{'id':a['id'],'at':a['createdAt'],'status':{'code':a['result'],'label':next((x['label'] for x in statuses if x['code']==a['result']),a['result'])},'channel':a['channel'],'note':a['note'],'durationSec':a['duration'],'summary':a['callSummary'],'sdr':'Alex Laurent'} for a in activities]})
 elif p=='/api/incoming-calls':d=ok({'enabled':False,'calls':[]})
 elif p.endswith('/permissions'):d=ok(['pages.dashboard','pages.missions','pages.prospects'])
 elif p=='/api/sdr/brief':d=ok({'status':'ready','cached':True,'generatedAt':NOW,'brief':{'context':'Maison Rivage développe son équipe commerciale et souhaite structurer sa prospection.','angle':'Partir de leur organisation actuelle pour identifier où leur équipe perd du temps.','talkingPoints':['Une équipe de prospection dédiée','Un suivi transparent des résultats'],'questions':['Comment identifiez-vous vos prospects aujourd’hui ?','Quel volume de rendez-vous visez-vous ?'],'watchOut':[]}})
 elif p=='/api/sdr/pace' or p=='/api/sdr/daily-feedback':d={'success':False}
 elif p=='/api/notifications':d=ok({'notifications':[],'unreadCount':0})
 elif p=='/api/sdr/activity':d=ok({'isActive':False,'totalActiveSecondsToday':0})
 elif p.startswith('/api/contacts/'):d=ok({**next((c for c in contacts if c['id']==p.split('/')[-1]),contact),'company':company,'companyId':company['id']})
 elif p.startswith('/api/companies/'):d=ok({**company,'contacts':contacts,'customData':{}})
 else:d=ok([])
 route.fulfill(json=d)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1440,'height':960},extra_http_headers={'x-api-key':'synthetic-ui-qa-only'},service_workers='block')
 context.route('**/*',intercept)
 context.add_init_script("localStorage.setItem('focus_autodial','0');localStorage.setItem('sdr_view_mode','table')")
 page=context.new_page();page.on('pageerror',lambda e:errors.append(e.stack))
 try:
  page.goto('http://127.0.0.1:5101/sdr/appels',wait_until='domcontentloaded',timeout=180000)
  expect(page.get_by_role('heading',name='Mes appels')).to_be_visible(timeout=90000)
  expect(page.get_by_role('button',name='Ouvrir l’appel de Camille Martin')).to_be_visible(timeout=30000)
  page.screenshot(path=str(OUT/'mes-appels-desktop.png'))
  page.get_by_role('button',name='Ouvrir l’appel de Camille Martin').click()
  expect(page.get_by_text('Le prospect souhaite développer sa prospection.',exact=False)).to_be_visible()
  page.get_by_role('heading',name='Activité du prospect').scroll_into_view_if_needed()
  expect(page.get_by_text('Notre échange · prochaines étapes',exact=True)).to_be_visible()
  page.screenshot(path=str(OUT/'mes-appels-detail.png'))
  page.get_by_role('button',name='Emails',exact=True).click()
  expect(page.get_by_text('Notre échange · prochaines étapes',exact=True)).to_be_visible()
  checks.append('timeline combines CRM interactions and mailbox emails; filters work')
  page.keyboard.press('Escape')
  page.get_by_role('textbox',name='Rechercher',exact=True).fill('Sarah')
  expect(page.get_by_role('button',name='Ouvrir l’appel de Sarah Moreau')).to_be_visible()
  expect(page.get_by_role('button',name='Ouvrir l’appel de Camille Martin')).to_have_count(0)
  checks.append('journal search and keyboard-accessible detail')
  state['journalError']=True
  page.get_by_role('button',name='Actualiser les appels').click()
  expect(page.get_by_role('alert').filter(has_text='Connexion momentanément')).to_be_visible()
  state['journalError']=False
  page.get_by_role('button',name='Réessayer',exact=True).click()
  expect(page.get_by_role('alert').filter(has_text='Connexion momentanément')).to_have_count(0)
  checks.append('journal refresh error retains results and retry recovers')
  page.get_by_role('textbox',name='Rechercher',exact=True).fill('')
  for width in (1280,768,390):
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'journal overflow {width}'
  page.wait_for_timeout(400)
  page.screenshot(path=str(OUT/'mes-appels-mobile.png'))
  page.set_viewport_size({'width':1440,'height':960})
  page.get_by_role('navigation',name='Espace d’appel').get_by_role('link',name='Mode focus').click()
  expect(page.get_by_role('heading',name='Mode Focus')).to_be_visible(timeout=90000)
  page.get_by_role('button',name=re.compile('Commencer|Démarrer')).click()
  expect(page.get_by_text('Camille Martin',exact=True).first).to_be_visible(timeout=30000)
  page.wait_for_timeout(400)
  page.screenshot(path=str(OUT/'focus-desktop.png'))
  page.get_by_role('button',name=re.compile('Fiche')).first.click()
  expect(page.get_by_text('Thomas Bernard',exact=True).first).to_be_visible(timeout=20000)
  page.screenshot(path=str(OUT/'account-map.png'))
  page.locator('.sdr-contact-node').filter(has_text='Thomas Bernard').click()
  expect(page.locator('.sdr-contact-node.is-current')).to_contain_text('Thomas Bernard')
  checks.append('account map displays roles and switches contact in focus drawer')
  page.keyboard.press('Escape')
  page.get_by_role('button',name='Appeler Espace',exact=True).click()
  expect(page.get_by_role('button',name='Afficher les détails de l’appel')).to_be_visible(timeout=15000)
  page.get_by_role('button',name='Afficher les détails de l’appel').click()
  expect(page.get_by_role('region').get_by_role('alert')).to_contain_text('Numéro de démonstration')
  page.screenshot(path=str(OUT/'notch-error.png'))
  checks.append('notch expands with explicit control and displays call failure')
  page.get_by_role('region').get_by_role('button',name='Fermer',exact=True).click()
  page.get_by_role('heading',name='Camille Martin',exact=True).click()
  page.keyboard.press('1');page.keyboard.press('Enter')
  expect(page.get_by_text('Thomas Bernard',exact=True).first).to_be_visible(timeout=15000)
  assert state['saved']==1
  checks.append('focus keyboard qualification saves once and advances')
  for width in (1280,768,390):
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'focus overflow {width}'
  page.wait_for_timeout(400)
  page.screenshot(path=str(OUT/'focus-mobile.png'))
  page.set_viewport_size({'width':1440,'height':960})
  page.get_by_role('navigation',name='Espace d’appel').get_by_role('link',name='Appeler',exact=True).click()
  expect(page.get_by_text('Maison Rivage',exact=True).first).to_be_visible(timeout=90000)
  page.screenshot(path=str(OUT/'appeler-desktop.png'))
  checks.append('Appeler renders the queue; shared navigation works across all three surfaces')
  assert not errors,errors
 except Exception:
  page.screenshot(path=str(OUT/'failure.png'))
  (OUT/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8')
  raise
 finally:
  (OUT/'results.json').write_text(json.dumps({'checks':checks,'errors':errors,'writesIntercepted':writes,'requests':list(set(requests))},ensure_ascii=False,indent=2),encoding='utf-8')
  browser.close()
print(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False))
