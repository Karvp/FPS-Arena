"""Chromium popup UI smoke test, with mocked Firefox WebExtension APIs.

Renders an in-memory HTML page (no network/file navigation necessary). This
is not an actual installed Firefox/LibreWolf test.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
html = (ROOT/'popup.html').read_text()
html = html.replace('<link rel="stylesheet" href="popup.css">', '<style>' + (ROOT/'popup.css').read_text() + '</style>')
for js in ('domain-utils.js','popup.js'):
    html = html.replace(f'<script src="{js}"></script>', '<script>' + (ROOT/js).read_text() + '</script>')
mock = """
const data={ options:{},customDomains:[] };
const listeners=[];
window.browser={
 storage:{local:{get:async(key)=>typeof key==='string'?{[key]:data[key]}:key.reduce((a,k)=>(a[k]=data[k],a),{}),
   set:async(change)=>{for(const [k,v] of Object.entries(change)){const oldValue=data[k];data[k]=v;
     for(const fn of listeners)fn({[k]:{oldValue,newValue:v}},'local');}}},onChanged:{addListener(fn){listeners.push(fn)}}},
 permissions:{request:async()=>true,remove:async()=>true},
 tabs:{query:async()=>[{id:1,url:'https://fps-arena-rosy.vercel.app/'}],sendMessage:async()=>({found:true,state:'ready',message:'Connected to FPS Arena'})},
 runtime:{sendMessage:async msg=>msg.type==='fpsarena:record:list'?{active:0,records:[]}:
   msg.type==='fpsarena:record:export'?{record:null}:{ok:true}}
};
window.__getStored=()=>data;
"""
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':380,'height':720}, device_scale_factor=1)
    page = context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.evaluate(mock)
    page.set_content(html)
    page.locator('#domainList .domain-item').first.wait_for()
    assert page.locator('#domainList .domain-item').count()==3
    assert page.get_by_text('https://fps-arena-rosy.vercel.app').count()==1
    assert page.locator('.domain-item button').count()==0
    page.locator('#domainInput').fill('https://tournament.example.net/match?round=5')
    page.locator('#domainAdd').click()
    page.get_by_text('https://tournament.example.net',exact=True).wait_for()
    assert page.locator('.domain-item').count()==4
    assert page.evaluate("__getStored().customDomains")==['https://tournament.example.net']
    page.locator('.domain-item button').click()
    assert page.locator('.domain-item').count()==3
    assert page.evaluate("__getStored().customDomains")==[]
    assert page.locator('#routeCommitment').is_checked()
    page.locator('#routeCommitment').uncheck()
    page.wait_for_function('__getStored().options.routeCommitment === false')
    page.locator('#routeCommitment').check()
    page.wait_for_function('__getStored().options.routeCommitment === true')
    page.locator('#autoLoot').uncheck()
    page.wait_for_function('__getStored().options.autoLoot === false')
    page.locator('#autoLoot').check()
    page.wait_for_function('__getStored().options.autoLoot === true')
    page.locator('#zombieSpacing').select_option('28')
    page.wait_for_function('__getStored().options.zombieSpacing === 28')
    page.locator('#reloadQuietSeconds').select_option('5')
    page.wait_for_function('__getStored().options.reloadQuietSeconds === 5')
    page.locator('#brAggression').select_option('95')
    page.wait_for_function('__getStored().options.brAggression === 95')
    page.locator('#brLeadSeconds').select_option('32')
    page.wait_for_function('__getStored().options.brLeadSeconds === 32')
    page.locator('#sidearmEmergencyRange').select_option('8')
    page.wait_for_function('__getStored().options.sidearmEmergencyRange === 8')
    page.locator('#autoSkills').uncheck()
    page.wait_for_function('__getStored().options.autoSkills === false')
    page.locator('#autoSkills').check()
    page.wait_for_function('__getStored().options.autoSkills === true')
    page.locator('#weaponTactics').uncheck()
    page.wait_for_function('__getStored().options.weaponTactics === false')
    page.locator('#weaponTactics').check()
    page.wait_for_function('__getStored().options.weaponTactics === true')
    page.locator('#autoSlide').uncheck()
    page.wait_for_function('__getStored().options.autoSlide === false')
    page.locator('#autoSlide').check()
    page.wait_for_function('__getStored().options.autoSlide === true')
    page.locator('#autoCrouch').uncheck()
    page.wait_for_function('__getStored().options.autoCrouch === false')
    page.locator('#autoCrouch').check()
    page.wait_for_function('__getStored().options.autoCrouch === true')
    page.locator('#evasiveCrouch').uncheck()
    page.wait_for_function('__getStored().options.evasiveCrouch === false')
    page.locator('#evasiveCrouch').check()
    page.wait_for_function('__getStored().options.evasiveCrouch === true')
    page.locator('#fastAim').uncheck()
    page.wait_for_function('__getStored().options.fastAim === false')
    page.locator('#fastAim').check()
    page.wait_for_function('__getStored().options.fastAim === true')
    page.locator('#smartCover').uncheck()
    page.wait_for_function('__getStored().options.smartCover === false')
    page.locator('#smartCover').check()
    page.wait_for_function('__getStored().options.smartCover === true')
    page.locator('#enemyAmmoAwareness').uncheck()
    page.wait_for_function('__getStored().options.enemyAmmoAwareness === false')
    page.locator('#enemyAmmoAwareness').check()
    page.wait_for_function('__getStored().options.enemyAmmoAwareness === true')
    for setting in ('cameraTactics','reloadCover','peekLongDelay'):
        page.locator('#'+setting).uncheck()
        page.wait_for_function(f'__getStored().options.{setting} === false')
        page.locator('#'+setting).check()
        page.wait_for_function(f'__getStored().options.{setting} === true')
    assert page.locator('#recordMatches').is_checked() is False
    page.locator('#recordMatches').check()
    page.wait_for_function('__getStored().options.recordMatches === true')
    page.locator('#recordMatches').uncheck()
    page.wait_for_function('__getStored().options.recordMatches === false')
    assert page.locator('#exportRecord').count()==1
    assert page.locator('#clearRecords').count()==1
    page.locator('#enabled').check()
    page.wait_for_function('__getStored().options.enabled === true')
    page.screenshot(path='/mnt/data/FPS-Arena-Combat-Suite-v2.7.7-popup.png',full_page=True)
    assert not errors, errors
    print('PASS: default sites, add, remove, save options, popup JS, screenshot')
    browser.close()
