"""Headless offline Match Replay Lab smoke test. Uses synthetic match data only."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT = Path(__file__).resolve().parent.parent
synthetic = {"format":"fpsarena-record-bundle-v2","records":[
  {"matchId":"qa-zm-01","meta":{"mode":"zm","map":"marsh"},"samples":[
    {"t":0,"p":[0,0,0],"hp":100,"armor":50,"dir":[0,0],
      "ws":{"slot":0,"guns":[{"id":"m4a1","mag":30}]},
      "zombies":[{"pos":[2,0,-3],"yaw":0}],"crates":[{"x":4,"z":-5}],
      "target":{"id":"z:1","pos":[2,1.6,-3],"visible":True},
      "decision":{"reason":"zombie-survival"},"ring":None},
    {"t":0.5,"p":[1,0,-1],"hp":80,"armor":50,"dir":[.3,0],
      "ws":{"slot":0,"guns":[{"id":"m4a1","mag":29}]},
      "zombies":[{"pos":[3,0,-2],"yaw":.5}],"crates":[],
      "target":None,"decision":{"reason":"reload-cover"},"ring":None}],
     "events":[{"t":.4,"type":"own-fire","data":{"weapon":"m4a1"}}]}
]}
with sync_playwright() as play:
    browser = play.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page = browser.new_page(viewport={"width":1190,"height":850})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((ROOT/'lab/replay.html').read_text(), wait_until='load')
    page.locator('#file').set_input_files({"name":"qa.json","mimeType":"application/json","buffer":json.dumps(synthetic).encode()})
    page.locator('#match option').first.wait_for(state='attached')
    assert 'qa-zm-01' in page.locator('#match').inner_text()
    assert page.locator('#hp').inner_text()=='100'
    page.locator('#timeline').fill('1')
    page.locator('#timeline').dispatch_event('input')
    assert page.locator('#hp').inner_text()=='80'
    assert 'reload-cover' in page.locator('#reason').inner_text()
    page.screenshot(path='/mnt/data/FPS-Arena-v2.7.0-Replay-Lab.png',full_page=True)
    assert not errors,errors
    browser.close()
print('PASS: offline replay JSON import, timeline, drawing, no page errors')
