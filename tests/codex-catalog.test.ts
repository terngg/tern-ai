import test from "node:test";
import assert from "node:assert/strict";
import { discoverCodexModels } from "../src/companion/adapters/codex-catalog.js";
import { parseCodexModels } from "../src/companion/adapters/codex-stream.js";

const server = (body: string) => [
  "-e",
  `const rl=require('node:readline').createInterface({input:process.stdin});const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');let ready=false;rl.on('line',line=>{const q=JSON.parse(line);if(q.method==='initialize'){send({id:q.id,result:{}});return}if(q.method==='initialized'){ready=true;return}${body}});`,
];
const model = (id: string) => ({
  model: id,
  displayName: id,
  hidden: false,
  defaultReasoningEffort: "low",
  supportedReasoningEfforts: [
    { reasoningEffort: "low" },
    { reasoningEffort: "ultra" },
    { reasoningEffort: "private" },
  ],
  secret: "private-token",
});

test("Codex official discovery completes handshake, follows every cursor and strips non-public metadata", async () => {
  const data = [model("page-one"), model("page-two")];
  const models = await discoverCodexModels(
    process.execPath,
    3000,
    server(`
    if(!ready || q.method!=='model/list' || q.params.includeHidden!==false)process.exit(1);
    const data=${JSON.stringify(data)};const page=q.params.cursor?1:0;
    send({method:'notification',params:{secret:'private-token'}});
    send({id:q.id,result:{data:[data[page],{...data[page],model:'hidden',hidden:true}],nextCursor:page===0?'next-page':null}});
  `),
  );
  assert.deepEqual(
    models,
    data.map((m) => ({
      id: m.model,
      name: m.displayName,
      defaultReasoningEffort: "low",
      reasoningEfforts: ["low", "ultra"],
    })),
  );
  assert.ok(!JSON.stringify(models).includes("private"));
});
test("Codex discovery returns no partial catalog on protocol error, timeout or repeated cursor", async () => {
  for (const body of [
    `send({id:q.id,error:{message:'private-token'}})`,
    `send({id:q.id,result:{data:[${JSON.stringify(model("partial"))}],nextCursor:'repeat'}})`,
    `process.stdout.write('invalid-private-token\\n')`,
    `send(null)`,
    ``,
  ])
    assert.deepEqual(
      await discoverCodexModels(process.execPath, 150, server(body)),
      [],
    );
  assert.deepEqual(
    await discoverCodexModels("/nonexistent/tern-codex", 150),
    [],
  );
});
test("Codex legacy catalog preserves actual effort modes including Ultra without internal entries", () => {
  assert.deepEqual(
    parseCodexModels(
      JSON.stringify({
        models: [
          null,
          {
            slug: "real-model",
            visibility: "list",
            default_reasoning_level: "ultra",
            supported_reasoning_levels: [
              { effort: "ultra" },
              { effort: "low" },
              { effort: "ultra" },
              { effort: "fake" },
            ],
          },
        ],
      }),
    ),
    [
      {
        id: "real-model",
        name: "real-model",
        defaultReasoningEffort: "ultra",
        reasoningEfforts: ["ultra", "low"],
      },
    ],
  );
});

test("Codex CLI invocation keeps the exact model ID and passes only its supported selected effort", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { CodexAdapter } = await import("../src/companion/adapters/codex.js");
  const dir = await mkdtemp(join(tmpdir(), "tern-codex-test-"));
  const bin = join(dir, "fake-codex");
  await writeFile(bin, `#!${process.execPath}\nconst a=process.argv.slice(2);const model=a[a.indexOf('-m')+1];const effort=a.find(x=>x.startsWith('model_reasoning_effort='));process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({model,effort})}})+'\\n'+JSON.stringify({type:'turn.completed'}));`, {mode:0o700});
  class TestCodex extends CodexAdapter {
    override async detect(){return {installed:true,path:bin}}
    override async listModels(){return [{id:"actual-model",name:"Actual model",defaultReasoningEffort:"low",reasoningEfforts:["low","ultra"]}]}
  }
  try {
    const adapter = new TestCodex();
    for (const reasoningEffort of [undefined, "ultra"]) {
      const events=[];for await (const event of adapter.chat({id:"test",model:"actual-model",reasoningEffort,messages:[{role:"user",content:"hello"}]})) events.push(event);
      assert.deepEqual(JSON.parse(events[0]!.token!),{model:"actual-model",effort:`model_reasoning_effort=${JSON.stringify(reasoningEffort || "low")}`});
      assert.equal(events.at(-1)!.type,"done");
    }
    for(const request of [{model:"actual-model",reasoningEffort:"high"},{model:"fake-model",reasoningEffort:"low"}]){
      const events=[];for await(const event of adapter.chat({id:"test",...request,messages:[]}))events.push(event);
      assert.equal(events.length,1);assert.equal(events[0]!.category,"bad_request");
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
