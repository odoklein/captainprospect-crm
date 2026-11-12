"""Exercise the actual local Next UI; every browser API response is synthetic.
No CRM writes or model requests leave this browser context.
"""
import json
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.codex-screenshots' / 'captain-workspace-applied'
OUT.mkdir(parents=True, exist_ok=True)
NOW = '2026-11-03T15:00:00.000Z'
def folder(suffix, name):
    return dict(id='qa-folder-'+suffix, name=name, kind='CLIENT', color=None, icon=None,
                clientId='qa-client-'+suffix, counts=dict(conversations=1, memories=1, files=1, pins=0),
                lastActivityAt=NOW, hasAgentActivity=True, instructions='Conserver un suivi factuel et sourcé.',
                instructionsTokens=10, instructionsMaxTokens=600, starterQuestions=[],
                missions=[dict(id='qa-mission-'+suffix,name='Mission '+name,status='ACTIVE')],createdAt=NOW,archivedAt=None)
FA, FB = folder('a','Atelier Nord QA'), folder('b','Nova Conseil QA')
def conv(suffix='a'):
    f = FA if suffix == 'a' else FB
    return dict(id='qa-thread-'+suffix,title='Préparer la prochaine étape',kind='CHAT',visibility='PRIVATE',pinnedAt=None,
                folderId=f['id'],clientId=f['clientId'],missionId='qa-mission-'+suffix,missionName='Mission '+f['name'],
                messageCount=2,lastMessageAt=NOW,createdAt=NOW,isOwner=True,ownerName='Camille QA',preview='Une journée reste à vérifier.',summary=None,folder=f)
PROPOSAL = dict(id='qa-proposal',runId='qa-run',tool='send_draft',args=dict(draft_id='qa-draft'),
    card=dict(title='Examiner le message de suivi',details=[dict(label='Client',value=FA['name'])],warning=None,confirmLabel='Approuver',danger=False),
    rationale='Préparé à partir du dossier.',risk='confirm',state='PENDING',proposedAt=NOW,expiresAt='2099-01-01T00:00:00Z',decidedByName=None,decidedAt=None,executedAt=None,outcome=None)
RUN = dict(id='qa-run',jobId=None,jobName=None,kind='MISSION',playbook='mission.delegated',trigger='MANUAL',status='WAITING_APPROVAL',
    goal='Préparer le point client QA',summary='Le plan est prêt à examiner.',folderId=FA['id'],clientId=FA['clientId'],clientName=FA['name'],conversationId='qa-thread-a',
    findingsCount=0,proposalsCount=1,pendingProposals=1,costEur=.08,mode='worker',error=None,actorName='Camille QA',createdAt=NOW,startedAt=NOW,finishedAt=NOW,
    plan=dict(steps=[dict(title='Lire le dossier',intent='Examiner les sources',status='DONE'),dict(title='Préparer le message',status='DONE')]),
    budget={},steps=[],proposals=[PROPOSAL],findings=[],report=None,heartbeatAt=None)
FINDING = dict(id='qa-finding',rule='client_at_risk',severity='CRITICAL',kind='RISK',title='Une couverture reste à préparer QA',
    body='Vérifier le planning et la capacité disponible avant de proposer un ajustement.',metrics=None,folderId=FA['id'],clientId=FA['clientId'],clientName=FA['name'],
    subjectUserId=None,subjectName=None,state='OPEN',firstSeenAt=NOW,lastSeenAt=NOW,seenCount=1,snoozedUntil=None,runId=None)
