const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const push=require('../services/push');const webpush=require('web-push');

test('push endpoints must belong to HTTPS browser push services',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/x','https://updates.push.services.mozilla.com/wpush/v2/x','https://web.push.apple.com/x','https://wns2-par02p.notify.windows.com/x'])assert.equal(push.validPushEndpoint(endpoint),true);
 for(const endpoint of ['https://127.0.0.1/x','http://fcm.googleapis.com/x','https://fcm.googleapis.com.evil.test/x','https://evil.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:123/x','javascript:alert(1)'])assert.equal(push.validPushEndpoint(endpoint),false);
});
test('invalid push subscriptions are rejected before writing to the DB',async()=>{
 const db={run:()=>{throw new Error('must not write');}};
 await assert.rejects(push.saveSubscription(db,{id:1},{endpoint:'https://127.0.0.1',keys:{p256dh:'a',auth:'b'}},''),{status:400});
 await assert.rejects(push.saveSubscription(db,{id:1},{endpoint:'https://fcm.googleapis.com/x',keys:{p256dh:'a',auth:'b'}},''),{status:400});
});
test('push delivery counts successes and removes expired subscriptions',async()=>{
 const original=webpush.sendNotification;const keys=webpush.generateVAPIDKeys();const removed=[];
 const db={get:async()=>({value:JSON.stringify(keys)}),all:async()=>[{id:1,endpoint:'https://fcm.googleapis.com/ok'},{id:2,endpoint:'https://fcm.googleapis.com/expired'},{id:3,endpoint:'https://127.0.0.1/private'}],run:async(sql,params)=>{removed.push(params[0]);}};
 let requests=0;
 webpush.sendNotification=async(sub,body,options)=>{requests++;assert.equal(options.timeout,10000);if(sub.endpoint.endsWith('expired'))throw {statusCode:410};};
 try{assert.equal(await push.sendToUser(db,1,{}),1);assert.equal(requests,2);assert.deepEqual(removed,[2]);}finally{webpush.sendNotification=original;}
});
test('notification and service worker links reject external URLs and executable schemes',()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');const c=vm.createContext({URL,window:{location:{origin:'https://example.test'}}});
 vm.runInContext(source.slice(source.indexOf('function safeNotifLink'),source.indexOf('async function handleNotifClick')),c);
 assert.equal(c.safeNotifLink('calendario.html'),'https://example.test/calendario.html');
 for(const url of ['javascript:alert(1)','//evil.test','https://evil.test'])assert.equal(c.safeNotifLink(url),'');
 const sw=fs.readFileSync(require.resolve('../sw.js'),'utf8');const worker=vm.createContext({URL,self:{location:{origin:'https://example.test'}}});
 vm.runInContext(sw.slice(sw.indexOf('function absoluteUrl'),sw.indexOf("self.addEventListener('push'")),worker);
 assert.equal(worker.absoluteUrl('javascript:alert(1)'),'https://example.test/dashboard.html');
});

test('reminder throttling allows new calendar items later in the same day',async()=>{
 const {runCalendarReminders}=require('../services/notifications');
 const original=Date.now;let time=original();Date.now=()=>time;
 let queries=0;const db={all:async()=>{queries++;return [];}};
 try{await runCalendarReminders(db,{id:999,role:'admin'});await runCalendarReminders(db,{id:999,role:'admin'});assert.equal(queries,1);time+=6*60000;await runCalendarReminders(db,{id:999,role:'admin'});assert.equal(queries,2);}finally{Date.now=original;}
});

for (const scenario of ['cancel', 'failure', 'success']) {
  test('clear notification UI: ' + scenario, async () => {
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    let calls = 0;
    const context = vm.createContext({
      confirm: () => scenario !== 'cancel', AbortSignal,
      apiFetch: async () => { calls++; return { status: scenario === 'failure' ? 503 : 200 }; },
      renderNotifications: () => {}, notifStatus: () => {}, showToast: () => {}
    });
    vm.runInContext('let notifMutation=false, notifRevision=0, notifUnread=2, notifItems=[{id:1},{id:2}];' + source.slice(source.indexOf('async function clearNotifications()'), source.indexOf('/* ---------- AVISOS PUSH')), context);
    await context.clearNotifications();
    assert.equal(calls, scenario === 'cancel' ? 0 : 1);
    assert.equal(vm.runInContext('notifItems.length', context), scenario === 'success' ? 0 : 2);
    assert.equal(vm.runInContext('notifUnread', context), scenario === 'success' ? 0 : 2);
    assert.equal(vm.runInContext('notifMutation', context), false);
  });
}
