import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
import {FAQ_TOPICS} from '../shared/faq.ts';
const start='/* NERIX_FAQ_BUNDLE_START */',end='/* NERIX_FAQ_BUNDLE_END */';
const source=await readFile(new URL('../shared/faq.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,removeComments:true}}).outputText;
const widget=new URL('../public/chat-widget.js',import.meta.url);
let existing=await readFile(widget,'utf8');
if(existing.includes(start)){
  const from=existing.indexOf(start),to=existing.indexOf(end,from);
  if(to<0)throw new Error('Incomplete FAQ bundle marker.');
  existing=existing.slice(0,from)+existing.slice(to+end.length).replace(/^\s*\n/,'');
}
await writeFile(widget,`${start}\n(function(){const exports={};\n${js}\nwindow.NERIX_FAQ=exports;})();\n${end}\n${existing}`);
const catalog='# Nerix Global customer FAQ catalog\n\nThese approved preset answers are shared by the connected chat API and the standalone website widget. They require no OpenAI requests. Edit `shared/faq.ts` and run `npm run build` to regenerate the public widget and this catalog. Free-form Site settings knowledge controls AI responses; it does not rewrite preset answers.\n\n'+FAQ_TOPICS.map(item=>`## ${item.question}\n\n${item.answer}\n`).join('\n');
await writeFile(new URL('../docs/CUSTOMER-FAQ.md',import.meta.url),catalog);
console.log(`Prepared ${FAQ_TOPICS.length} customer FAQ topics for the website widget and catalog.`);