checks, errors, mutations, requests = [], [], [], []
def ok(data): return dict(success=True,data=data)
def intercept(route):
    request = route.request
    u = urlparse(request.url)
    if u.hostname not in ('127.0.0.1','localhost'):
        route.abort(); return
    p, q = u.path, parse_qs(u.query)
    if not p.startswith('/api/'):
        route.continue_(); return
    requests.append(p)
    if request.method not in ('GET','HEAD'):
        mutations.append(dict(path=p,method=request.method))
        route.fulfill(status=409,json=dict(success=False,error='UI QA prevents live writes')); return
    if p == '/api/auth/session':
        data=dict(user=dict(id='qa-manager',name='Camille QA',email='qa@example.test',role='MANAGER',isActive=True),expires='2099-01-01T00:00:00Z')
    elif p == '/api/incoming-calls': data=ok(dict(enabled=False,calls=[]))
    elif p.endswith('/permissions'): data=ok(['pages.dashboard','pages.clients','pages.planning','pages.analytics','pages.email'])
    elif p == '/api/manager/assistant/folders': data=ok(dict(general=[],clients=[dict(clientId=f['clientId'],name=f['name'],missions=f['missions'],folder=f) for f in (FA,FB)],pinnedConversations=[]))
    elif p.startswith('/api/manager/assistant/folders/'):
        f = FB if FB['id'] in p else FA
        if p.endswith('/context'): data=ok(dict(updatedAt=NOW,client=dict(id=f['clientId'],name=f['name'],industry='Conseil',email='qa@example.test',status='ACTIVE'),missions=[dict(**f['missions'][0],objective='Développer les rendez-vous qualifiés.')],activity=dict(month='2026-11',calls=320,meetingsBooked=12,workedDays=8,plannedDays=14,estimatedPlan=False)))
        elif p.endswith('/files'): data=ok(dict(files=[dict(fileId='qa-file',name='Brief client QA.pdf',mimeType='application/pdf',size=1500,status='READY',pages=2,chunkCount=3,tokens=100,error=None,uploadedByName='Camille QA',createdAt=NOW,extractedAt=NOW,url=None)],indexableProjectFiles=0))
        elif p.endswith('/pins'): data=ok(dict(items=[]))
        else: data=ok(f)
    elif p == '/api/manager/assistant/memories':
        fid=q.get('folderId',[None])[0]
        data=ok(dict(agency=[],user=[],folder=[dict(id='qa-memory',scope='FOLDER',kind='PREFERENCE',content='Conserver Julie sur cette mission.',pinned=True,folderId=fid,missionId=None,source=None,useCount=1,lastUsedAt=NOW,createdAt=NOW,updatedAt=NOW,deletedAt=None)] if fid else []))
    elif p == '/api/manager/assistant/conversations':
        fid=q.get('folderId',[None])[0]
        data=ok(dict(items=[conv('b' if fid==FB['id'] else 'a')],nextCursor=None))
    elif p.startswith('/api/manager/assistant/conversations/'):
        c=conv('b' if p.endswith('qa-thread-b') else 'a')
        data=ok(dict(conversation=c,messages=[dict(id='qa-user',role='USER',content='Fais le point sur le client et prépare la prochaine étape.',createdAt=NOW,trace=None,action=None,attachments=None,feedback=None),dict(id='qa-answer',role='ASSISTANT',content='Le dossier est prêt à examiner. Une journée de couverture reste à vérifier avant toute proposition de planning.\n\nJe peux préparer une synthèse avec les sources disponibles.',createdAt=NOW,trace=None,action=None,attachments=None,feedback=None)],olderCursor=None,canWrite=True))
    elif p == '/api/manager/agent/overview': data=ok(dict(worker=dict(mode='worker',seenAt=NOW,enabled=True),counts=dict(openFindings=1,critical=1,pendingProposals=1,running=0,queued=0),costTodayEur=.08,recentRuns=[RUN]))
    elif p == '/api/manager/agent/runs':
        fid=q.get('folderId',[None])[0]
        data=ok(dict(items=[] if fid==FB['id'] else [RUN],nextCursor=None))
    elif p.startswith('/api/manager/agent/runs/'): data=ok(RUN)
    elif p == '/api/manager/agent/findings': data=ok(dict(items=[] if q.get('folderId',[None])[0]==FB['id'] else [FINDING],nextCursor=None))
    elif p == '/api/ai/usage':
        bucket=dict(tokens=0,promptTokens=0,completionTokens=0,cachedInputTokens=0,costEur=0,requestCount=0)
        data=ok(dict(today=bucket,total=bucket,defaultModel='qa-model',source='ledger',bySurface=[],byProvider=[],cachedRatio=0))
    else: data=ok([])
    route.fulfill(json=data)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport=dict(width=1920,height=1080),extra_http_headers={'x-api-key':'synthetic-ui-qa-only'},service_workers='block')
    context.route('**/*',intercept)
    page=context.new_page()
    page.emulate_media(reduced_motion='reduce')
    page.on('pageerror',lambda error: errors.append(error.stack or str(error)))
    try:
        page.goto('http://127.0.0.1:5101/manager/assistant?view=pilotage',wait_until='domcontentloaded',timeout=120000)
        expect(page.get_by_role('heading',name='Les décisions du jour')).to_be_visible(timeout=20000)
        expect(page.get_by_role('heading',name='Studio de l’opération')).to_have_count(0)
        expect(page.get_by_label('Studio de l’opération')).to_be_visible()
        page.screenshot(path=str(OUT/'decision-desk-desktop.png'),full_page=True)
        checks.append('real workspace renders live-data-shaped decision queue and operation review')
        page.get_by_label('Studio de l’opération').get_by_role('button',name='Discuter avec Captain',exact=True).click()
        expect(page.locator('[data-captain-thread]').get_by_text('Fais le point sur le client et prépare la prochaine étape.')).to_be_visible()
        page.get_by_role('button',name='Captain · Conversation',exact=True).click()
        expect(page.locator('[data-captain-thread]')).to_be_visible()
        expect(page.get_by_role('heading',name='Contexte de Captain')).to_be_visible()
        page.screenshot(path=str(OUT/'captain-conversation-desktop.png'),full_page=True)
        composer=page.locator('[data-captain-thread] textarea').last
        composer.fill('Brouillon QA à conserver')
        page.evaluate('window.__captainComposer = document.querySelector("[data-captain-thread] textarea")')
        page.get_by_role('button',name='Retrouver le travail et garder la discussion ouverte').click()
        expect(page.get_by_role('heading',name='Les décisions du jour')).to_be_visible()
        assert page.evaluate('window.__captainComposer === document.querySelector("[data-captain-thread] textarea")')
        expect(composer).to_have_value('Brouillon QA à conserver')
        page.get_by_role('button',name='Ouvrir la conversation en grand').click()
        assert page.evaluate('window.__captainComposer === document.querySelector("[data-captain-thread] textarea")')
        checks.append('same composer node and draft survive full/docked/full conversation')
        page.get_by_role('button',name=re.compile(re.escape(FA['name']))).first.click()
        expect(page.get_by_role('heading',name='Activité du mois')).to_be_visible()
        expect(page.get_by_text('320',exact=True)).to_be_visible()
        page.screenshot(path=str(OUT/'client-month-desktop.png'),full_page=True)
        page.get_by_role('button',name=re.compile(re.escape(FB['name']))).first.click()
        expect(page.get_by_role('heading',name=FB['name'],exact=True)).to_be_visible()
        expect(page.get_by_label('File des décisions').get_by_text('Préparer le point client QA')).to_have_count(0)
        expect(page.locator('[data-captain-thread] textarea').last).not_to_have_value('Brouillon QA à conserver')
        checks.append('client switch clears conversation target and does not leak earlier decisions/draft')
        page.get_by_role('button',name='Pilotage',exact=True).click()
        page.get_by_role('button',name=re.compile('^Opérations')).first.click()
        expect(page.get_by_role('heading',name='De la discussion au travail suivi.')).to_be_visible()
        expect(page.get_by_label('Studio de l’opération')).to_be_visible()
        page.screenshot(path=str(OUT/'operation-studio-desktop.png'),full_page=True)
        page.get_by_role('button',name='Pilotage',exact=True).click()
        expect(page.get_by_role('heading',name='Les décisions du jour')).to_be_visible()
        for width in (1440,1280,768,390,320):
            page.set_viewport_size(dict(width=width,height=1000))
            expect(page.get_by_role('heading',name='Les décisions du jour')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
            if width==390:
                page.screenshot(path=str(OUT/'decision-desk-mobile.png'),full_page=True)
                page.locator('[data-captain-discussion-toggle]').click()
                expect(page.get_by_role('button',name='Revenir au travail')).to_be_visible()
                page.locator('[data-captain-thread] textarea').last.fill('Brouillon mobile QA')
                page.screenshot(path=str(OUT/'captain-discussion-mobile.png'),full_page=True)
                page.get_by_role('button',name='Revenir au travail').click()
                expect(page.get_by_role('heading',name='Les décisions du jour')).to_be_visible()
                page.locator('[data-captain-discussion-toggle]').click()
                expect(page.locator('[data-captain-thread] textarea').last).to_have_value('Brouillon mobile QA')
                page.get_by_role('button',name='Revenir au travail').click()
        checks.append('desktop/tablet/mobile widths have no document overflow; mobile dock preserves its draft')
        assert not errors, errors
        assert not mutations, mutations
        checks.append('no uncaught page errors and no business/model requests sent')
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'),full_page=True)
        (OUT/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8')
        raise
    finally:
        (OUT/'results.json').write_text(json.dumps(dict(checks=checks,pageErrors=errors,interceptedMutations=mutations,requests=requests),indent=2,ensure_ascii=False),encoding='utf-8')
        browser.close()
print(json.dumps(dict(checks=checks,pageErrors=errors,interceptedMutations=mutations),ensure_ascii=False))
