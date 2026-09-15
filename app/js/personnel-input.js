// Attendee input boundary: segment entries without guessing anyone's name parts.
function parsePersonnelInput(raw,mode='suggested'){
  raw=String(raw??'');
  const normalized=raw.replace(/\r\n?/g,'\n');
  let entries=[],rule='',notice='';
  if(mode==='text')return{raw,mode,entries:[],rule:'Text as written',notice:'No person count is inferred. Your text prints together, including line breaks.'};
  if(mode==='spaces'){
    entries=normalized.split(/\s+/);rule='Every word is an entry';
    notice='Use this only when every word is a separate surname. Full names would be split into separate entries.';
  }else if(mode==='lines'||normalized.trim().includes('\n')){
    entries=normalized.split('\n');rule='One entry per line';
    notice='Commas, spaces and & inside each line stay with that entry.';
  }else if(normalized.includes(';')){
    entries=normalized.split(';');rule='Semicolons separate entries';
    notice='Commas and spaces stay within each entry. Check the list below.';
  }else{
    entries=normalized.split(/,|\s+&\s+/);rule='Commas and spaced & separate entries';
    notice='Check the split. For “Doe, John”, use one entry per line so the comma stays inside the name.';
  }
  entries=entries.map(value=>value.trim()).filter(Boolean);
  const ambiguous=mode==='suggested'&&entries.length===1&&/\s/.test(entries[0]);
  if(ambiguous)notice='Spaces stay inside an entry. If these are several surnames, separate at spaces or add line breaks.';
  if(!entries.length)notice='No attendee entries yet.';
  const seen=new Set(),duplicates=[];
  for(const entry of entries){const key=entry.toLocaleLowerCase();if(seen.has(key))duplicates.push(entry);seen.add(key);}
  return{raw,mode,entries,rule,notice,ambiguous,duplicates};
}
if(typeof module!=='undefined')module.exports={parsePersonnelInput};
