import * as XLSX from 'xlsx';
self.onmessage=(e:MessageEvent)=>{try{
  const book=XLSX.read(e.data.bytes,{type:'array',sheetRows:1002,cellFormula:true,cellHTML:false,cellDates:false});
  const sheet=book.Sheets[e.data.sheet||book.SheetNames[0]];
  for(const [key,cell] of Object.entries(sheet)){if(!key.startsWith('!')&&cell?.f)delete sheet[key];}
  const raw=XLSX.utils.sheet_to_json<any[]>(sheet,{header:1,defval:'',raw:false,blankrows:false});
  const headers=(raw.shift()||[]).map((x:any)=>String(x).trim());
  if(!headers.length||headers.length>100||new Set(headers).size!==headers.length||headers.some(h=>!h))throw new Error('Use 1–100 unique, non-empty column headers.');
  if(raw.length>1000)throw new Error('Split your spreadsheet into batches of at most 1,000 rows.');
  const rows=raw.map(values=>Object.fromEntries(headers.map((h,i)=>[h,String(values[i]??'')])));
  self.postMessage({headers,rows,sheets:book.SheetNames});
}catch(e){self.postMessage({error:(e as Error).message});}};
