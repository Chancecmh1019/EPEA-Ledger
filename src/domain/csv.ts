export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c === '"') { if (quoted && text[i+1] === '"') { field += '"'; i++; } else if (quoted || !field) quoted = !quoted; else throw new Error('Unexpected CSV quote'); }
    else if (c === ',' && !quoted) { row.push(field); field=''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if(c==='\r'&&text[i+1]==='\n')i++; row.push(field); if(row.some(Boolean))rows.push(row); row=[];field=''; }
    else field += c;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(field || row.length) { row.push(field); rows.push(row); }
  const header=rows.shift()??[];
  if(new Set(header).size!==header.length)throw new Error('Duplicate CSV columns');
  return rows.map((r,i)=>{if(r.length!==header.length)throw new Error('CSV column mismatch at row '+(i+2));return Object.fromEntries(header.map((h,j)=>[h,r[j]]));});
}
export function normalizeExportDate(value:string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}$/.test(value)) return value.replace(' ','T').replace(/([+-]\d{2})$/, '$1:00').replace(/\.([0-9]{3})[0-9]+/, '.$1');
  return value;
}
