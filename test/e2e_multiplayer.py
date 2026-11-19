import asyncio
from playwright.async_api import async_playwright
URL="file://" + __import__("os").path.abspath("dist/index.html") + "?signal=127.0.0.1:9000"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", args=["--no-sandbox"])
        errs=[]
        async def mk(name, w, h):
            ctx = await b.new_context(viewport={"width":w,"height":h}, device_scale_factor=2, has_touch=True, is_mobile=True)
            pg = await ctx.new_page()
            pg.on("console", lambda m: errs.append(name+": "+m.text) if m.type=="error" and "ERR_TUNNEL" not in m.text else None)
            pg.on("pageerror", lambda e: errs.append(name+" PAGEERR "+str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(800)
            await pg.fill("#name", name); await pg.dispatch_event("#name","input")
            return pg
        host = await mk("Hosti", 844, 390)
        await host.click("#go-host"); await host.wait_for_timeout(200)
        await host.click("#setup-start")
        await host.wait_for_function("()=>window.__sf.session && window.__sf.session.code", timeout=15000)
        code = await host.evaluate("()=>window.__sf.session.code")
        print("code", code)
        await host.evaluate("()=>{const s=window.__sf.session.sim;s.players.get(window.__sf.world.me).prot=1e9}")
        await host.wait_for_timeout(3000)  # laufende Partie
        cl = await mk("Gasti", 390, 844)
        await cl.click("#go-join"); await cl.fill("#join-code", code.lower()); await cl.dispatch_event("#join-code","input")
        await cl.click("#join-start")
        await cl.wait_for_function("()=>window.__sf.world.me>0 && window.__sf.world.cells.length>0 && window.__sf.world.alive", timeout=20000)
        await cl.wait_for_timeout(1500)
        st = await cl.evaluate("()=>{const w=window.__sf.world;return {me:w.me,players:w.players.size,humans:[...w.players.values()].filter(p=>!p.bot).map(p=>p.name),dots:w.dots.n,cells:w.cells.length,info:!!w.info,interval:w.interval,ping:window.__sf.session.ping}}")
        print("client", st)
        hs = await host.evaluate("()=>{const s=window.__sf.session;return {humans:s.humans(),conns:s.conns.size,tick:s.sim.tick}}")
        print("host", hs)
        # Eingabe des Clients kommt beim Host an
        cpid = st["me"]
        x0 = await host.evaluate(f"()=>{{const p=window.__sf.session.sim.players.get({cpid});p.prot=1e9;return p.cx}}")
        await cl.evaluate("()=>{const i=window.__sf.input;i.ax=1;i.ay=0;}")
        await cl.wait_for_timeout(2000)
        x1 = await host.evaluate(f"()=>window.__sf.session.sim.players.get({cpid}).cx")
        print("client moved on host:", round(x1-x0))
        # Teilen und Item vom Client
        await host.evaluate(f"()=>{{const s=window.__sf.session.sim;const p=s.players.get({cpid});p.cells[0].m=400;p.item=1;}}")
        await cl.wait_for_timeout(300)
        await cl.click("#b-split"); await cl.wait_for_timeout(600)
        n = await cl.evaluate("()=>window.__sf.world.myCells"); print("client cells after split", n)
        await cl.click("#b-item", force=True); await cl.wait_for_timeout(400)
        print("client item after use", await cl.evaluate("()=>window.__sf.world.item"), await host.evaluate(f"()=>window.__sf.session.sim.players.get({cpid}).fx.turbo>0"))
        # Dot-Konsistenz
        same = await host.evaluate("()=>{const s=window.__sf.session.sim;return [s.dotX[5],s.dotY[5],s.dotX[777],s.dotY[777]].map(v=>Math.round(v*4)/4)}")
        cd = await cl.evaluate("()=>{const d=window.__sf.world.dots;return [d.x[5],d.y[5],d.x[777],d.y[777]]}")
        print("dots equal", same==cd, same, cd)
        await cl.screenshot(path="/tmp/10-client.png"); await host.screenshot(path="/tmp/11-host.png")
        # Host frisst Client
        await host.evaluate(f"()=>{{const s=window.__sf.session.sim;const a=s.players.get(window.__sf.world.me),c=s.players.get({cpid});c.prot=0;a.prot=0;for(const k of s.cells.filter(z=>z.pid!==a.pid&&z.pid!==c.pid)){{}};a.cells[0].m=9000;a.cells[0].x=c.cx;a.cells[0].y=c.cy;}}")
        await cl.wait_for_timeout(2000)
        print("client alive after eaten:", await cl.evaluate("()=>window.__sf.world.alive"), "death screen:", await cl.evaluate("()=>!document.getElementById('s-death').classList.contains('hidden')"))
        await cl.screenshot(path="/tmp/12-death.png")
        await cl.click("#death-again"); await cl.wait_for_timeout(2500)
        print("client alive after respawn:", await cl.evaluate("()=>window.__sf.world.alive"))
        await host.click("#b-menu"); await host.wait_for_timeout(400); await host.screenshot(path="/tmp/13-hostpause.png")
        await host.click("#pause-leave"); await cl.wait_for_timeout(1500)
        print("client back home:", await cl.evaluate("()=>!document.getElementById('s-home').classList.contains('hidden')"), await cl.evaluate("()=>document.getElementById('toasts').innerText"))
        # falscher Code
        await cl.click("#go-join"); await cl.fill("#join-code","ZZZZZ"); await cl.dispatch_event("#join-code","input"); await cl.click("#join-start")
        await cl.wait_for_function("()=>document.getElementById('join-msg').textContent.length>0", timeout=20000)
        print("wrong code msg:", await cl.evaluate("()=>document.getElementById('join-msg').textContent"))
        print("ERRS", errs[:10])
        await b.close()
asyncio.run(main())
