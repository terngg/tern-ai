import type { Credential, ProviderId } from './types.js';
import type { ProviderError } from './errors.js';
export interface KeyState extends Credential { status:'ready'|'cooldown'|'invalid'|'blocked'; failureCount:number; cooldownUntil:number; lastUsedAt:number; lastSuccessAt:number }
/** Selection and updates are synchronous: concurrent promises cannot select against stale cursors. */
export class ApiKeyPool {
  private readonly keys: KeyState[];
  private readonly cursors = new Map<ProviderId,number>();
  constructor(credentials:Credential[],private readonly now:()=>number=Date.now) {
    this.keys=credentials.map(c=>({...c,status:'ready',failureCount:0,cooldownUntil:0,lastUsedAt:0,lastSuccessAt:0}));
  }
  snapshot():KeyState[] { this.refresh(); return this.keys.map(c=>({...c})); }
  private refresh():void { for(const c of this.keys) if(c.status==='cooldown' && c.cooldownUntil<=this.now()) c.status='ready'; }
  select(provider:ProviderId,tried:ReadonlySet<string>=new Set()):KeyState|undefined {
    this.refresh(); const keys=this.keys.filter(c=>c.provider===provider); const start=this.cursors.get(provider)||0;
    for(let i=0;i<keys.length;i++) {
      const index=(start+i)%keys.length;const c=keys[index];
      if(c?.status==='ready' && !tried.has(c.id)) {this.cursors.set(provider,(index+1)%keys.length);c.lastUsedAt=this.now();return {...c};}
    }
    return undefined;
  }
  success(id:string):void { const c=this.keys.find(c=>c.id===id);if(c){c.lastSuccessAt=this.now();c.failureCount=0;} }
  failure(id:string,error:ProviderError):void {
    const c=this.keys.find(c=>c.id===id);if(!c)return;c.failureCount++;
    // A later completion from a concurrent request must not revive an invalid key.
    if(c.status==='invalid')return;
    if(error.kind==='auth') c.status='invalid';
    else if(error.kind==='billing' || error.kind==='permission') c.status='blocked';
    else if(error.kind==='rate_limit' || error.kind==='quota') {
      c.status='cooldown';
      c.cooldownUntil=this.now()+Math.max(1000,error.retryAfterMs ?? Math.min(120_000,30_000*2**Math.min(2,c.failureCount-1)));
    }
  }
}
