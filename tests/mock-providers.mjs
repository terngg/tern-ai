// Test-only HTTP interception exercises the real Google SDK and OpenRouter adapters.
// No network, secrets, headers, or prompt transcripts are written by this fixture.
let generation = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const gemini = url.includes('generativelanguage.googleapis.com');
  const router = url.startsWith('https://openrouter.ai/');
  if (!gemini && !router) throw new Error('Unexpected mock endpoint');
  const key = headers.get(gemini ? 'x-goog-api-key' : 'authorization') || '';
  const error = (status, message) => Response.json({error:{code:status,message}}, {status, headers:{'retry-after':'60'}});
  if(key.includes('invalid')) return error(gemini ? 400 : 401, 'API key not valid. secret: ' + key);
  if(key.includes('limited')) return error(429,'RESOURCE_EXHAUSTED quota: ' + key);
  if(process.env.TERN_TEST_GEMINI_DOWN && gemini) return error(503,'server unavailable');
  if(process.env.TERN_TEST_ROUTER_DOWN && router) return error(503,'server unavailable');
  if(url.includes('missing-model')) return error(404,'model not found');
  if(!url.includes(':generateContent') && !url.includes(':streamGenerateContent') && !url.endsWith('/chat/completions')) {
    if(gemini && /\/models(?:\?|$)/.test(url))return Response.json({models:[{name:'models/gemini-3.8-flash',displayName:'Gemini Flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-mock-second',displayName:'Mock second model',supportedGenerationMethods:['generateContent']}]});
    if(gemini)return Response.json({name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']});
    if(url.endsWith('/key'))return Response.json({data:{label:'mock'}});
    return Response.json({data:[{id:'openrouter/free',name:'Free',pricing:{prompt:'0',completion:'0'}}]});
  }
  if(gemini && process.env.TERN_TEST_EXPECT_GEMINI_MODEL && !url.includes('/'+process.env.TERN_TEST_EXPECT_GEMINI_MODEL.split(',')[generation]+':'))return error(400,'Incorrect selected model');
  generation++;
  const body=JSON.parse(String(init?.body));
  const stream=gemini ? url.includes('streamGenerateContent') : body.stream;
  const frame=(text,stop=false)=>gemini
    ? {candidates:[{content:{parts:[{text}],role:'model'},...(stop?{finishReason:'STOP'}:{})}]}
    : {choices:[stream?{delta:{content:text},finish_reason:stop?'stop':null}:{message:{content:text},finish_reason:'stop'}]};
  if((process.env.TERN_TEST_PARTIAL && generation===1) || (process.env.TERN_TEST_GEMINI_STREAM_BREAK && gemini && stream)) return new Response('data: '+JSON.stringify(frame('BROKEN_PARTIAL_RESPONSE'))+'\n\n',{headers:{'content-type':'text/event-stream'}});
  const text='```lua\nprint("'+(gemini?'gemini':'openrouter')+'")\n```';
  if(!stream)return Response.json(frame(text,true));
  return new Response('data: '+JSON.stringify(frame(text,true))+'\n\n'+(gemini?'':'data: [DONE]\n\n'),{headers:{'content-type':'text/event-stream'}});
};
